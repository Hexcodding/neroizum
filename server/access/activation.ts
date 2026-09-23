/**
 * Активация лицензии и проверка сессии.
 *
 * Что здесь исправлено против предыдущей версии:
 * — лимит попыток есть (в v3 у активации его не было вовсе);
 * — неизвестный и отключённый ключ дают один и тот же ответ, поэтому по коду
 *   ошибки нельзя выяснить, существует ключ или нет;
 * — попытка записывается всегда, даже удачная: иначе тот, кто иногда угадывает,
 *   получает бесконечный перебор.
 *
 * Про истёкшую подписку ответ всё-таки отдельный. Это осознанное отступление:
 * такой ответ можно получить, только предъявив ключ целиком, то есть уже зная
 * секрет. Скрывать от клиента, что он просто не оплатил продление, — значит
 * гарантированно отправить его в поддержку.
 */
import { hashSecret, hasLicenseKeyShape, normalizeLicenseKey } from "./keys.ts";
import { checkLimits, activationLimits, recordAttempt } from "./rate-limit.ts";
import type { AttemptStore } from "./rate-limit.ts";
import type { LicenseRecord, LicenseStore } from "./store.ts";

export type ActivationFailure =
  | { readonly reason: "denied" }
  | { readonly reason: "subscription-ended"; readonly endedOn: string }
  | { readonly reason: "too-many-attempts"; readonly retryAfterMs: number };

export interface ActivationSuccess {
  readonly sessionToken: string;
  readonly clientId: string;
  readonly monthlyLimit: number;
  readonly subscriptionUntil: string;
  readonly expiresAtMs: number;
}

export type ActivationResult =
  | ({ readonly ok: true } & ActivationSuccess)
  | ({ readonly ok: false } & ActivationFailure);

/** Срок жизни сессии. По истечении клиент вводит ключ заново. */
export const SESSION_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;
const SESSION_TOKEN_BYTES = 32;

export interface ActivationContext {
  readonly licenses: LicenseStore;
  readonly attempts: AttemptStore;
  /** Адрес клиента. Ненадёжен, поэтому не единственная корзина лимита. */
  readonly clientAddress: string;
  readonly pepper: string;
  readonly nowMs: number;
  /** Сегодняшняя дата в формате ГГГГ-ММ-ДД для проверки подписки. */
  readonly today: string;
}

function generateSessionToken(): string {
  const bytes = new Uint8Array(SESSION_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isUsable(license: LicenseRecord): boolean {
  return !license.disabled;
}

export async function activateLicense(
  rawKey: string,
  context: ActivationContext,
): Promise<ActivationResult> {
  const normalized = normalizeLicenseKey(rawKey);
  // Хеш считается даже у ключа неверной формы: он нужен как корзина лимита,
  // и одинаковый путь исполнения не даёт судить о ключе по времени ответа.
  const keyHash = await hashSecret(normalized, context.pepper);
  const limits = activationLimits(context.clientAddress, keyHash);

  const decision = await checkLimits(context.attempts, limits, context.nowMs);
  if (!decision.allowed) {
    return { ok: false, reason: "too-many-attempts", retryAfterMs: decision.retryAfterMs };
  }
  await recordAttempt(context.attempts, limits, context.nowMs);

  if (!hasLicenseKeyShape(normalized)) {
    return { ok: false, reason: "denied" };
  }

  const license = await context.licenses.findByKeyHash(keyHash);
  if (license === null || !isUsable(license)) {
    return { ok: false, reason: "denied" };
  }

  if (license.subscriptionUntil < context.today) {
    return { ok: false, reason: "subscription-ended", endedOn: license.subscriptionUntil };
  }

  const sessionToken = generateSessionToken();
  const tokenHash = await hashSecret(sessionToken, context.pepper);
  const expiresAtMs = context.nowMs + SESSION_LIFETIME_MS;
  await context.licenses.replaceSession(license.id, tokenHash, expiresAtMs);

  return {
    ok: true,
    sessionToken,
    clientId: license.clientId,
    monthlyLimit: license.monthlyLimit,
    subscriptionUntil: license.subscriptionUntil,
    expiresAtMs,
  };
}

export type SessionCheck =
  | { readonly ok: true; readonly license: LicenseRecord }
  | { readonly ok: false; readonly reason: "no-session" | "expired" | "revoked" };

/**
 * Кто перед нами. Личность клиента определяется только по токену сессии.
 * Ничему, что клиент передал о себе сам, доверять нельзя.
 */
export async function resolveSession(
  sessionToken: string | null,
  context: Omit<ActivationContext, "clientAddress">,
): Promise<SessionCheck> {
  if (sessionToken === null || sessionToken.length === 0) {
    return { ok: false, reason: "no-session" };
  }

  const tokenHash = await hashSecret(sessionToken, context.pepper);
  const session = await context.licenses.findSessionByTokenHash(tokenHash);
  if (session === null) {
    return { ok: false, reason: "no-session" };
  }

  if (session.expiresAtMs <= context.nowMs) {
    await context.licenses.deleteSession(tokenHash);
    return { ok: false, reason: "expired" };
  }

  const license = await context.licenses.findById(session.licenseId);
  if (license === null || !isUsable(license) || license.subscriptionUntil < context.today) {
    return { ok: false, reason: "revoked" };
  }

  return { ok: true, license };
}
