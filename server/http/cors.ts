/**
 * CORS по списку разрешённых адресов.
 *
 * В предыдущей версии стояло Access-Control-Allow-Origin: *, то есть запрос к
 * нашему серверу мог отправить любой сайт из браузера жертвы. Здесь адрес
 * сверяется со списком из переменной окружения, и неизвестному источнику
 * заголовок не выдаётся вовсе — браузер сам отклонит ответ.
 */

const ALLOWED_HEADERS = "authorization, content-type, x-neuroizium-signature";

export interface CorsPolicy {
  readonly allowedOrigins: readonly string[];
}

/** Разбирает список адресов из переменной окружения: адреса через запятую. */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter((origin) => origin.length > 0);
}

export function isOriginAllowed(origin: string | null, policy: CorsPolicy): boolean {
  if (origin === null) return false;
  return policy.allowedOrigins.includes(origin.replace(/\/$/, ""));
}

/**
 * Заголовки для ответа. Для неразрешённого источника возвращается пустой набор:
 * ответ дойдёт, но браузер не отдаст его скрипту чужого сайта.
 */
export function corsHeaders(origin: string | null, policy: CorsPolicy): Record<string, string> {
  if (!isOriginAllowed(origin, policy) || origin === null) return {};

  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": ALLOWED_HEADERS,
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-max-age": "86400",
    // Кэш обязан учитывать источник: иначе один ответ уедет другому сайту.
    vary: "Origin",
  };
}

/** Предполётный запрос браузера. Возвращает null, если это не он. */
export function handlePreflight(request: Request, policy: CorsPolicy): Response | null {
  if (request.method !== "OPTIONS") return null;

  const origin = request.headers.get("origin");
  if (!isOriginAllowed(origin, policy)) {
    return new Response(null, { status: 403 });
  }
  return new Response(null, { status: 204, headers: corsHeaders(origin, policy) });
}
