/**
 * Точка входа «сделать план». Ею же делается продолжение уже готового плана:
 * отдельная точка входа означала бы свой CORS, свой лимит попыток и свою
 * возможность забыть проверку доступа.
 *
 * Порядок проверок здесь и есть безопасность этой точки: сначала кто перед нами
 * (по токену сессии, а не по тому, что клиент сообщил о себе), потом лимит
 * частоты, только потом квота и модель. Промпт при этом не покидает сервер: в
 * ответ уходят посты, но не текст задания для модели.
 *
 * Ответ отдаётся потоком. Пользователь видит посты по мере готовности, а не
 * пустой экран на минуту, и может остановить генерацию, закрыв соединение.
 */
import type { GeneratedPost } from "../../../contracts/index.ts";
import { resolveSession } from "../../access/activation.ts";
import type { ActivationContext } from "../../access/activation.ts";
import { checkLimits, generationLimits, recordAttempt } from "../../access/rate-limit.ts";
import type { AttemptStore } from "../../access/rate-limit.ts";
import { createQuotaGuard } from "../../access/quota.ts";
import type { QuotaContext } from "../../access/quota.ts";
import { generatePlan } from "../../generation/orchestrate.ts";
import type { GenerationResult, OrchestrateOptions } from "../../generation/orchestrate.ts";
import { buildContinuation, readContinuationCommand } from "../../generation/continuation.ts";
import type { ContinuationOffsets } from "../../generation/continuation.ts";
import { GenerationError, toGenerationError } from "../../generation/errors.ts";
import { errorPayload, errorResponse, jsonResponse, readJson, tooManyAttempts } from "../respond.ts";
import type { ResponseContext } from "../respond.ts";
import { createEventStream, streamHeaders } from "../stream.ts";

/** План, который продлевают. Больше о нём здесь знать нечего. */
export interface PlanToContinue {
  readonly request: unknown;
  readonly posts: readonly GeneratedPost[];
}

export interface GenerateDeps {
  readonly session: Omit<ActivationContext, "clientAddress">;
  readonly attempts: AttemptStore;
  readonly cascade: OrchestrateOptions["cascade"];
  /** Хранилище квоты и сегодняшняя дата: месяц считается по календарю. */
  readonly quota: Omit<QuotaContext, "licenseId">;
  /** Куда сохранить готовый план. Возвращает его идентификатор. */
  savePlan(licenseId: string, request: unknown, result: unknown): Promise<string>;
  /** План для продолжения. Чужой план не находится — проверка в условии запроса. */
  loadPlan(licenseId: string, planId: string): Promise<PlanToContinue | null>;
  /** Дописать новые посты в тот же план вместо создания второго. */
  appendPosts(licenseId: string, planId: string, result: unknown): Promise<void>;
}

const NO_SESSION = {
  code: "NO_SESSION",
  message: "Сессия закончилась. Введите ключ доступа ещё раз — сохранённые планы на месте.",
  retryable: false,
  fields: [],
} as const;

/** Готовая к запуску работа: что просим у модели и куда денем результат. */
interface PreparedRun {
  readonly request: unknown;
  readonly continuation?: ContinuationOffsets;
  persist(result: GenerationResult): Promise<string>;
}

async function prepareRun(
  body: Record<string, unknown>,
  licenseId: string,
  deps: GenerateDeps,
): Promise<PreparedRun> {
  const command = readContinuationCommand(body);
  if (command === null) {
    return { request: body, persist: (result) => deps.savePlan(licenseId, body, result) };
  }

  const stored = await deps.loadPlan(licenseId, command.planId);
  if (stored === null) {
    throw new GenerationError("PLAN_NOT_FOUND", "план не найден у этого клиента");
  }

  const continued = buildContinuation(stored.request, stored.posts, command.periodDays);
  return {
    request: continued.request,
    continuation: continued,
    persist: async (result) => {
      await deps.appendPosts(licenseId, command.planId, result);
      return command.planId;
    },
  };
}

export async function handleGenerate(
  request: Request,
  sessionToken: string | null,
  deps: GenerateDeps,
  response: ResponseContext,
): Promise<Response> {
  const session = await resolveSession(sessionToken, deps.session);
  if (!session.ok) {
    return jsonResponse({ error: NO_SESSION }, 401, response);
  }

  const limits = generationLimits(session.license.id);
  const decision = await checkLimits(deps.attempts, limits, deps.session.nowMs);
  if (!decision.allowed) {
    return tooManyAttempts(decision.retryAfterMs, response);
  }

  let prepared: PreparedRun;
  try {
    const body = await readJson(request);
    await recordAttempt(deps.attempts, limits, deps.session.nowMs);
    // Заявка собирается до открытия потока: «такого плана нет» — обычный отказ
    // с кодом ответа, а не событие внутри успешно начавшейся работы.
    prepared = await prepareRun(body, session.license.id, deps);
  } catch (error) {
    return errorResponse(error, response);
  }

  const { body: stream, handle } = createEventStream();
  const abort = new AbortController();
  // Закрытая вкладка обязана останавливать работу: иначе мы платим за посты,
  // которые никто не получит.
  request.signal.addEventListener("abort", () => {
    abort.abort();
  });

  void runGeneration(prepared, session.license.id, deps, { handle, signal: abort.signal });

  return new Response(stream, { status: 200, headers: streamHeaders(response.cors) });
}

interface RunSink {
  readonly handle: ReturnType<typeof createEventStream>["handle"];
  readonly signal: AbortSignal;
}

async function runGeneration(
  prepared: PreparedRun,
  licenseId: string,
  deps: GenerateDeps,
  sink: RunSink,
): Promise<void> {
  try {
    const result = await generatePlan(prepared.request, {
      cascade: deps.cascade,
      signal: sink.signal,
      continuation: prepared.continuation,
      quota: createQuotaGuard({ ...deps.quota, licenseId }),
      onProgress: (event) => {
        sink.handle.send({
          type: "progress",
          readyPosts: event.readyPosts,
          totalPosts: event.totalPosts,
        });
        sink.handle.send({ type: "posts", posts: event.posts });
      },
    });

    const planId = await prepared.persist(result);
    sink.handle.send({ type: "done", result: { ...result, planId } });
  } catch (error) {
    const failure = toGenerationError(error);
    console.error(`[${failure.code}] ${failure.message}`);
    sink.handle.send({ type: "error", ...errorPayload(failure) });
  } finally {
    sink.handle.close();
  }
}
