import { describe, expect, it, vi } from "vitest";
import { hashSecret } from "../access/keys.ts";
import { hmacHex } from "../access/hmac.ts";
import { LIMITS } from "../access/rate-limit.ts";
import {
  createMemoryAttemptStore,
  createMemoryLicenseStore,
  createMemoryPaymentStore,
  createMemoryQuotaStore,
  makeLicense,
} from "../access/__fixtures__/memory-stores.ts";
import {
  createMemoryAdminLicenseStore,
  createMemoryAdminLog,
} from "../admin/__fixtures__/memory-admin-store.ts";
import { createFakeProvider } from "../generation/__fixtures__/fake-provider.ts";
import { corsHeaders, handlePreflight, isOriginAllowed, parseAllowedOrigins } from "./cors.ts";
import { clientAddress, errorResponse } from "./respond.ts";
import { GenerationError } from "../generation/errors.ts";
import { handleActivate } from "./handlers/activate.ts";
import { handleGenerate } from "./handlers/generate.ts";
import { handleWebhook } from "./handlers/webhook.ts";
import { handleAdmin } from "./handlers/admin.ts";

const PEPPER = "тестовый-секрет";
const KEY = "NZM-A2B3-C4D5-E6F7";
const NOW = Date.UTC(2026, 2, 15);
const TODAY = "2026-03-15";
const ORIGIN = "https://neuroizium.ru";
const POLICY = { allowedOrigins: [ORIGIN] };
const RESPONSE = { cors: corsHeaders(ORIGIN, POLICY) };

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://api.example/endpoint", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("CORS", () => {
  it("список адресов читается из строки настройки", () => {
    expect(parseAllowedOrigins(" https://a.ru/, https://b.ru ,, ")).toEqual([
      "https://a.ru",
      "https://b.ru",
    ]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });

  it("чужой сайт не получает разрешения", () => {
    expect(isOriginAllowed("https://evil.example", POLICY)).toBe(false);
    expect(corsHeaders("https://evil.example", POLICY)).toEqual({});
    expect(corsHeaders(null, POLICY)).toEqual({});
  });

  it("свой сайт получает разрешение и Vary по источнику", () => {
    const headers = corsHeaders(ORIGIN, POLICY);
    expect(headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(headers.vary).toBe("Origin");
  });

  it("предполётный запрос чужого сайта отклоняется", () => {
    const preflight = (origin: string): Response | null =>
      handlePreflight(
        new Request("https://api.example/e", { method: "OPTIONS", headers: { origin } }),
        POLICY,
      );

    expect(preflight("https://evil.example")?.status).toBe(403);
    expect(preflight(ORIGIN)?.status).toBe(204);
    expect(handlePreflight(post({}), POLICY)).toBeNull();
  });
});

describe("ответы наружу", () => {
  it("техническая причина остаётся в логе, наружу уходит человеческий текст", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = errorResponse(new Error("Edge Function returned a non-2xx status code"), RESPONSE);
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(500);
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).not.toContain("non-2xx");
    expect(log).toHaveBeenCalledWith(expect.stringContaining("non-2xx"));
    log.mockRestore();
  });

  it("остановка пользователем не выдаётся за успех запроса", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = errorResponse(new GenerationError("STOPPED_BY_USER", "остановлено"), RESPONSE);
    expect(response.status).toBe(499);
    log.mockRestore();
  });

  it("адрес клиента берётся из первого звена цепочки", () => {
    expect(clientAddress(post({}, { "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe(
      "203.0.113.7",
    );
    expect(clientAddress(post({}))).toBe("unknown");
  });
});

async function activateDeps() {
  const licenses = createMemoryLicenseStore();
  const attempts = createMemoryAttemptStore();
  licenses.add(await hashSecret(KEY, PEPPER), makeLicense());
  return {
    licenses,
    attempts,
    deps: { context: { licenses, attempts, pepper: PEPPER, nowMs: NOW, today: TODAY } },
  };
}

describe("вход по ключу", () => {
  it("верный ключ даёт токен сессии", async () => {
    const { deps } = await activateDeps();

    const response = await handleActivate(post({ key: KEY }), deps, RESPONSE);
    const body = (await response.json()) as { sessionToken: string; clientId: string };

    expect(response.status).toBe(200);
    expect(body.sessionToken).toHaveLength(64);
    expect(body.clientId).not.toContain(KEY.slice(4, 8));
  });

  it("неизвестный ключ и отключённый ключ отвечают одинаково", async () => {
    const unknown = await activateDeps();
    const unknownResponse = await handleActivate(
      post({ key: "NZM-ZZZZ-ZZZZ-ZZZZ" }),
      unknown.deps,
      RESPONSE,
    );

    const blocked = await activateDeps();
    blocked.licenses.add(await hashSecret(KEY, PEPPER), makeLicense({ disabled: true }));
    const blockedResponse = await handleActivate(post({ key: KEY }), blocked.deps, RESPONSE);

    expect(unknownResponse.status).toBe(blockedResponse.status);
    expect(await unknownResponse.json()).toEqual(await blockedResponse.json());
  });

  it("после серии попыток отвечает 429 с временем ожидания", async () => {
    const { deps } = await activateDeps();
    const request = (): Request => post({ key: "NZM-ZZZZ-ZZZZ-ZZZZ" });

    for (let attempt = 0; attempt < LIMITS.activation.maxAttempts; attempt += 1) {
      await handleActivate(request(), deps, RESPONSE);
    }

    const blocked = await handleActivate(request(), deps, RESPONSE);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).not.toBeNull();
  });

  it("испорченное тело — это ошибка запроса, а не сбой сервера", async () => {
    const { deps } = await activateDeps();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleActivate(
      new Request("https://api.example/e", { method: "POST", body: "не json" }),
      deps,
      RESPONSE,
    );

    expect(response.status).toBe(400);
    log.mockRestore();
  });
});

const PLAN_REQUEST = {
  niche: "Кофейня в спальном районе",
  audience: "Жители района 25-40 лет",
  goal: "sales",
  channelStage: "start",
  authorRole: "founder",
  platforms: ["telegram"],
  startDate: "2026-03-16",
  periodDays: 7,
  postsPerWeek: 3,
  infoPlanMode: false,
  previousPosts: [],
  brand: {
    tone: "",
    products: "",
    proof: "",
    stopWords: [],
    styleSamples: [],
    customRubrics: [],
  },
};

async function generateDeps() {
  const licenses = createMemoryLicenseStore();
  const attempts = createMemoryAttemptStore();
  const quotaStore = createMemoryQuotaStore(5);
  const license = makeLicense();
  licenses.add(await hashSecret(KEY, PEPPER), license);

  const session = { licenses, attempts, pepper: PEPPER, nowMs: NOW, today: TODAY };
  const activation = await handleActivate(post({ key: KEY }), { context: session }, RESPONSE);
  const { sessionToken } = (await activation.json()) as { sessionToken: string };

  const saved: { licenseId: string }[] = [];

  return {
    sessionToken,
    quotaStore,
    saved,
    deps: {
      session,
      attempts,
      cascade: { provider: createFakeProvider(), sleep: (): Promise<void> => Promise.resolve() },
      quota: { store: quotaStore, today: TODAY },
      savePlan: (licenseId: string): Promise<string> => {
        saved.push({ licenseId });
        return Promise.resolve("plan-1");
      },
    },
  };
}

/** Читает поток событий до конца и возвращает разобранные события. */
async function readEvents(response: Response): Promise<{ type: string; [key: string]: unknown }[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter((chunk) => chunk.startsWith("data: "))
    .map((chunk) => JSON.parse(chunk.slice("data: ".length)) as { type: string });
}

describe("генерация плана", () => {
  it("без сессии не пускает и модель не вызывает", async () => {
    const { deps } = await generateDeps();

    const response = await handleGenerate(post(PLAN_REQUEST), null, deps, RESPONSE);

    expect(response.status).toBe(401);
    expect((await response.json()) as { error: { code: string } }).toMatchObject({
      error: { code: "NO_SESSION" },
    });
  });

  it("отдаёт поток событий: прогресс, посты и итог", async () => {
    const { deps, sessionToken, saved } = await generateDeps();

    const response = await handleGenerate(post(PLAN_REQUEST), sessionToken, deps, RESPONSE);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const events = await readEvents(response);
    expect(events.map((event) => event.type)).toContain("progress");
    expect(events.at(-1)?.type).toBe("done");
    expect(saved).toHaveLength(1);
  });

  it("текст промпта в ответ не попадает", async () => {
    const { deps, sessionToken } = await generateDeps();

    const response = await handleGenerate(post(PLAN_REQUEST), sessionToken, deps, RESPONSE);
    const text = await response.text();

    expect(text).not.toContain("Zero Click Value");
    expect(text).not.toContain("КОНТРАКТ ОТВЕТА");
  });

  it("успешная генерация списывает одну попытку месяца", async () => {
    const { deps, sessionToken, quotaStore } = await generateDeps();

    const response = await handleGenerate(post(PLAN_REQUEST), sessionToken, deps, RESPONSE);
    await readEvents(response);

    expect(await quotaStore.usedThisMonth("license-1", "2026-03")).toBe(1);
  });

  it("ошибка модели приходит событием и попытка возвращается", async () => {
    const { deps, sessionToken, quotaStore } = await generateDeps();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const broken = {
      ...deps,
      cascade: {
        provider: createFakeProvider([
          { kind: "fail" as const, error: new GenerationError("INTERNAL", "сбой у провайдера") },
        ]),
        sleep: (): Promise<void> => Promise.resolve(),
      },
    };
    const response = await handleGenerate(post(PLAN_REQUEST), sessionToken, broken, RESPONSE);
    const events = await readEvents(response);

    expect(events.at(-1)).toMatchObject({ type: "error" });
    expect(await quotaStore.usedThisMonth("license-1", "2026-03")).toBe(0);
    log.mockRestore();
  });
});

describe("вебхук оплаты", () => {
  async function webhookDeps() {
    const attempts = createMemoryAttemptStore();
    const payments = createMemoryPaymentStore();
    const extended: { licenseId: string; paidUntil: string }[] = [];
    const events: string[] = [];

    return {
      extended,
      events,
      deps: {
        payments,
        attempts,
        secret: "секрет-вебхука",
        nowMs: NOW,
        findLicenseIdByClientId: (clientId: string): Promise<string | null> =>
          Promise.resolve(clientId === "ID-ABCDEF" ? "license-1" : null),
        extendSubscription: (licenseId: string, paidUntil: string): Promise<void> => {
          extended.push({ licenseId, paidUntil });
          return Promise.resolve();
        },
        logEvent: (action: string): Promise<void> => {
          events.push(action);
          return Promise.resolve();
        },
      },
    };
  }

  function signed(body: unknown, secret: string): Promise<Request> {
    const raw = JSON.stringify(body);
    return hmacHex(raw, secret).then(
      (signature) =>
        new Request("https://api.example/webhook", {
          method: "POST",
          body: raw,
          headers: { "x-neuroizium-signature": signature },
        }),
    );
  }

  const PAYMENT = { eventId: "pay-1", clientId: "ID-ABCDEF", paidUntil: "2026-12-31" };

  it("подписанный платёж продлевает подписку", async () => {
    const { deps, extended } = await webhookDeps();

    const response = await handleWebhook(await signed(PAYMENT, deps.secret), deps, RESPONSE);

    expect(await response.json()).toEqual({ status: "applied" });
    expect(extended).toEqual([{ licenseId: "license-1", paidUntil: "2026-12-31" }]);
  });

  it("повтор того же платежа подписку не продлевает дважды", async () => {
    const { deps, extended } = await webhookDeps();

    await handleWebhook(await signed(PAYMENT, deps.secret), deps, RESPONSE);
    const repeat = await handleWebhook(await signed(PAYMENT, deps.secret), deps, RESPONSE);

    expect(await repeat.json()).toEqual({ status: "duplicate" });
    expect(extended).toHaveLength(1);
  });

  it("неверная подпись не делает ничего", async () => {
    const { deps, extended } = await webhookDeps();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleWebhook(await signed(PAYMENT, "чужой-секрет"), deps, RESPONSE);

    expect(response.status).toBe(401);
    expect(extended).toHaveLength(0);
    log.mockRestore();
  });

  it("неизвестный номер клиента не считается подделкой, но и не применяется", async () => {
    const { deps, extended, events } = await webhookDeps();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleWebhook(
      await signed({ ...PAYMENT, clientId: "ID-ZZZZZZ" }, deps.secret),
      deps,
      RESPONSE,
    );

    expect(response.status).toBe(200);
    expect(extended).toHaveLength(0);
    expect(events).toContain("payment.unknown-client");
    log.mockRestore();
  });
});

describe("панель управления", () => {
  async function adminDeps() {
    const store = createMemoryAdminLicenseStore();
    const log = createMemoryAdminLog();
    const attempts = createMemoryAttemptStore();

    return {
      store,
      log,
      deps: {
        admin: { licenses: store, log, pepper: PEPPER, actorLabel: "admin" },
        attempts,
        config: {
          passwordHash: await hashSecret("пароль-админа", PEPPER),
          pepper: PEPPER,
          tokenSecret: "секрет-подписи",
        },
        nowMs: NOW,
        today: TODAY,
      },
    };
  }

  async function loginToken(deps: Awaited<ReturnType<typeof adminDeps>>["deps"]): Promise<string> {
    const response = await handleAdmin(
      post({ action: "login", password: "пароль-админа" }),
      null,
      deps,
      RESPONSE,
    );
    return ((await response.json()) as { token: string }).token;
  }

  it("без токена не отдаёт список клиентов", async () => {
    const { deps } = await adminDeps();

    const response = await handleAdmin(post({ action: "licenses" }), null, deps, RESPONSE);

    expect(response.status).toBe(401);
  });

  it("подделанный токен не проходит", async () => {
    const { deps } = await adminDeps();

    const response = await handleAdmin(
      post({ action: "licenses" }),
      `${String(NOW + 1_000_000)}.подпись`,
      deps,
      RESPONSE,
    );

    expect(response.status).toBe(401);
  });

  it("с токеном выпускает ключ и показывает его один раз", async () => {
    const { deps, store } = await adminDeps();
    const token = await loginToken(deps);

    const response = await handleAdmin(
      post({ action: "issue", subscriptionUntil: "2026-12-31", monthlyLimit: 20, note: "Иван" }),
      token,
      deps,
      RESPONSE,
    );
    const issued = (await response.json()) as { key: string; licenseId: string };

    expect(issued.key).toMatch(/^NZM-/);
    expect(JSON.stringify([...store.rows.values()])).not.toContain(issued.key);

    const list = await handleAdmin(post({ action: "licenses" }), token, deps, RESPONSE);
    expect(JSON.stringify(await list.json())).not.toContain(issued.key);
  });

  it("нелепые значения объясняются человеческим языком", async () => {
    const { deps } = await adminDeps();
    const token = await loginToken(deps);

    const response = await handleAdmin(
      post({ action: "issue", subscriptionUntil: "31.12.2026", monthlyLimit: 20 }),
      token,
      deps,
      RESPONSE,
    );

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain("ГГГГ-ММ-ДД");
  });

  it("неизвестное действие отклоняется", async () => {
    const { deps } = await adminDeps();

    const response = await handleAdmin(post({ action: "выключить-всё" }), null, deps, RESPONSE);

    expect(response.status).toBe(400);
  });
});
