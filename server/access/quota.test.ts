import { describe, expect, it } from "vitest";
import { createQuotaGuard, monthKey, readQuotaStatus } from "./quota.ts";
import { applyPayment, verifySignature } from "./payments.ts";
import { createMemoryPaymentStore, createMemoryQuotaStore } from "./__fixtures__/memory-stores.ts";

const TODAY = "2026-03-15";

function makeContext(limit: number) {
  const store = createMemoryQuotaStore(limit);
  return { store, context: { store, licenseId: "license-1", today: TODAY } };
}

describe("месячная квота", () => {
  it("ключ месяца берётся из даты", () => {
    expect(monthKey("2026-03-15")).toBe("2026-03");
  });

  it("успешная генерация списывает одну попытку", async () => {
    const { store, context } = makeContext(3);
    const guard = createQuotaGuard(context);

    await guard.reserve();
    await guard.commit();

    expect(await store.usedThisMonth("license-1", "2026-03")).toBe(1);
  });

  it("сбой возвращает попытку клиенту", async () => {
    const { store, context } = makeContext(3);
    const guard = createQuotaGuard(context);

    await guard.reserve();
    await guard.release();

    expect(await store.usedThisMonth("license-1", "2026-03")).toBe(0);
  });

  it("исчерпанный лимит отдаёт понятную ошибку", async () => {
    const { context } = makeContext(1);

    const first = createQuotaGuard(context);
    await first.reserve();
    await first.commit();

    const second = createQuotaGuard(context);
    await expect(second.reserve()).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      userMessage: expect.stringContaining("генерации закончились"),
    });
  });

  it("одновременные запросы не перебирают лимит", async () => {
    const { context } = makeContext(1);

    const first = createQuotaGuard(context);
    const second = createQuotaGuard(context);

    // Первый ещё не подтвердил результат, но слот уже занят резервом.
    await first.reserve();
    await expect(second.reserve()).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
  });

  it("повторное подтверждение ничего не портит", async () => {
    const { store, context } = makeContext(3);
    const guard = createQuotaGuard(context);

    await guard.reserve();
    await guard.commit();
    await guard.commit();
    await guard.release();

    expect(await store.usedThisMonth("license-1", "2026-03")).toBe(1);
  });

  it("показывает остаток для клиента", async () => {
    const { context } = makeContext(20);
    const guard = createQuotaGuard(context);
    await guard.reserve();
    await guard.commit();

    expect(await readQuotaStatus(context, 20)).toEqual({ used: 1, limit: 20, left: 19 });
  });
});

describe("вебхук оплаты", () => {
  it("платёж применяется один раз, повтор игнорируется", async () => {
    const store = createMemoryPaymentStore();
    const event = { eventId: "payment-77", licenseId: "license-1", paidUntil: "2026-04-30" };

    expect(await applyPayment(event, store)).toEqual({ status: "applied" });
    expect(await applyPayment(event, store)).toEqual({ status: "duplicate" });
    expect(store.applied).toHaveLength(1);
  });

  it("разные платежи проходят оба", async () => {
    const store = createMemoryPaymentStore();
    const base = { licenseId: "license-1", paidUntil: "2026-04-30" };

    await applyPayment({ ...base, eventId: "payment-1" }, store);
    await applyPayment({ ...base, eventId: "payment-2" }, store);

    expect(store.applied).toHaveLength(2);
  });

  it("подпись проверяется, подделка не проходит", async () => {
    const body = '{"event":"payment.succeeded","id":"payment-77"}';
    const secret = "секрет-вебхука";

    const signature = await makeSignature(body, secret);
    expect(await verifySignature(body, signature, secret)).toBe(true);
    expect(await verifySignature(body, signature, "другой-секрет")).toBe(false);
    expect(await verifySignature(`${body} `, signature, secret)).toBe(false);
    expect(await verifySignature(body, "", secret)).toBe(false);
  });
});

async function makeSignature(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
