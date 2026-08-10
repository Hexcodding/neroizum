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
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEUROIZIUM_PEPPER",
  "NEUROIZIUM_WEBHOOK_SECRET",
  "NEUROIZIUM_ADMIN_PASSWORD_HASH",
  "NEUROIZIUM_ADMIN_TOKEN_SECRET",
  "GEMINI_API_KEY",
  "NEUROIZIUM_ALLOWED_ORIGINS",
] as const;

export type EnvReader = (name: string) => string | undefined;

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
    db: { url: value("SUPABASE_URL"), serviceKey: value("SUPABASE_SERVICE_ROLE_KEY") },
    pepper: value("NEUROIZIUM_PEPPER"),
    webhookSecret: value("NEUROIZIUM_WEBHOOK_SECRET"),
    adminPasswordHash: value("NEUROIZIUM_ADMIN_PASSWORD_HASH"),
    adminTokenSecret: value("NEUROIZIUM_ADMIN_TOKEN_SECRET"),
    geminiApiKey: value("GEMINI_API_KEY"),
    allowedOrigins: origins,
  };
}
