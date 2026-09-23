/**
 * Ограничение попыток на публичных точках входа.
 *
 * В предыдущей версии у активации лицензии не было лимита вообще, а у входа
 * в админку счётчик жил в памяти изолята и обнулялся при холодном старте.
 * Плюс адрес клиента брался из заголовка, который клиент подставляет сам.
 *
 * Отсюда два решения:
 *
 * 1. Счётчики живут в базе, а не в памяти процесса.
 * 2. Проверяется не одна корзина, а несколько сразу. Подделав заголовок с
 *    адресом, злоумышленник обойдёт корзину по адресу — но не корзину по
 *    самому ключу и не общий лимит на точку входа. Достаточно сработать одной.
 */

export interface AttemptStore {
  /** Сколько попыток в этой корзине было не раньше указанного момента. */
  countSince(bucket: string, sinceMs: number): Promise<number>;
  record(bucket: string, atMs: number): Promise<void>;
}

export interface Limit {
  /** Имя корзины: точка входа плюс признак, например адрес или ключ. */
  readonly bucket: string;
  readonly maxAttempts: number;
  readonly windowMs: number;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  /** Через сколько имеет смысл повторить. Ноль, если попытка разрешена. */
  readonly retryAfterMs: number;
}

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;

/** Лимиты по точкам входа. Считаны с запасом: живой человек в них не попадает. */
export const LIMITS = {
  activation: { maxAttempts: 5, windowMs: 15 * MINUTE_MS },
  activationByKey: { maxAttempts: 10, windowMs: HOUR_MS },
  activationGlobal: { maxAttempts: 300, windowMs: HOUR_MS },
  adminLogin: { maxAttempts: 5, windowMs: 15 * MINUTE_MS },
  webhook: { maxAttempts: 120, windowMs: MINUTE_MS },
  generation: { maxAttempts: 20, windowMs: HOUR_MS },
} as const;

export async function checkLimits(
  store: AttemptStore,
  limits: readonly Limit[],
  now: number,
): Promise<RateLimitDecision> {
  let retryAfterMs = 0;

  for (const limit of limits) {
    const used = await store.countSince(limit.bucket, now - limit.windowMs);
    if (used >= limit.maxAttempts) {
      retryAfterMs = Math.max(retryAfterMs, limit.windowMs);
    }
  }

  return retryAfterMs > 0 ? { allowed: false, retryAfterMs } : { allowed: true, retryAfterMs: 0 };
}

/**
 * Попытка записывается всегда, независимо от того, удалась она или нет.
 * Считать только неудачные — значит разрешить бесконечный перебор тому, кто
 * иногда угадывает.
 */
export async function recordAttempt(
  store: AttemptStore,
  limits: readonly Limit[],
  now: number,
): Promise<void> {
  for (const limit of limits) {
    await store.record(limit.bucket, now);
  }
}

/** Корзины для активации: адрес, сам ключ и общая на точку входа. */
export function activationLimits(clientAddress: string, keyHash: string): Limit[] {
  return [
    { bucket: `activation:address:${clientAddress}`, ...LIMITS.activation },
    { bucket: `activation:key:${keyHash}`, ...LIMITS.activationByKey },
    { bucket: "activation:global", ...LIMITS.activationGlobal },
  ];
}

export function adminLoginLimits(clientAddress: string): Limit[] {
  return [{ bucket: `admin:address:${clientAddress}`, ...LIMITS.adminLogin }];
}

export function generationLimits(licenseId: string): Limit[] {
  return [{ bucket: `generation:license:${licenseId}`, ...LIMITS.generation }];
}
