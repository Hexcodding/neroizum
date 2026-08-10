/**
 * Хранилища доступов на Postgres.
 *
 * Здесь нет ни одного решения о правилах: лимиты, сроки и порядок проверок
 * живут в server/access. Этот файл только переводит вызовы в запросы к базе,
 * поэтому логику можно менять, не думая про SQL, и наоборот.
 */
import type { AttemptStore } from "../access/rate-limit.ts";
import type {
  AdminLogStore,
  LicenseRecord,
  LicenseStore,
  PaymentStore,
  QuotaStore,
  ReservationResult,
  SessionRecord,
} from "../access/store.ts";
import { insert, remove, rpc, select, selectOne, update, type DbConfig } from "./rest.ts";

interface LicenseRow {
  readonly id: string;
  readonly client_id: string;
  readonly disabled: boolean;
  readonly subscription_until: string;
  readonly monthly_limit: number;
}

interface SessionRow {
  readonly license_id: string;
  readonly expires_at: string;
}

function toLicense(row: LicenseRow): LicenseRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    disabled: row.disabled,
    subscriptionUntil: row.subscription_until,
    monthlyLimit: row.monthly_limit,
  };
}

const LICENSE_FIELDS = "id,client_id,disabled,subscription_until,monthly_limit";

export function createLicenseStore(config: DbConfig): LicenseStore {
  return {
    async findByKeyHash(keyHash: string): Promise<LicenseRecord | null> {
      const row = await selectOne<LicenseRow>(
        config,
        "licenses",
        `key_hash=eq.${keyHash}&select=${LICENSE_FIELDS}`,
      );
      return row === null ? null : toLicense(row);
    },

    async findById(licenseId: string): Promise<LicenseRecord | null> {
      const row = await selectOne<LicenseRow>(
        config,
        "licenses",
        `id=eq.${licenseId}&select=${LICENSE_FIELDS}`,
      );
      return row === null ? null : toLicense(row);
    },

    async replaceSession(licenseId: string, tokenHash: string, expiresAtMs: number): Promise<void> {
      // Одна активная сессия на ключ: прежняя удаляется до вставки новой.
      await remove(config, "sessions", `license_id=eq.${licenseId}`);
      await insert(config, "sessions", {
        token_hash: tokenHash,
        license_id: licenseId,
        expires_at: new Date(expiresAtMs).toISOString(),
      });
    },

    async findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
      const row = await selectOne<SessionRow>(
        config,
        "sessions",
        `token_hash=eq.${tokenHash}&select=license_id,expires_at`,
      );
      if (row === null) return null;
      return { licenseId: row.license_id, expiresAtMs: Date.parse(row.expires_at) };
    },

    async deleteSession(tokenHash: string): Promise<void> {
      await remove(config, "sessions", `token_hash=eq.${tokenHash}`);
    },
  };
}

export function createAttemptStore(config: DbConfig): AttemptStore {
  return {
    async countSince(bucket: string, sinceMs: number): Promise<number> {
      const since = new Date(sinceMs).toISOString();
      const rows = await select<{ id: number }>(
        config,
        "access_attempts",
        `bucket=eq.${encodeURIComponent(bucket)}&happened_at=gte.${since}&select=id`,
      );
      return rows.length;
    },

    async record(bucket: string, atMs: number): Promise<void> {
      await insert(config, "access_attempts", {
        bucket,
        happened_at: new Date(atMs).toISOString(),
      });
    },
  };
}

export function createQuotaStore(config: DbConfig): QuotaStore {
  return {
    async reserve(licenseId: string, monthKey: string): Promise<ReservationResult> {
      // Проверка лимита и вставка резерва — одна функция базы под блокировкой
      // строки лицензии. Иначе два одновременных запроса перебирают лимит.
      const id = await rpc<string | null>(config, "reserve_generation", {
        p_license_id: licenseId,
        p_month_key: monthKey,
      });
      return id === null ? { reason: "limit-reached" } : { id };
    },

    async commit(reservationId: string): Promise<void> {
      await rpc<null>(config, "commit_generation", { p_reservation_id: reservationId });
    },

    async release(reservationId: string): Promise<void> {
      await rpc<null>(config, "release_generation", { p_reservation_id: reservationId });
    },

    async usedThisMonth(licenseId: string, monthKey: string): Promise<number> {
      return await rpc<number>(config, "used_generations", {
        p_license_id: licenseId,
        p_month_key: monthKey,
      });
    },
  };
}

export function createPaymentStore(config: DbConfig): PaymentStore {
  return {
    async wasProcessed(eventId: string): Promise<boolean> {
      const row = await selectOne<{ event_id: string }>(
        config,
        "payments",
        `event_id=eq.${encodeURIComponent(eventId)}&select=event_id`,
      );
      return row !== null;
    },

    async markProcessed(eventId: string, licenseId: string, paidUntil: string): Promise<void> {
      // Первичный ключ по событию и есть защита от повтора: одновременный
      // дубль упрётся в уникальность, а не пройдёт вторым.
      await insert(
        config,
        "payments",
        { event_id: eventId, license_id: licenseId, paid_until: paidUntil },
        { onConflict: "event_id" },
      );
    },
  };
}

export function createAdminLogStore(config: DbConfig): AdminLogStore {
  return {
    async record(
      action: string,
      actorLabel: string,
      details: Record<string, unknown>,
    ): Promise<void> {
      await insert(config, "admin_actions", { action, actor_label: actorLabel, details });
    },
  };
}

/** Продление подписки после оплаты. Отдельно от админских операций. */
export async function extendSubscription(
  config: DbConfig,
  licenseId: string,
  paidUntil: string,
): Promise<void> {
  await update(config, "licenses", `id=eq.${licenseId}`, { subscription_until: paidUntil });
}

export async function findLicenseIdByClientId(
  config: DbConfig,
  clientId: string,
): Promise<string | null> {
  const row = await selectOne<{ id: string }>(
    config,
    "licenses",
    `client_id=eq.${encodeURIComponent(clientId)}&select=id`,
  );
  return row?.id ?? null;
}
