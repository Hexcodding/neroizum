/**
 * Месячная квота генераций.
 *
 * Порядок: резерв до генерации, подтверждение после успеха, освобождение при
 * любом сбое. В третьей версии счётчик увеличивался до вызова модели, поэтому
 * ошибка провайдера стоила клиенту генерации — и клиент шёл в поддержку.
 *
 * Резерв нужен ещё и против одновременных запросов: если считать только
 * подтверждённые генерации, два параллельных запроса на последней генерации
 * месяца пройдут оба.
 */
import { GenerationError } from "../generation/errors.ts";
import type { QuotaGuard } from "../generation/orchestrate.ts";
import type { QuotaStore } from "./store.ts";

/** Ключ месяца из даты ГГГГ-ММ-ДД. Квота считается по календарному месяцу. */
export function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export interface QuotaContext {
  readonly store: QuotaStore;
  readonly licenseId: string;
  /** Сегодняшняя дата в формате ГГГГ-ММ-ДД. */
  readonly today: string;
}

/**
 * Обёртка для оркестратора генерации. Он ничего не знает про лицензии и базу —
 * только про три действия: резерв, подтверждение, освобождение.
 */
export function createQuotaGuard(context: QuotaContext): QuotaGuard {
  const month = monthKey(context.today);
  let reservationId: string | null = null;

  return {
    async reserve(): Promise<void> {
      const result = await context.store.reserve(context.licenseId, month);
      if ("reason" in result) {
        throw new GenerationError("QUOTA_EXCEEDED", `Лимит месяца ${month} исчерпан`);
      }
      reservationId = result.id;
    },

    async commit(): Promise<void> {
      if (reservationId === null) return;
      await context.store.commit(reservationId);
      reservationId = null;
    },

    async release(): Promise<void> {
      if (reservationId === null) return;
      await context.store.release(reservationId);
      reservationId = null;
    },
  };
}

export interface QuotaStatus {
  readonly used: number;
  readonly limit: number;
  readonly left: number;
}

/** Что показать клиенту: сколько генераций осталось в этом месяце. */
export async function readQuotaStatus(
  context: QuotaContext,
  monthlyLimit: number,
): Promise<QuotaStatus> {
  const used = await context.store.usedThisMonth(context.licenseId, monthKey(context.today));
  return { used, limit: monthlyLimit, left: Math.max(0, monthlyLimit - used) };
}
