/**
 * Тонкий доступ к Postgres через встроенный REST-интерфейс Supabase.
 *
 * Почему без клиентской библиотеки: серверный код обязан проверяться обычным
 * компилятором и запускаться в тестах, а библиотека тянется специальным
 * импортом, который понимает только Deno. Здесь всё делается через fetch —
 * значит, тот же код читается компилятором, линтером и человеком.
 *
 * Работа идёт служебным ключом, поэтому защита на уровне строк не мешает. Этот
 * ключ существует только в секретах проекта и в браузер не попадает никогда.
 */

export interface DbConfig {
  /** Адрес проекта Supabase. */
  readonly url: string;
  /** Служебный ключ. Только на сервере. */
  readonly serviceKey: string;
}

export class DbError extends Error {
  constructor(operation: string, status: number, body: string) {
    super(`${operation}: база ответила ${String(status)} ${body}`);
    this.name = "DbError";
  }
}

/**
 * Ключи нового вида (`sb_secret_...`) — не JWT, и в заголовке Authorization
 * платформа отвечает «Invalid JWT». Старые ключи-JWT наоборот привычно ждут
 * Authorization. Различаем по виду ключа, а не по настройке: настройку забудут
 * поменять при переходе, и база начнёт отказывать без внятной причины.
 */
function isJwtKey(serviceKey: string): boolean {
  return !serviceKey.startsWith("sb_");
}

function headers(config: DbConfig, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: config.serviceKey,
    ...(isJwtKey(config.serviceKey) ? { authorization: `Bearer ${config.serviceKey}` } : {}),
    "content-type": "application/json",
    ...extra,
  };
}

async function request(
  config: DbConfig,
  operation: string,
  path: string,
  init: RequestInit,
): Promise<unknown> {
  const response = await fetch(`${config.url}/rest/v1/${path}`, init);
  if (!response.ok) {
    throw new DbError(operation, response.status, await response.text());
  }
  const text = await response.text();
  return text.length === 0 ? null : (JSON.parse(text) as unknown);
}

/** Выборка строк. Условия передаются в языке PostgREST, например "id=eq.7". */
export async function select<T>(
  config: DbConfig,
  table: string,
  query: string,
): Promise<readonly T[]> {
  const rows = await request(config, `выборка ${table}`, `${table}?${query}`, {
    method: "GET",
    headers: headers(config),
  });
  return Array.isArray(rows) ? (rows as T[]) : [];
}

export async function selectOne<T>(
  config: DbConfig,
  table: string,
  query: string,
): Promise<T | null> {
  const rows = await select<T>(config, table, `${query}&limit=1`);
  return rows[0] ?? null;
}

export async function insert<T>(
  config: DbConfig,
  table: string,
  row: Record<string, unknown>,
  options: { readonly returning?: boolean; readonly onConflict?: string } = {},
): Promise<T | null> {
  const suffix = options.onConflict === undefined ? "" : `?on_conflict=${options.onConflict}`;
  const prefer =
    (options.returning === true ? "return=representation" : "return=minimal") +
    (options.onConflict === undefined ? "" : ",resolution=ignore-duplicates");

  const result = await request(config, `вставка в ${table}`, `${table}${suffix}`, {
    method: "POST",
    headers: headers(config, { prefer }),
    body: JSON.stringify(row),
  });

  return Array.isArray(result) ? ((result[0] as T | undefined) ?? null) : null;
}

export async function insertMany(
  config: DbConfig,
  table: string,
  rows: readonly Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;
  await request(config, `вставка в ${table}`, table, {
    method: "POST",
    headers: headers(config, { prefer: "return=minimal" }),
    body: JSON.stringify(rows),
  });
}

export async function update(
  config: DbConfig,
  table: string,
  query: string,
  changes: Record<string, unknown>,
): Promise<void> {
  await request(config, `обновление ${table}`, `${table}?${query}`, {
    method: "PATCH",
    headers: headers(config, { prefer: "return=minimal" }),
    body: JSON.stringify(changes),
  });
}

export async function remove(config: DbConfig, table: string, query: string): Promise<void> {
  await request(config, `удаление из ${table}`, `${table}?${query}`, {
    method: "DELETE",
    headers: headers(config, { prefer: "return=minimal" }),
  });
}

/** Вызов функции базы. Именно так делаются неделимые операции вроде резерва. */
export async function rpc<T>(
  config: DbConfig,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await request(config, `функция ${name}`, `rpc/${name}`, {
    method: "POST",
    headers: headers(config),
    body: JSON.stringify(args),
  });
  return result as T;
}
