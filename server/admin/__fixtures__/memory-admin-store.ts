/**
 * Админские хранилища в памяти. Нужны по той же причине, что и в доступах:
 * проверять выдачу и блокировку ключей на живой базе нельзя — ошибка в такой
 * проверке стоит чужого доступа.
 */
import type { AdminLogStore } from "../../access/store.ts";
import type { AdminLicenseStore, LicenseSummary, NewLicenseRow } from "../store.ts";

export interface MemoryAdminLicenseStore extends AdminLicenseStore {
  readonly rows: Map<string, LicenseSummary & { readonly keyHash: string }>;
  readonly sessions: Set<string>;
}

export function createMemoryAdminLicenseStore(): MemoryAdminLicenseStore {
  const rows = new Map<string, LicenseSummary & { readonly keyHash: string }>();
  const sessions = new Set<string>();
  let counter = 0;

  return {
    rows,
    sessions,

    create(row: NewLicenseRow): Promise<string> {
      counter += 1;
      const id = `license-${String(counter)}`;
      rows.set(id, {
        id,
        clientId: row.clientId,
        keyHash: row.keyHash,
        disabled: false,
        subscriptionUntil: row.subscriptionUntil,
        monthlyLimit: row.monthlyLimit,
        // Значения по умолчанию из базы: при выдаче ключа улучшения и картинки
        // отдельно не назначаются, администратор меняет их потом при надобности.
        improvementLimit: 30,
        imageLimit: 30,
        note: row.note,
        createdAt: "2026-03-15T00:00:00.000Z",
        usedThisMonth: 0,
        improvementsThisMonth: 0,
        imagesThisMonth: 0,
      });
      return Promise.resolve(id);
    },

    clientIdTaken(clientId: string): Promise<boolean> {
      return Promise.resolve([...rows.values()].some((row) => row.clientId === clientId));
    },

    list(): Promise<LicenseSummary[]> {
      return Promise.resolve([...rows.values()]);
    },

    setDisabled(licenseId: string, disabled: boolean): Promise<void> {
      return patch(licenseId, { disabled });
    },

    setMonthlyLimit(licenseId: string, monthlyLimit: number): Promise<void> {
      return patch(licenseId, { monthlyLimit });
    },

    setImprovementLimit(licenseId: string, improvementLimit: number): Promise<void> {
      return patch(licenseId, { improvementLimit });
    },

    setImageLimit(licenseId: string, imageLimit: number): Promise<void> {
      return patch(licenseId, { imageLimit });
    },

    setSubscriptionUntil(licenseId: string, subscriptionUntil: string): Promise<void> {
      return patch(licenseId, { subscriptionUntil });
    },

    dropSessions(licenseId: string): Promise<void> {
      sessions.delete(licenseId);
      return Promise.resolve();
    },
  };

  function patch(licenseId: string, changes: Partial<LicenseSummary>): Promise<void> {
    const row = rows.get(licenseId);
    if (row) rows.set(licenseId, { ...row, ...changes });
    return Promise.resolve();
  }
}

export interface MemoryAdminLog extends AdminLogStore {
  readonly entries: { action: string; actorLabel: string; details: Record<string, unknown> }[];
}

export function createMemoryAdminLog(): MemoryAdminLog {
  const entries: { action: string; actorLabel: string; details: Record<string, unknown> }[] = [];

  return {
    entries,
    record(action: string, actorLabel: string, details: Record<string, unknown>): Promise<void> {
      entries.push({ action, actorLabel, details });
      return Promise.resolve();
    },
  };
}
