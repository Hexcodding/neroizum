/**
 * Улучшение одного поста по просьбе человека.
 *
 * Это не отдельный путь генерации, а тот же самый, суженный до одного слота:
 * тот же промпт, та же схема ответа, та же нормализация. Второй путь означал бы
 * второй набор правил качества, который начнёт отставать от основного.
 *
 * Расписание при этом не пересчитывается: номер, дата и площадка берутся из
 * самого поста. Улучшение меняет текст, а не место поста в плане.
 */
import {
  validateGenerationRequest,
  weekdayName,
  type GeneratedPost,
  type GenerationRequest,
  type ScheduleSlot,
} from "../../contracts/index.ts";
import { buildPrompt } from "../prompt/index.ts";
import { toInstructionReason } from "../prompt/blocks/repair.ts";
import { PLAN_RESPONSE_SCHEMA } from "../prompt/core/output-contract.ts";
import { GenerationError } from "./errors.ts";
import { callWithCascade, type CascadeOptions } from "./provider/cascade.ts";
import { parsePlanResponse } from "./parse.ts";
import { normalizePosts } from "./normalize.ts";

/** Один пост, а не восемь: и бюджет ответа, и ожидание заметно короче. */
const MAX_OUTPUT_TOKENS = 8192;
const REQUEST_TIMEOUT_MS = 60_000;
/** Ниже, чем при сборке плана: человек просит поправить, а не удивить. */
const TEMPERATURE = 0.7;

export interface ImproveInput {
  /** Заявка из сохранённого плана: без неё пост потеряет голос бренда. */
  readonly request: unknown;
  readonly post: GeneratedPost;
  /** Просьба человека своими словами либо готовая формулировка из интерфейса. */
  readonly instruction: string;
}

export interface ImproveOptions {
  readonly cascade: CascadeOptions;
  readonly signal?: AbortSignal;
}

function slotOf(post: GeneratedPost): ScheduleSlot {
  return {
    number: post.number,
    date: post.date,
    weekday: weekdayName(post.date),
    platform: post.platform,
  };
}

export async function improvePost(
  input: ImproveInput,
  options: ImproveOptions,
): Promise<GeneratedPost> {
  // Заявка пришла из базы, а не из формы, и всё равно проверяется: план мог
  // быть сохранён прошлой версией продукта с другим набором полей.
  const validation = validateGenerationRequest(input.request);
  if (!validation.ok) {
    throw new GenerationError("INVALID_REQUEST", "заявка плана не прошла проверку");
  }
  const request = input.request as GenerationRequest;
  const slot = slotOf(input.post);

  // Предыстория плана сюда не передаётся: пост переписывается на своём месте,
  // а тридцать чужих заголовков в промпте стоили бы дороже пользы от них.
  const prompt = buildPrompt({ ...request, previousPosts: [] }, [slot], {
    repairReasons: [toInstructionReason(input.instruction)],
    currentPost: input.post.postContent,
  });

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
  const [improved] = normalizePosts(parsed.items, [slot]);
  if (improved === undefined || improved.postContent.length === 0) {
    throw new GenerationError("BAD_RESPONSE", "Модель не вернула переделанный пост");
  }
  return improved;
}
