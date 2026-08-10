/**
 * Оркестрация генерации: от проверенного запроса до готового плана.
 *
 * Почему план собирается частями, а не одним запросом: тридцать постов не
 * влезают в ответ модели, и при обрыве терялось всё. Части по восемь постов
 * дают видимый прогресс — посты появляются по мере готовности, — и каждая
 * следующая часть знает предыдущие, поэтому не повторяет их.
 *
 * Квота списывается только после успеха. Порядок: резервируем слот, генерируем,
 * подтверждаем. Любой сбой — резерв освобождается, попытка остаётся у клиента.
 * В третьей версии списание шло до генерации, и каждая ошибка модели стоила
 * клиенту генерации.
 */
import {
  buildSchedule,
  toPreviousPostSummary,
  validateGenerationRequest,
  type GeneratedPost,
  type GenerationRequest,
  type PreviousPostSummary,
  type ScheduleSlot,
} from "@contracts";
import { buildPrompt, PROMPT_VERSION } from "../prompt/index";
import { PLAN_RESPONSE_SCHEMA } from "../prompt/core/output-contract";
import { CONTENT_MIX_BY_GOAL, expectedTypeCounts } from "../prompt/blocks/funnel";
import { GenerationError, toGenerationError } from "./errors";
import { callWithCascade, type CascadeOptions } from "./provider/cascade";
import { parsePlanResponse } from "./parse";
import { normalizePosts } from "./normalize";
import { checkPlanQuality, type QualityReport } from "./quality";

/** Постов в одном запросе к модели. */
const BATCH_SIZE = 8;
const TEMPERATURE = 0.85;
const MAX_OUTPUT_TOKENS = 8192;
const REQUEST_TIMEOUT_MS = 90_000;
/** Страховка от бесконечного добора недостающих постов. */
const MAX_REQUESTS_MULTIPLIER = 2;

export interface ProgressEvent {
  readonly readyPosts: number;
  readonly totalPosts: number;
  readonly posts: readonly GeneratedPost[];
}

/**
 * Резервирование квоты. Реализация появится в слое доступа; здесь только шов,
 * чтобы порядок «резерв — генерация — подтверждение» был заложен сразу.
 */
export interface QuotaGuard {
  reserve(): Promise<void>;
  commit(): Promise<void>;
  release(): Promise<void>;
}

export interface OrchestrateOptions {
  readonly cascade: CascadeOptions;
  readonly signal?: AbortSignal;
  readonly onProgress?: (event: ProgressEvent) => void;
  readonly quota?: QuotaGuard;
}

export interface GenerationResult {
  readonly posts: readonly GeneratedPost[];
  readonly promptVersion: string;
  /** Пользователь остановил генерацию: посты сохранены, план неполный. */
  readonly stopped: boolean;
  readonly quality: QualityReport;
  /** Сколько частей пришлось спасать из оборванного ответа. */
  readonly rescuedBatches: number;
}

function batchSlots(slots: readonly ScheduleSlot[]): ScheduleSlot[][] {
  const batches: ScheduleSlot[][] = [];
  for (let index = 0; index < slots.length; index += BATCH_SIZE) {
    batches.push(slots.slice(index, index + BATCH_SIZE));
  }
  return batches;
}

interface BatchOutcome {
  readonly posts: readonly GeneratedPost[];
  readonly rescued: boolean;
}

async function generateBatch(
  request: GenerationRequest,
  slots: readonly ScheduleSlot[],
  previousPosts: readonly PreviousPostSummary[],
  options: OrchestrateOptions,
  repairReasons: readonly string[] = [],
): Promise<BatchOutcome> {
  const prompt = buildPrompt({ ...request, previousPosts }, slots, { repairReasons });

  const response = await callWithCascade(
    {
      prompt: prompt.text,
      schema: PLAN_RESPONSE_SCHEMA,
      temperature: TEMPERATURE,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      timeoutMs: REQUEST_TIMEOUT_MS,
      signal: options.signal,
    },
    options.cascade,
  );

  const parsed = parsePlanResponse(response.text);
  return {
    posts: normalizePosts(parsed.items, slots),
    rescued: parsed.rescued || response.truncated,
  };
}

/** Один тихий перезапрос постов, не прошедших проверку качества. */
async function repairDefects(
  request: GenerationRequest,
  posts: readonly GeneratedPost[],
  slots: readonly ScheduleSlot[],
  quality: QualityReport,
  options: OrchestrateOptions,
): Promise<readonly GeneratedPost[]> {
  const brokenNumbers = new Set(quality.defects.map((defect) => defect.number));
  const brokenSlots = slots.filter((slot) => brokenNumbers.has(slot.number));
  if (brokenSlots.length === 0 || brokenSlots.length > posts.length / 2) {
    // Если плохих постов больше половины, дело не в отдельных постах:
    // перезапрос не поможет, отдаём как есть с замечаниями.
    return posts;
  }

  const context = posts
    .filter((post) => !brokenNumbers.has(post.number))
    .map(toPreviousPostSummary);
  const reasons = quality.defects.flatMap((defect) =>
    defect.reasons.map((reason) => `пост №${String(defect.number)}: ${reason}`),
  );

  try {
    const repaired = await generateBatch(request, brokenSlots, context, options, reasons);
    const byNumber = new Map(repaired.posts.map((post) => [post.number, post]));
    return posts.map((post) => byNumber.get(post.number) ?? post);
  } catch {
    // Перезапрос — улучшение, а не обязательство: молчим и отдаём что есть.
    return posts;
  }
}

function buildResult(
  request: GenerationRequest,
  posts: readonly GeneratedPost[],
  stopped: boolean,
  rescuedBatches: number,
): GenerationResult {
  return {
    posts,
    promptVersion: PROMPT_VERSION,
    stopped,
    rescuedBatches,
    quality: checkPlanQuality({
      posts,
      expectedTypeCounts: expectedTypeCounts(posts.length, CONTENT_MIX_BY_GOAL[request.goal]),
      infoPlanMode: request.infoPlanMode,
    }),
  };
}

interface RunState {
  readonly posts: GeneratedPost[];
  rescuedBatches: number;
  stopped: boolean;
}

/**
 * Последовательный проход по частям плана. Каждая часть знает предыдущие, а
 * недополученные слоты возвращаются в очередь, а не теряются.
 */
async function runBatches(
  request: GenerationRequest,
  slots: readonly ScheduleSlot[],
  options: OrchestrateOptions,
  state: RunState,
): Promise<void> {
  const context: PreviousPostSummary[] = [...request.previousPosts];
  const queue = batchSlots(slots);
  let requestsLeft = queue.length * MAX_REQUESTS_MULTIPLIER;

  while (queue.length > 0 && requestsLeft > 0) {
    const batch = queue.shift();
    if (batch === undefined) break;
    requestsLeft -= 1;

    if (options.signal?.aborted === true) {
      state.stopped = true;
      return;
    }

    const outcome = await generateBatch(request, batch, context, options);
    if (outcome.rescued) state.rescuedBatches += 1;

    state.posts.push(...outcome.posts);
    context.push(...outcome.posts.map(toPreviousPostSummary));
    options.onProgress?.({
      readyPosts: state.posts.length,
      totalPosts: slots.length,
      posts: state.posts,
    });

    const done = new Set(outcome.posts.map((post) => post.number));
    const missing = batch.filter((slot) => !done.has(slot.number));
    if (missing.length > 0) queue.unshift(missing);
  }
}

function scheduleFor(request: GenerationRequest): ScheduleSlot[] {
  return buildSchedule({
    startDate: request.startDate,
    periodDays: request.periodDays,
    postsPerWeek: request.postsPerWeek,
    platforms: request.platforms,
    startNumber: request.previousPosts.length + 1,
    platformOffset: request.previousPosts.length,
  });
}

export async function generatePlan(
  rawRequest: unknown,
  options: OrchestrateOptions,
): Promise<GenerationResult> {
  const validation = validateGenerationRequest(rawRequest);
  if (!validation.ok) {
    throw new GenerationError("INVALID_REQUEST", "Запрос не прошёл проверку", validation.errors);
  }

  const request = rawRequest as GenerationRequest;
  const slots = scheduleFor(request);
  const state: RunState = { posts: [], rescuedBatches: 0, stopped: false };

  await options.quota?.reserve();

  try {
    await runBatches(request, slots, options, state);

    if (state.posts.length === 0) {
      throw new GenerationError("BAD_RESPONSE", "Ни одного поста получить не удалось");
    }

    const draft = buildResult(request, state.posts, state.stopped, state.rescuedBatches);
    const finalPosts = state.stopped
      ? state.posts
      : await repairDefects(request, state.posts, slots, draft.quality, options);

    await options.quota?.commit();
    return buildResult(request, finalPosts, state.stopped, state.rescuedBatches);
  } catch (error) {
    const failure = toGenerationError(error);
    await options.quota?.release();

    // Остановка пользователем — не сбой: сохраняем то, что успели сделать.
    if (failure.code === "STOPPED_BY_USER" && state.posts.length > 0) {
      return buildResult(request, state.posts, true, state.rescuedBatches);
    }
    throw failure;
  }
}
