/**
 * Что доступам нужно от базы. Интерфейсы описаны здесь, реализация на
 * Postgres — в server/db. Такое разделение позволяет проверить всю логику
 * доступа тестами без живой базы, а не «на глазок в проде».
 */
import type { AttemptStore } from "./rate-limit.ts";

export interface LicenseRecord {
  readonly id: string;
  /** Видимый номер клиента. С ключом не связан. */
  readonly clientId: string;
  readonly disabled: boolean;
  /** Последний день подписки в формате ГГГГ-ММ-ДД. */
  readonly subscriptionUntil: string;
  readonly monthlyLimit: number;
}

export interface SessionRecord {
  readonly licenseId: string;
  /** Момент истечения в миллисекундах. */
  readonly expiresAtMs: number;
}

export interface LicenseStore {
  findByKeyHash(keyHash: string): Promise<LicenseRecord | null>;
  findById(licenseId: string): Promise<LicenseRecord | null>;
  /** Одна активная сессия на ключ: прежняя удаляется в этой же операции. */
  replaceSession(licenseId: string, tokenHash: string, expiresAtMs: number): Promise<void>;
  findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  deleteSession(tokenHash: string): Promise<void>;
}

/** Итог резервирования: либо резерв, либо исчерпанный лимит. */
export type ReservationResult = { readonly id: string } | { readonly reason: "limit-reached" };

export interface QuotaStore {
  /**
   * Создаёт резерв, если сумма подтверждённых и уже зарезервированных
   * генераций за месяц меньше лимита. Операция обязана быть атомарной:
   * два одновременных запроса не должны вместе перебрать лимит.
   */
  reserve(licenseId: string, monthKey: string): Promise<ReservationResult>;
  commit(reservationId: string): Promise<void>;
  release(reservationId: string): Promise<void>;
  usedThisMonth(licenseId: string, monthKey: string): Promise<number>;
}

export interface PaymentStore {
  /** Уже обработанный платёж повторно не проводится. */
  wasProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string, licenseId: string, paidUntil: string): Promise<void>;
}

export interface AdminLogStore {
  record(action: string, actorLabel: string, details: Record<string, unknown>): Promise<void>;
}

export interface AccessStores {
  readonly licenses: LicenseStore;
  readonly attempts: AttemptStore;
  readonly quota: QuotaStore;
  readonly adminLog: AdminLogStore;
}
