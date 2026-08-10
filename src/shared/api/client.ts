/**
 * Вызов серверных функций.
 *
 * Здесь и только здесь браузер обращается к серверу. Токен сессии передаётся
 * заголовком Authorization и нигде не появляется в адресе: адреса попадают в
 * историю браузера, логи прокси и чужие скриншоты.
 */
import { toApiError, networkError, ApiError } from "./errors";

const BASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export type FunctionName = "activate" | "generate-plan" | "plans" | "admin";

function endpoint(name: FunctionName, path = ""): string {
  if (BASE_URL === undefined || BASE_URL.length === 0) {
    throw new ApiError(
      "NOT_CONFIGURED",
      "Приложение не настроено: не указан адрес сервера. Это ошибка установки, а не ваша.",
      false,
      [],
    );
  }
  return `${BASE_URL}/functions/v1/${name}${path}`;
}

function headers(token: string | null): Record<string, string> {
  const result: Record<string, string> = { "content-type": "application/json" };
  if (ANON_KEY !== undefined && ANON_KEY.length > 0) result.apikey = ANON_KEY;
  if (token !== null) result.authorization = `Bearer ${token}`;
  return result;
}

export interface CallOptions {
  readonly token?: string | null;
  readonly signal?: AbortSignal;
  readonly path?: string;
}

/** Обычный вызов с разбором JSON. Ошибки приходят готовым текстом от сервера. */
export async function callFunction<T>(
  name: FunctionName,
  body: unknown,
  options: CallOptions = {},
): Promise<T> {
  const response = await fetchOrThrow(name, body, options);

  const text = await response.text();
  const payload: unknown = text.length === 0 ? null : safeParse(text);

  if (!response.ok) throw toApiError(payload);
  return payload as T;
}

/** Тот же вызов, но ответ нужен потоком: план приходит частями. */
export async function openStream(
  name: FunctionName,
  body: unknown,
  options: CallOptions = {},
): Promise<ReadableStream<Uint8Array>> {
  const response = await fetchOrThrow(name, body, options);

  if (!response.ok) {
    const text = await response.text();
    throw toApiError(text.length === 0 ? null : safeParse(text));
  }
  if (response.body === null) throw networkError();
  return response.body;
}

async function fetchOrThrow(
  name: FunctionName,
  body: unknown,
  options: CallOptions,
): Promise<Response> {
  try {
    return await fetch(endpoint(name, options.path), {
      method: "POST",
      headers: headers(options.token ?? null),
      body: JSON.stringify(body),
      signal: options.signal,
    });
  } catch (cause) {
    // Прерывание пользователем — не ошибка сети, и путать их нельзя.
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    if (cause instanceof ApiError) throw cause;
    throw networkError();
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
