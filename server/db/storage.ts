/**
 * Хранилище картинок Supabase.
 *
 * Бакет закрытый: политик доступа к нему нет, как и у таблиц. Значит, наружу
 * уходит не постоянная ссылка, а подписанная и недолгая — иначе картинки
 * неопубликованного плана лежали бы в интернете по угадываемому пути.
 *
 * Как и rest.ts, это обычный fetch без клиентской библиотеки: серверный код
 * обязан проверяться компилятором и запускаться в тестах.
 */
import { DbError, type DbConfig } from "./rest.ts";

export const IMAGE_BUCKET = "post-images";

/**
 * Сколько живёт ссылка. Час — это заведомо больше, чем человек проведёт на
 * странице плана, и заведомо меньше, чем срок, за который ссылка разойдётся по
 * перепискам. Страница открывается заново — подписывается заново.
 */
export const SIGNED_URL_TTL_SECONDS = 3600;

function headers(config: DbConfig, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: config.serviceKey,
    authorization: `Bearer ${config.serviceKey}`,
    ...extra,
  };
}

/**
 * Путь картинки в бакете. Клиент в начале пути — чтобы по одному имени было
 * видно, чьё это, и чтобы удаление клиента однажды свелось к удалению папки.
 * Случайная часть — чтобы новая картинка к тому же посту не подменялась в кеше
 * браузера прежней.
 */
export function imagePath(licenseId: string, planId: string, postNumber: number): string {
  const unique = crypto.randomUUID().slice(0, 8);
  return `${licenseId}/${planId}/${String(postNumber)}-${unique}.png`;
}

export async function uploadImage(
  config: DbConfig,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const response = await fetch(`${config.url}/storage/v1/object/${IMAGE_BUCKET}/${path}`, {
    method: "POST",
    headers: headers(config, { "content-type": contentType, "cache-control": "3600" }),
    body: bytes as BodyInit,
  });

  if (!response.ok) {
    throw new DbError("загрузка картинки", response.status, await response.text());
  }
}

interface SignedRow {
  readonly path?: string;
  readonly signedURL?: string;
  readonly error?: string | null;
}

/**
 * Подписанные ссылки на несколько путей сразу. По одному запросу на картинку
 * страница плана с тридцатью постами открывалась бы тридцатью обращениями к
 * хранилищу.
 */
export async function signImageUrls(
  config: DbConfig,
  paths: readonly string[],
): Promise<Record<string, string>> {
  if (paths.length === 0) return {};

  const response = await fetch(`${config.url}/storage/v1/object/sign/${IMAGE_BUCKET}`, {
    method: "POST",
    headers: headers(config, { "content-type": "application/json" }),
    body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS, paths }),
  });

  if (!response.ok) {
    throw new DbError("подпись ссылок на картинки", response.status, await response.text());
  }

  const rows = (await response.json()) as readonly SignedRow[];
  const signed: Record<string, string> = {};
  for (const row of rows) {
    // Пропавшую картинку пропускаем молча: план должен открыться и без неё.
    if (typeof row.path !== "string" || typeof row.signedURL !== "string") continue;
    signed[row.path] = `${config.url}/storage/v1${row.signedURL}`;
  }
  return signed;
}
