import { describe, expect, it } from "vitest";
import { activateLicense, resolveSession, SESSION_LIFETIME_MS } from "./activation.ts";
import type { ActivationContext, ActivationResult } from "./activation.ts";
import { hashSecret } from "./keys.ts";
import { LIMITS } from "./rate-limit.ts";
import {
  createMemoryAttemptStore,
  createMemoryLicenseStore,
  makeLicense,
} from "./__fixtures__/memory-stores.ts";
import type { LicenseRecord } from "./store.ts";

const PEPPER = "тестовый-серверный-секрет";
const KEY = "NZM-A2B3-C4D5-E6F7";
const NOW = Date.UTC(2026, 2, 15);
const TODAY = "2026-03-15";

async function makeContext(
  license: LicenseRecord | null = makeLicense(),
  overrides: Partial<ActivationContext> = {},
) {
  const licenses = createMemoryLicenseStore();
  const attempts = createMemoryAttemptStore();

  if (license !== null) {
    licenses.add(await hashSecret(KEY, PEPPER), license);
  }

  const context: ActivationContext = {
    licenses,
    attempts,
    clientAddress: "203.0.113.10",
    pepper: PEPPER,
    nowMs: NOW,
    today: TODAY,
    ...overrides,
  };

  return { context, licenses, attempts };
}

/** Причина отказа одной строкой: удачную активацию тесты сверяют иначе. */
function reasonOf(result: ActivationResult): string {
  return result.ok ? "ok" : result.reason;
}

describe("активация лицензии", () => {
  it("выдаёт сессию по верному ключу", async () => {
    const { context, licenses } = await makeContext();
    const result = await activateLicense(KEY, context);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.clientId).toBe("ID-7K4M2Q");
    expect(result.expiresAtMs).toBe(NOW + SESSION_LIFETIME_MS);
    expect(licenses.sessions.size).toBe(1);
    // В базе лежит хеш, а не сам токен.
    expect([...licenses.sessions.keys()][0]).not.toBe(result.sessionToken);
  });

  it("принимает ключ, записанный строчными буквами и с пробелами", async () => {
    const { context } = await makeContext();
    const result = await activateLicense(" nzm-a2b3-c4d5-e6f7 ", context);
    expect(result.ok).toBe(true);
  });

  it("одна активная сессия на ключ: прежняя перестаёт работать", async () => {
    const { context, licenses } = await makeContext();

    const first = await activateLicense(KEY, context);
    const second = await activateLicense(KEY, context);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok) return;

    expect(licenses.sessions.size).toBe(1);
    const check = await resolveSession(first.sessionToken, context);
    expect(check.ok).toBe(false);
  });
});

describe("отказы не выдают информацию о ключе", () => {
  it("неизвестный ключ и отключённый ключ отвечают одинаково", async () => {
    const unknown = await makeContext(null);
    const disabled = await makeContext(makeLicense({ disabled: true }));

    const unknownResult = await activateLicense(KEY, unknown.context);
    const disabledResult = await activateLicense(KEY, disabled.context);

    expect(unknownResult).toEqual({ ok: false, reason: "denied" });
    expect(disabledResult).toEqual({ ok: false, reason: "denied" });
  });

  it("ключ неверной формы не доходит до базы", async () => {
    const { context, licenses } = await makeContext();
    const result = await activateLicense("привет", context);

    expect(result).toEqual({ ok: false, reason: "denied" });
    expect(licenses.lookupsByKeyHash).toHaveLength(0);
  });

  it("про истёкшую подписку клиенту говорят прямо", async () => {
    const { context } = await makeContext(makeLicense({ subscriptionUntil: "2026-02-28" }));
    const result = await activateLicense(KEY, context);

    expect(result).toEqual({ ok: false, reason: "subscription-ended", endedOn: "2026-02-28" });
  });

  it("последний день подписки ещё рабочий", async () => {
    const { context } = await makeContext(makeLicense({ subscriptionUntil: TODAY }));
    expect((await activateLicense(KEY, context)).ok).toBe(true);
  });
});

describe("лимит попыток", () => {
  it("после исчерпания попыток активация закрывается", async () => {
    const { context } = await makeContext(null);

    for (let attempt = 0; attempt < LIMITS.activation.maxAttempts; attempt += 1) {
      expect(reasonOf(await activateLicense(KEY, context))).toBe("denied");
    }

    const blocked = await activateLicense(KEY, context);
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toBe("too-many-attempts");
  });

  it("удачная попытка тоже считается", async () => {
    const { context, attempts } = await makeContext();
    await activateLicense(KEY, context);

    const recorded = [...attempts.all.values()].flat();
    expect(recorded).toHaveLength(3);
  });

  it("подмена адреса не обходит лимит: считается и по самому ключу", async () => {
    const { context, licenses, attempts } = await makeContext(null);

    // Каждая попытка приходит будто бы с нового адреса.
    for (let attempt = 0; attempt < LIMITS.activationByKey.maxAttempts; attempt += 1) {
      await activateLicense(KEY, {
        licenses,
        attempts,
        clientAddress: `198.51.100.${String(attempt)}`,
        pepper: PEPPER,
        nowMs: NOW,
        today: TODAY,
      });
    }

    const blocked = await activateLicense(KEY, {
      ...context,
      clientAddress: "198.51.100.200",
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toBe("too-many-attempts");
  });

  it("окно лимита истекает", async () => {
    const { context, licenses, attempts } = await makeContext(null);

    for (let attempt = 0; attempt < LIMITS.activation.maxAttempts; attempt += 1) {
      await activateLicense(KEY, context);
    }

    const later = await activateLicense(KEY, {
      licenses,
      attempts,
      clientAddress: "203.0.113.10",
      pepper: PEPPER,
      nowMs: NOW + LIMITS.activationByKey.windowMs + 1,
      today: TODAY,
    });
    expect(reasonOf(later)).toBe("denied");
  });
});

describe("проверка сессии", () => {
  it("определяет клиента по токену", async () => {
    const { context } = await makeContext();
    const activation = await activateLicense(KEY, context);
    if (!activation.ok) throw new Error("активация должна была пройти");

    const check = await resolveSession(activation.sessionToken, context);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.license.clientId).toBe("ID-7K4M2Q");
  });

  it("без токена и с чужим токеном доступа нет", async () => {
    const { context } = await makeContext();
    expect((await resolveSession(null, context)).ok).toBe(false);
    expect((await resolveSession("подделка", context)).ok).toBe(false);
  });

  it("истёкшая сессия удаляется", async () => {
    const { context, licenses } = await makeContext();
    const activation = await activateLicense(KEY, context);
    if (!activation.ok) throw new Error("активация должна была пройти");

    const check = await resolveSession(activation.sessionToken, {
      ...context,
      nowMs: NOW + SESSION_LIFETIME_MS + 1,
    });

    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.reason).toBe("expired");
    expect(licenses.sessions.size).toBe(0);
  });

  it("отключение ключа администратором обрывает доступ сразу", async () => {
    const { context, licenses } = await makeContext();
    const activation = await activateLicense(KEY, context);
    if (!activation.ok) throw new Error("активация должна была пройти");

    licenses.licenses.set("license-1", makeLicense({ disabled: true }));

    const check = await resolveSession(activation.sessionToken, context);
    expect(check.ok).toBe(false);
    if (check.ok) return;
    expect(check.reason).toBe("revoked");
  });
});
