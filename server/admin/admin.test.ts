import { describe, expect, it } from "vitest";
import { hashSecret, hasLicenseKeyShape } from "../access/keys.ts";
import { createMemoryAttemptStore } from "../access/__fixtures__/memory-stores.ts";
import { ADMIN_SESSION_LIFETIME_MS, adminLogin, verifyAdminToken } from "./auth.ts";
import type { AdminAuthConfig } from "./auth.ts";
import {
  AdminInputError,
  changeMonthlyLimit,
  changeSubscriptionUntil,
  issueLicense,
  resetSession,
  setLicenseDisabled,
} from "./licenses.ts";
import type { AdminDeps } from "./licenses.ts";
import {
  createMemoryAdminLicenseStore,
  createMemoryAdminLog,
} from "./__fixtures__/memory-admin-store.ts";
import type { MemoryAdminLicenseStore, MemoryAdminLog } from "./__fixtures__/memory-admin-store.ts";

const PEPPER = "серверный-секрет";
const NOW = Date.parse("2026-03-15T10:00:00.000Z");

interface TestDeps extends AdminDeps {
  readonly store: MemoryAdminLicenseStore;
  readonly log: MemoryAdminLog;
}

function makeDeps(): TestDeps {
  const store = createMemoryAdminLicenseStore();
  const log = createMemoryAdminLog();
  return { store, licenses: store, log, pepper: PEPPER, actorLabel: "admin" };
}

const VALID = { subscriptionUntil: "2026-12-31", monthlyLimit: 20, note: " Иван, Telegram " };

describe("выпуск лицензии", () => {
  it("возвращает ключ и номер клиента, в базе хранит только хеш", async () => {
    const deps = makeDeps();

    const issued = await issueLicense(VALID, deps);

    expect(hasLicenseKeyShape(issued.key)).toBe(true);
    const row = deps.store.rows.get(issued.licenseId);
    expect(row?.keyHash).toBe(await hashSecret(issued.key, PEPPER));
    expect(JSON.stringify([...deps.store.rows.values()])).not.toContain(issued.key);
  });

  it("видимый номер клиента не выдаёт ключ", async () => {
    const deps = makeDeps();

    const issued = await issueLicense(VALID, deps);

    const keyBody = issued.key.replace(/-/g, "").slice(3);
    for (let length = 3; length <= keyBody.length; length += 1) {
      expect(issued.clientId).not.toContain(keyBody.slice(0, length));
    }
  });

  it("пометка обрезается, лишние пробелы убираются", async () => {
    const deps = makeDeps();

    const issued = await issueLicense({ ...VALID, note: "x".repeat(300) }, deps);
    const plain = await issueLicense(VALID, deps);

    expect(deps.store.rows.get(issued.licenseId)?.note).toHaveLength(200);
    expect(deps.store.rows.get(plain.licenseId)?.note).toBe("Иван, Telegram");
  });

  it("в журнал попадает действие, но не ключ", async () => {
    const deps = makeDeps();

    const issued = await issueLicense(VALID, deps);

    const entry = deps.log.entries.at(0);
    expect(entry?.action).toBe("license.issued");
    expect(entry?.actorLabel).toBe("admin");
    expect(JSON.stringify(deps.log.entries)).not.toContain(issued.key);
  });

  it("нелепые значения отклоняются с человеческим объяснением", async () => {
    const deps = makeDeps();

    await expect(issueLicense({ ...VALID, subscriptionUntil: "31.12.2026" }, deps)).rejects.toThrow(
      AdminInputError,
    );
    await expect(issueLicense({ ...VALID, monthlyLimit: 0 }, deps)).rejects.toThrow(AdminInputError);
    await expect(issueLicense({ ...VALID, monthlyLimit: 5000 }, deps)).rejects.toThrow(
      /от 1 до 500/,
    );
    await expect(issueLicense({ ...VALID, monthlyLimit: 2.5 }, deps)).rejects.toThrow(
      AdminInputError,
    );
  });

  it("два ключа не совпадают", async () => {
    const deps = makeDeps();

    const first = await issueLicense(VALID, deps);
    const second = await issueLicense(VALID, deps);

    expect(first.key).not.toBe(second.key);
    expect(first.clientId).not.toBe(second.clientId);
  });
});

describe("управление лицензией", () => {
  it("блокировка обрывает активную сессию", async () => {
    const deps = makeDeps();
    const issued = await issueLicense(VALID, deps);
    deps.store.sessions.add(issued.licenseId);

    await setLicenseDisabled(issued.licenseId, true, deps);

    expect(deps.store.rows.get(issued.licenseId)?.disabled).toBe(true);
    expect(deps.store.sessions.has(issued.licenseId)).toBe(false);
  });

  it("разблокировка сессию не создаёт", async () => {
    const deps = makeDeps();
    const issued = await issueLicense(VALID, deps);
    await setLicenseDisabled(issued.licenseId, true, deps);

    await setLicenseDisabled(issued.licenseId, false, deps);

    expect(deps.store.rows.get(issued.licenseId)?.disabled).toBe(false);
    expect(deps.log.entries.map((entry) => entry.action)).toContain("license.enabled");
  });

  it("лимит и срок подписки меняются с записью в журнал", async () => {
    const deps = makeDeps();
    const issued = await issueLicense(VALID, deps);

    await changeMonthlyLimit(issued.licenseId, 50, deps);
    await changeSubscriptionUntil(issued.licenseId, "2027-01-31", deps);

    const row = deps.store.rows.get(issued.licenseId);
    expect(row?.monthlyLimit).toBe(50);
    expect(row?.subscriptionUntil).toBe("2027-01-31");
    expect(deps.log.entries.map((entry) => entry.action)).toEqual([
      "license.issued",
      "license.limit-changed",
      "license.subscription-changed",
    ]);
  });

  it("сброс сессии отличается в журнале от блокировки", async () => {
    const deps = makeDeps();
    const issued = await issueLicense(VALID, deps);
    deps.store.sessions.add(issued.licenseId);

    await resetSession(issued.licenseId, deps);

    expect(deps.store.sessions.has(issued.licenseId)).toBe(false);
    expect(deps.log.entries.at(-1)?.action).toBe("license.session-reset");
    expect(deps.store.rows.get(issued.licenseId)?.disabled).toBe(false);
  });
});

describe("вход администратора", () => {
  async function makeConfig(): Promise<AdminAuthConfig> {
    return {
      passwordHash: await hashSecret("правильный-пароль", PEPPER),
      pepper: PEPPER,
      tokenSecret: "секрет-подписи",
    };
  }

  it("верный пароль даёт токен на восемь часов", async () => {
    const config = await makeConfig();
    const attempts = createMemoryAttemptStore();

    const result = await adminLogin(
      { password: "правильный-пароль", clientAddress: "1.2.3.4", nowMs: NOW },
      { attempts, config },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.expiresAtMs).toBe(NOW + ADMIN_SESSION_LIFETIME_MS);
    expect(await verifyAdminToken(result.token, config, NOW)).toBe(true);
  });

  it("неверный пароль не пускает", async () => {
    const config = await makeConfig();
    const attempts = createMemoryAttemptStore();

    const result = await adminLogin(
      { password: "почти-правильный", clientAddress: "1.2.3.4", nowMs: NOW },
      { attempts, config },
    );

    expect(result).toMatchObject({ ok: false, reason: "denied" });
  });

  it("после пяти попыток вход закрывается на время", async () => {
    const config = await makeConfig();
    const attempts = createMemoryAttemptStore();
    const input = { password: "мимо", clientAddress: "1.2.3.4", nowMs: NOW };

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await adminLogin(input, { attempts, config });
    }

    const blocked = await adminLogin(
      { ...input, password: "правильный-пароль" },
      { attempts, config },
    );
    expect(blocked).toMatchObject({ ok: false, reason: "rate-limited" });
    expect(blocked.ok ? 0 : blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("лимит считается по адресу, другой адрес не заблокирован", async () => {
    const config = await makeConfig();
    const attempts = createMemoryAttemptStore();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await adminLogin({ password: "мимо", clientAddress: "1.2.3.4", nowMs: NOW }, { attempts, config });
    }

    const other = await adminLogin(
      { password: "правильный-пароль", clientAddress: "9.9.9.9", nowMs: NOW },
      { attempts, config },
    );
    expect(other.ok).toBe(true);
  });

  it("истёкший и подделанный токен не проходят", async () => {
    const config = await makeConfig();
    const attempts = createMemoryAttemptStore();
    const login = await adminLogin(
      { password: "правильный-пароль", clientAddress: "1.2.3.4", nowMs: NOW },
      { attempts, config },
    );
    if (!login.ok) throw new Error("вход должен был удаться");

    expect(await verifyAdminToken(login.token, config, login.expiresAtMs + 1)).toBe(false);

    // Подмена срока жизни без пересчёта подписи.
    const [, signature] = login.token.split(".");
    const forged = `${String(NOW + 10 * ADMIN_SESSION_LIFETIME_MS)}.${signature ?? ""}`;
    expect(await verifyAdminToken(forged, config, NOW)).toBe(false);
    expect(await verifyAdminToken("мусор", config, NOW)).toBe(false);
    expect(await verifyAdminToken(login.token, { ...config, tokenSecret: "другой" }, NOW)).toBe(
      false,
    );
  });
});
