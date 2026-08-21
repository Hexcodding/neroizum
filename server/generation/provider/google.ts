/**
 * Общее для всех обращений к Google: адрес, настройки безопасности, перевод
 * ответа об отказе в нашу ошибку и один сигнал прерывания на таймаут и на
 * остановку пользователем.
 *
 * Вынесено из вызова текстовой модели, когда рядом появился вызов модели
 * картинок. Дубль был бы опаснее многословия: разъехавшиеся пороги фильтров
 * означали бы, что текст про бар генерируется, а картинка к нему отклоняется,
 * и причина этого не видна ниоткуда.
 */
import { GenerationError } from "../errors.ts";

export const GOOGLE_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const SAFETY_CATEGORIES = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
] as const;

/**
 * Блокируем только явно опасное. Планы контента для малого бизнеса регулярно
 * задевают темы, которые срабатывают на средних порогах: медицина, юридические
 * услуги, бары. Ложная блокировка выглядит для клиента как поломка продукта.
 */
export const SAFETY_SETTINGS = SAFETY_CATEGORIES.map((category) => ({
  category,
  threshold: "BLOCK_ONLY_HIGH",
}));

export function failByStatus(status: number, body: string): GenerationError {
  if (status === 429) {
    return new GenerationError("RATE_LIMITED", `Gemini 429: ${body.slice(0, 300)}`);
  }
  if (status === 400 && body.includes("API_KEY_INVALID")) {
    // Ключ настраиваем мы, а не клиент: для него это наша внутренняя поломка.
    return new GenerationError("INTERNAL", "Ключ Gemini недействителен");
  }
  if (status >= 500 || status === 408) {
    return new GenerationError("PROVIDER_UNAVAILABLE", `Gemini ${String(status)}`);
  }
  return new GenerationError(
    "PROVIDER_UNAVAILABLE",
    `Gemini ${String(status)}: ${body.slice(0, 300)}`,
  );
}

export interface Interruptible {
  readonly timeoutMs: number;
  /** Остановка пользователем. */
  readonly signal?: AbortSignal;
}

/** Таймаут и остановка пользователем — один сигнал для fetch. */
export function withTimeout(request: Interruptible): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new GenerationError("TIMEOUT", "Провайдер не ответил за отведённое время"));
  }, request.timeoutMs);

  const onExternalAbort = () => {
    controller.abort(new GenerationError("STOPPED_BY_USER", "Генерация остановлена"));
  };
  request.signal?.addEventListener("abort", onExternalAbort, { once: true });

  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

/**
 * Причина прерывания — уже готовая ошибка: таймаут или остановка. Без этого
 * наружу ушло бы «сеть недоступна», и совет в сообщении оказался бы неверным.
 */
export function toProviderError(error: unknown, signal: AbortSignal): GenerationError {
  if (signal.aborted && signal.reason instanceof GenerationError) {
    return signal.reason;
  }
  if (error instanceof GenerationError) return error;
  return new GenerationError("PROVIDER_UNAVAILABLE", `Сеть недоступна: ${String(error)}`);
}
