/**
 * Вход администратора.
 *
 * Пароль в базе не лежит: сервер знает только его хеш из переменной окружения.
 * Сессия администратора не хранится в базе, а подписана секретом сервера —
 * тогда нечего украсть и нечего чистить по расписанию. Срок жизни зашит в сам
 * токен и подписан вместе с ним, поэтому продлить его снаружи нельзя.
 *
 * Лимит попыток обязателен: в предыдущей версии счётчик жил в памяти изолята
 * и обнулялся при холодном старте, то есть пароль можно было спокойно
 * перебирать.
 */
import { hmacHex } from "../access/hmac.ts";
import { hashSecret, secureCompare } from "../access/keys.ts";
import { adminLoginLimits, checkLimits, HOUR_MS, recordAttempt } from "../access/rate-limit.ts";
import type { AttemptStore } from "../access/rate-limit.ts";

export const ADMIN_SESSION_LIFETIME_MS = 8 * HOUR_MS;

export interface AdminAuthConfig {
  /** Хеш пароля: hashSecret(пароль, pepper). Задаётся в секретах проекта. */
  readonly passwordHash: string;
  readonly pepper: string;
  /** Секрет для подписи токена. Отдельный от pepper. */
  readonly tokenSecret: string;
}

export interface AdminLoginInput {
  readonly password: string;
  /** Адрес клиента, как его определил сервер. */
  readonly clientAddress: string;
  readonly nowMs: number;
}

export type AdminLoginResult =
  | { readonly ok: true; readonly token: string; readonly expiresAtMs: number }
  | { readonly ok: false; readonly reason: "denied" | "rate-limited"; readonly retryAfterMs: number };

export async function adminLogin(
  input: AdminLoginInput,
  deps: { readonly attempts: AttemptStore; readonly config: AdminAuthConfig },
): Promise<AdminLoginResult> {
  const limits = adminLoginLimits(input.clientAddress);

  const decision = await checkLimits(deps.attempts, limits, input.nowMs);
  if (!decision.allowed) {
    return { ok: false, reason: "rate-limited", retryAfterMs: decision.retryAfterMs };
  }

  // Попытка записывается до проверки пароля: иначе удачные попытки не считаются,
  // и тот, кто иногда угадывает, перебирает бесконечно.
  await recordAttempt(deps.attempts, limits, input.nowMs);

  const given = await hashSecret(input.password, deps.config.pepper);
  if (!secureCompare(given, deps.config.passwordHash)) {
    return { ok: false, reason: "denied", retryAfterMs: 0 };
  }

  const expiresAtMs = input.nowMs + ADMIN_SESSION_LIFETIME_MS;
  return { ok: true, token: await signToken(expiresAtMs, deps.config.tokenSecret), expiresAtMs };
}

async function signToken(expiresAtMs: number, secret: string): Promise<string> {
  const payload = String(expiresAtMs);
  return `${payload}.${await hmacHex(payload, secret)}`;
}

/** Токен считается годным только при верной подписи и неистёкшем сроке. */
export async function verifyAdminToken(
  token: string,
  config: AdminAuthConfig,
  nowMs: number,
): Promise<boolean> {
  const separator = token.indexOf(".");
  if (separator <= 0) return false;

  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  const expected = await hmacHex(payload, config.tokenSecret);
  if (!secureCompare(expected, signature)) return false;

  const expiresAtMs = Number(payload);
  return Number.isFinite(expiresAtMs) && expiresAtMs > nowMs;
}
