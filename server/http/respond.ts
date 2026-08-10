/**
 * Ответы наружу.
 *
 * Одно правило на весь файл: клиент получает только то, что мы сформулировали
 * сами. Ни текста исключения, ни имени модели, ни строки от провайдера —
 * в предыдущей версии наружу уходило «Edge Function returned a non-2xx status
 * code», и это попадало прямо в интерфейс.
 */
import { GenerationError, toGenerationError } from "../generation/errors.ts";

export interface ResponseContext {
  readonly cors: Record<string, string>;
}

export function jsonResponse(
  body: unknown,
  status: number,
  context: ResponseContext,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Ответы с данными клиента нигде не кэшируются.
      "cache-control": "no-store",
      ...context.cors,
      ...extraHeaders,
    },
  });
}

/**
 * Ошибка для клиента. Техническая причина уходит в лог сервера, наружу — код,
 * человеческий текст и признак «есть ли смысл повторять».
 */
export function errorResponse(cause: unknown, context: ResponseContext): Response {
  const error = toGenerationError(cause);

  // Лог сервера — единственное место, где остаётся техническая формулировка.
  console.error(`[${error.code}] ${error.message}`);

  return jsonResponse(
    {
      error: {
        code: error.code,
        message: error.userMessage,
        retryable: error.retryable,
        fields: error.fields,
      },
    },
    // Остановку по кнопке пользователя нельзя отдавать как успех запроса.
    error.httpStatus === 200 ? 499 : error.httpStatus,
    context,
  );
}

export function tooManyAttempts(retryAfterMs: number, context: ResponseContext): Response {
  const seconds = Math.ceil(retryAfterMs / 1000);
  const minutes = Math.max(1, Math.round(seconds / 60));

  return jsonResponse(
    {
      error: {
        code: "TOO_MANY_ATTEMPTS",
        message: `Слишком много попыток подряд. Попробуйте снова через ${String(minutes)} мин.`,
        retryable: true,
        fields: [],
      },
    },
    429,
    context,
    { "retry-after": String(seconds) },
  );
}

/**
 * Адрес клиента для лимитов. Заголовки от прокси подставляются самим клиентом,
 * поэтому берётся первый адрес в цепочке и рядом всегда проверяются другие
 * корзины — по ключу и общая. Одному этому значению доверять нельзя.
 */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim() ?? "";
  if (first.length > 0) return first;
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

/** Разбор тела запроса. Мусор вместо JSON — это ошибка запроса, а не сбой. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const raw = await request.text();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error("тело запроса не объект");
    }
    return parsed as Record<string, unknown>;
  } catch {
    throw new GenerationError("INVALID_REQUEST", "тело запроса не разобралось как JSON");
  }
}
