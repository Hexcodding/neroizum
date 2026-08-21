/**
 * Админское хранилище на Postgres. Список клиентов берётся одной функцией
 * базы: считать расход месяца отдельным запросом на каждого клиента — это
 * сотня обращений там, где достаточно одного.
 */
import type { AdminLicenseStore, LicenseSummary, NewLicenseRow } from "../admin/store.ts";
import { insert, remove, rpc, selectOne, update, type DbConfig } from "./rest.ts";

interface AdminLicenseRow {
  readonly id: string;
  readonly client_id: string;
  readonly disabled: boolean;
  readonly subscription_until: string;
  readonly monthly_limit: number;
  readonly improvement_limit: number;
  readonly image_limit: number;
  readonly note: string;
  readonly created_at: string;
  readonly used_this_month: number;
  readonly improvements_this_month: number;
  readonly images_this_month: number;
}

function toSummary(row: AdminLicenseRow): LicenseSummary {
  return {
    id: row.id,
    clientId: row.client_id,
    disabled: row.disabled,
    subscriptionUntil: row.subscription_until,
    monthlyLimit: row.monthly_limit,
    improvementLimit: row.improvement_limit,
    imageLimit: row.image_limit,
    note: row.note,
    createdAt: row.created_at,
    usedThisMonth: row.used_this_month,
    improvementsThisMonth: row.improvements_this_month,
    imagesThisMonth: row.images_this_month,
  };
}

export function createAdminLicenseStore(config: DbConfig): AdminLicenseStore {
  return {
    async create(row: NewLicenseRow): Promise<string> {
      const created = await insert<{ id: string }>(
        config,
        "licenses",
        {
          client_id: row.clientId,
          key_hash: row.keyHash,
          subscription_until: row.subscriptionUntil,
          monthly_limit: row.monthlyLimit,
          note: row.note,
        },
        { returning: true },
      );
      if (created === null) {
        throw new Error("Лицензия не создалась: база не вернула строку");
      }
      return created.id;
    },

    async clientIdTaken(clientId: string): Promise<boolean> {
      const row = await selectOne<{ id: string }>(
        config,
        "licenses",
        `client_id=eq.${encodeURIComponent(clientId)}&select=id`,
      );
      return row !== null;
    },

    async list(monthKey: string): Promise<LicenseSummary[]> {
      const rows = await rpc<AdminLicenseRow[]>(config, "admin_licenses", {
        p_month_key: monthKey,
      });
      return rows.map(toSummary);
    },

    async setDisabled(licenseId: string, disabled: boolean): Promise<void> {
      await update(config, "licenses", `id=eq.${licenseId}`, { disabled });
    },

    async setMonthlyLimit(licenseId: string, monthlyLimit: number): Promise<void> {
      await update(config, "licenses", `id=eq.${licenseId}`, { monthly_limit: monthlyLimit });
    },

    async setImprovementLimit(licenseId: string, improvementLimit: number): Promise<void> {
      await update(config, "licenses", `id=eq.${licenseId}`, {
        improvement_limit: improvementLimit,
      });
    },

    async setImageLimit(licenseId: string, imageLimit: number): Promise<void> {
      await update(config, "licenses", `id=eq.${licenseId}`, { image_limit: imageLimit });
    },

    async setSubscriptionUntil(licenseId: string, date: string): Promise<void> {
      await update(config, "licenses", `id=eq.${licenseId}`, { subscription_until: date });
    },

    async dropSessions(licenseId: string): Promise<void> {
      await remove(config, "sessions", `license_id=eq.${licenseId}`);
    },
  };
}
