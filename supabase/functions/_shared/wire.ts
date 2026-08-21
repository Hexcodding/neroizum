/**
 * Сборка зависимостей для точек входа.
 *
 * Каждая функция Supabase — это отдельный процесс, и в каждой пришлось бы
 * повторять одно и то же: прочитать секреты, собрать хранилища, вычислить
 * сегодняшнюю дату. Повторение здесь опасно не многословием, а тем, что при
 * правке легко забыть одно место из четырёх. Поэтому сборка одна.
 */
import { readServerConfig } from "../../../server/env.ts";
import type { ServerConfig } from "../../../server/env.ts";
import { corsHeaders, handlePreflight } from "../../../server/http/cors.ts";
import type { CorsPolicy } from "../../../server/http/cors.ts";
import type { ResponseContext } from "../../../server/http/respond.ts";
import {
  createAdminLogStore,
  createAttemptStore,
  createImageStore,
  createImprovementStore,
  createLicenseStore,
  createPaymentStore,
  createQuotaStore,
} from "../../../server/db/access-stores.ts";
import { createAdminLicenseStore } from "../../../server/db/admin-store.ts";

export interface Wiring {
  readonly config: ServerConfig;
  readonly policy: CorsPolicy;
  readonly licenses: ReturnType<typeof createLicenseStore>;
  readonly attempts: ReturnType<typeof createAttemptStore>;
  readonly quotaStore: ReturnType<typeof createQuotaStore>;
  /** Счётчик улучшений постов: своя таблица, тот же интерфейс. */
  readonly improvementStore: ReturnType<typeof createImprovementStore>;
  /** Счётчик картинок: третья таблица, интерфейс всё тот же. */
  readonly imageStore: ReturnType<typeof createImageStore>;
  readonly payments: ReturnType<typeof createPaymentStore>;
  readonly adminLog: ReturnType<typeof createAdminLogStore>;
  readonly adminLicenses: ReturnType<typeof createAdminLicenseStore>;
  /** Момент запроса. Берётся один раз, чтобы проверки не разъезжались. */
  readonly nowMs: number;
  readonly today: string;
}

export function wire(): Wiring {
  const config = readServerConfig((name) => Deno.env.get(name));
  const nowMs = Date.now();

  return {
    config,
    policy: { allowedOrigins: config.allowedOrigins },
    licenses: createLicenseStore(config.db),
    attempts: createAttemptStore(config.db),
    quotaStore: createQuotaStore(config.db),
    improvementStore: createImprovementStore(config.db),
    imageStore: createImageStore(config.db),
    payments: createPaymentStore(config.db),
    adminLog: createAdminLogStore(config.db),
    adminLicenses: createAdminLicenseStore(config.db),
    nowMs,
    today: new Date(nowMs).toISOString().slice(0, 10),
  };
}

/** Общее начало любой точки входа: предполёт, CORS и отказ на лишние методы. */
export function begin(
  request: Request,
  policy: CorsPolicy,
): { readonly response: ResponseContext; readonly early: Response | null } {
  const origin = request.headers.get("origin");
  const response: ResponseContext = { cors: corsHeaders(origin, policy) };

  const preflight = handlePreflight(request, policy);
  if (preflight !== null) return { response, early: preflight };

  if (request.method !== "POST") {
    return { response, early: new Response(null, { status: 405, headers: response.cors }) };
  }
  return { response, early: null };
}

/** Токен сессии клиента. Только из заголовка Authorization. */
export function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice("bearer ".length).trim();
  return token.length === 0 ? null : token;
}
