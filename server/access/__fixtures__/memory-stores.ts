/**
 * Хранилища в памяти для тестов доступа.
 *
 * Резервирование квоты здесь ведёт себя так же, как обязана вести себя база:
 * лимит считается по сумме подтверждённых и ещё не отпущенных резервов. Иначе
 * тест на одновременные запросы проходил бы вхолостую.
 */
import type { AttemptStore } from "../rate-limit.ts";
import type {
  LicenseRecord,
  LicenseStore,
  PaymentStore,
  QuotaStore,
  ReservationResult,
  SessionRecord,
} from "../store.ts";

export function createMemoryAttemptStore(): AttemptStore & { readonly all: Map<string, number[]> } {
  const all = new Map<string, number[]>();

  return {
    all,
    countSince(bucket: string, sinceMs: number): Promise<number> {
      const times = all.get(bucket) ?? [];
      return Promise.resolve(times.filter((time) => time >= sinceMs).length);
    },
    record(bucket: string, atMs: number): Promise<void> {
      all.set(bucket, [...(all.get(bucket) ?? []), atMs]);
      return Promise.resolve();
    },
  };
}

export interface MemoryLicenseStore extends LicenseStore {
  readonly licenses: Map<string, LicenseRecord>;
  readonly sessions: Map<string, SessionRecord>;
  /** Хеш ключа → идентификатор лицензии. */
  readonly keyHashes: Map<string, string>;
  readonly lookupsByKeyHash: string[];
  add(keyHash: string, license: LicenseRecord): void;
}

export function createMemoryLicenseStore(): MemoryLicenseStore {
  const licenses = new Map<string, LicenseRecord>();
  const sessions = new Map<string, SessionRecord>();
  const keyHashes = new Map<string, string>();
  const lookupsByKeyHash: string[] = [];

  return {
    licenses,
    sessions,
    keyHashes,
    lookupsByKeyHash,

    add(keyHash: string, license: LicenseRecord): void {
      licenses.set(license.id, license);
      keyHashes.set(keyHash, license.id);
    },

    findByKeyHash(keyHash: string): Promise<LicenseRecord | null> {
      lookupsByKeyHash.push(keyHash);
      const id = keyHashes.get(keyHash);
      return Promise.resolve(id === undefined ? null : licenses.get(id) ?? null);
    },

    findById(licenseId: string): Promise<LicenseRecord | null> {
      return Promise.resolve(licenses.get(licenseId) ?? null);
    },

    replaceSession(licenseId: string, tokenHash: string, expiresAtMs: number): Promise<void> {
      for (const [hash, session] of sessions) {
        if (session.licenseId === licenseId) sessions.delete(hash);
      }
      sessions.set(tokenHash, { licenseId, expiresAtMs });
      return Promise.resolve();
    },

    findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
      return Promise.resolve(sessions.get(tokenHash) ?? null);
    },

    deleteSession(tokenHash: string): Promise<void> {
      sessions.delete(tokenHash);
      return Promise.resolve();
    },
  };
}

interface Reservation {
  readonly licenseId: string;
  readonly monthKey: string;
  status: "reserved" | "committed";
}

export interface MemoryQuotaStore extends QuotaStore {
  readonly reservations: Map<string, Reservation>;
}

export function createMemoryQuotaStore(monthlyLimit: number): MemoryQuotaStore {
  const reservations = new Map<string, Reservation>();
  let nextId = 1;

  const countActive = (licenseId: string, month: string): number =>
    [...reservations.values()].filter(
      (item) => item.licenseId === licenseId && item.monthKey === month,
    ).length;

  return {
    reservations,

    reserve(licenseId: string, month: string): Promise<ReservationResult> {
      if (countActive(licenseId, month) >= monthlyLimit) {
        return Promise.resolve({ reason: "limit-reached" });
      }
      const id = `reservation-${String(nextId)}`;
      nextId += 1;
      reservations.set(id, { licenseId, monthKey: month, status: "reserved" });
      return Promise.resolve({ id });
    },

    commit(reservationId: string): Promise<void> {
      const reservation = reservations.get(reservationId);
      if (reservation !== undefined) reservation.status = "committed";
      return Promise.resolve();
    },

    release(reservationId: string): Promise<void> {
      reservations.delete(reservationId);
      return Promise.resolve();
    },

    usedThisMonth(licenseId: string, month: string): Promise<number> {
      return Promise.resolve(countActive(licenseId, month));
    },
  };
}

export function createMemoryPaymentStore(): PaymentStore & { readonly applied: string[] } {
  const applied: string[] = [];

  return {
    applied,
    wasProcessed(eventId: string): Promise<boolean> {
      return Promise.resolve(applied.includes(eventId));
    },
    markProcessed(eventId: string): Promise<void> {
      applied.push(eventId);
      return Promise.resolve();
    },
  };
}

export function makeLicense(overrides: Partial<LicenseRecord> = {}): LicenseRecord {
  return {
    id: "license-1",
    clientId: "ID-7K4M2Q",
    disabled: false,
    subscriptionUntil: "2026-12-31",
    monthlyLimit: 20,
    improvementLimit: 30,
    imageLimit: 30,
    ...overrides,
  };
}
