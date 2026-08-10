/**
 * Настройки сервера из переменных окружения.
 *
 * Чтение вынесено в чистую функцию с параметром-читателем: так его проверяют
 * тесты и так видно, что секреты берутся только здесь. Ни одного значения по
 * умолчанию для секретов нет — забытый секрет должен ронять функцию при старте,
 * а не тихо превращаться в пустую строку, которой всё «проверяется успешно».
 */
import { parseAllowedOrigins } from "./http/cors.ts";
import type { DbConfig } from "./db/rest.ts";

export interface ServerConfig {
  readonly db: DbConfig;
  /** Серверный секрет для хеширования ключей и токенов сессий. */
  readonly pepper: string;
  readonly webhookSecret: string;
  readonly adminPasswordHash: string;
  readonly adminTokenSecret: string;
  readonly geminiApiKey: string;
  readonly allowedOrigins: readonly string[];
}

const REQUIRED = [
  "SUPABASE_URL",
  "NEUROIZIUM_PEPPER",
  "NEUROIZIUM_WEBHOOK_SECRET",
  "NEUROIZIUM_ADMIN_PASSWORD_HASH",
  "NEUROIZIUM_ADMIN_TOKEN_SECRET",
  "GEMINI_API_KEY",
  "NEUROIZIUM_ALLOWED_ORIGINS",
] as const;

/** Имя ключа по умолчанию в новом наборе ключей проекта. */
const DEFAULT_KEY_NAME = "default";

export type EnvReader = (name: string) => string | undefined;

/**
 * Служебный ключ доступа к базе. Supabase переводит проекты с ключей-JWT
 * (`service_role`) на ключи вида `sb_secret_...`, и живут они в разных
 * переменных: старый — строкой в `SUPABASE_SERVICE_ROLE_KEY`, новый — словарём
 * в `SUPABASE_SECRET_KEYS`, где ключ по умолчанию назван `default`.
 *
 * Читаются оба, новый в приоритете. Старые ключи Supabase отключает до конца
 * 2026 года, а привязываться к одному варианту значит поймать отказ базы в тот
 * день, когда их выключат в панели.
 */
function readServiceKey(read: EnvReader): string {
  const raw = (read("SUPABASE_SECRET_KEYS") ?? "").trim();
  if (raw.length > 0) return pickSecretKey(raw);

  const legacy = (read("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (legacy.length === 0) {
    throw new Error(
      "Не задан служебный ключ базы: нужен SUPABASE_SECRET_KEYS или SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  return legacy;
}

function pickSecretKey(raw: string): string {
  const parsed = parseKeyMap(raw);
  const key = parsed[DEFAULT_KEY_NAME] ?? Object.values(parsed)[0];
  if (typeof key !== "string" || key.trim().length === 0) {
    throw new Error("SUPABASE_SECRET_KEYS не содержит ни одного ключа");
  }
  return key.trim();
}

function parseKeyMap(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("SUPABASE_SECRET_KEYS не разбирается как JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error('SUPABASE_SECRET_KEYS ожидается объектом вида {"default": "sb_secret_..."}');
  }
  return parsed as Record<string, unknown>;
}

export function readServerConfig(read: EnvReader): ServerConfig {
  const missing = REQUIRED.filter((name) => (read(name) ?? "").trim().length === 0);
  if (missing.length > 0) {
    throw new Error(`Не заданы обязательные секреты: ${missing.join(", ")}`);
  }

  const value = (name: string): string => (read(name) ?? "").trim();
  const origins = parseAllowedOrigins(value("NEUROIZIUM_ALLOWED_ORIGINS"));
  if (origins.length === 0) {
    throw new Error("NEUROIZIUM_ALLOWED_ORIGINS не содержит ни одного адреса");
  }

  return {
    db: { url: value("SUPABASE_URL"), serviceKey: readServiceKey(read) },
    pepper: value("NEUROIZIUM_PEPPER"),
    webhookSecret: value("NEUROIZIUM_WEBHOOK_SECRET"),
    adminPasswordHash: value("NEUROIZIUM_ADMIN_PASSWORD_HASH"),
    adminTokenSecret: value("NEUROIZIUM_ADMIN_TOKEN_SECRET"),
    geminiApiKey: value("GEMINI_API_KEY"),
    allowedOrigins: origins,
  };
}
