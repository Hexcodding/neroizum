/**
 * Каскад моделей и повторы с нарастающей паузой.
 *
 * Пользователь не должен знать, что первая модель была занята. В третьей
 * версии каскад был, но повторов не было вовсе: при ответе «слишком много
 * запросов» продукт сразу шёл к следующей модели, а когда заняты оказывались
 * все — сдавался. Пауза в секунду решает большинство таких случаев.
 */
import { GenerationError, toGenerationError } from "../errors";
import type { AiProvider, AiRequest, AiResponse } from "./types";

export interface CascadeOptions {
  readonly provider: AiProvider;
  /** Сколько раз пробовать одну модель, прежде чем перейти к следующей. */
  readonly attemptsPerModel?: number;
  readonly baseDelayMs?: number;
  /** Подменяется в тестах, чтобы не ждать по-настоящему. */
  readonly sleep?: (ms: number) => Promise<void>;
  /** Наблюдение за попытками: пишется в лог сервера, не показывается клиенту. */
  readonly onAttempt?: (info: AttemptInfo) => void;
}

export interface AttemptInfo {
  readonly model: string;
  readonly attempt: number;
  readonly outcome: "ok" | "retry" | "next-model" | "fail";
  readonly errorCode?: string;
}

const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 1000;

/** Ошибки, которые проходят сами: имеет смысл подождать и повторить. */
const TRANSIENT = new Set(["RATE_LIMITED", "PROVIDER_UNAVAILABLE"]);

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Decision = "throw" | "retry" | "next-model";

/**
 * Что делать с неудачей. Вынесено отдельно, чтобы решение читалось как правило,
 * а не как ветка внутри двойного цикла.
 */
function decide(error: GenerationError, attempt: number, attempts: number): Decision {
  if (error.code === "STOPPED_BY_USER") return "throw";
  // Своя поломка или отказ фильтров: другая модель не поможет.
  if (error.code !== "TIMEOUT" && !TRANSIENT.has(error.code)) return "throw";
  // Медленную модель не уговариваем — сразу пробуем следующую.
  if (error.code === "TIMEOUT") return "next-model";
  return attempt < attempts ? "retry" : "next-model";
}

interface Settings {
  readonly attempts: number;
  readonly baseDelay: number;
  readonly sleep: (ms: number) => Promise<void>;
}

/** Итог работы с одной моделью: ответ либо причина идти к следующей. */
type ModelOutcome =
  | { readonly kind: "ok"; readonly response: AiResponse }
  | { readonly kind: "next"; readonly error: GenerationError };

async function tryModel(
  model: string,
  request: AiRequest,
  options: CascadeOptions,
  settings: Settings,
): Promise<ModelOutcome> {
  let lastError = new GenerationError("PROVIDER_UNAVAILABLE", `Модель ${model} не отвечала`);

  for (let attempt = 1; attempt <= settings.attempts; attempt += 1) {
    if (request.signal?.aborted === true) {
      throw new GenerationError("STOPPED_BY_USER", "Генерация остановлена");
    }

    try {
      const response = await options.provider.call(model, request);
      options.onAttempt?.({ model, attempt, outcome: "ok" });
      return { kind: "ok", response };
    } catch (error) {
      lastError = toGenerationError(error);
      const decision = decide(lastError, attempt, settings.attempts);

      options.onAttempt?.({
        model,
        attempt,
        outcome: decision === "throw" ? "fail" : decision,
        errorCode: lastError.code,
      });

      if (decision === "throw") throw lastError;
      if (decision === "next-model") return { kind: "next", error: lastError };
      await settings.sleep(settings.baseDelay * 2 ** (attempt - 1));
    }
  }

  return { kind: "next", error: lastError };
}

export async function callWithCascade(
  request: AiRequest,
  options: CascadeOptions,
): Promise<AiResponse> {
  const settings: Settings = {
    attempts: options.attemptsPerModel ?? DEFAULT_ATTEMPTS,
    baseDelay: options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    sleep: options.sleep ?? defaultSleep,
  };

  let lastError = new GenerationError("PROVIDER_UNAVAILABLE", "Ни одна модель не ответила");

  for (const model of options.provider.models) {
    const outcome = await tryModel(model, request, options, settings);
    if (outcome.kind === "ok") return outcome.response;
    lastError = outcome.error;
  }

  throw lastError;
}
