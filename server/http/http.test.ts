import { describe, expect, it, vi } from "vitest";
import { INPUT_LIMITS, type GeneratedPost } from "../../contracts/index.ts";
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
import { createFakeImageProvider } from "../generation/__fixtures__/fake-image-provider.ts";
import { corsHeaders, handlePreflight, isOriginAllowed, parseAllowedOrigins } from "./cors.ts";
import { clientAddress, errorResponse } from "./respond.ts";
import { GenerationError } from "../generation/errors.ts";
import { handleActivate } from "./handlers/activate.ts";
import { handleGenerate, type PlanToContinue } from "./handlers/generate.ts";
import { handleImprove } from "./handlers/improve.ts";
import { handleImage } from "./handlers/image.ts";
import { handleWebhook } from "./handlers/webhook.ts";
import { handleAdmin } from "./handlers/admin.ts";
import { SAMPLE_POST } from "./__fixtures__/sample-post.ts";

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

  it("разрешены все заголовки, которые посылает браузер", () => {
    const allowed = corsHeaders(ORIGIN, POLICY)["access-control-allow-headers"] ?? "";
    const sent = allowed.split(",").map((header) => header.trim());

    // apikey — публичный ключ проекта, он в каждом запросе из браузера.
    expect(sent).toContain("apikey");
    expect(sent).toContain("authorization");
    expect(sent).toContain("content-type");
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

/** План, который уже лежит в базе и который можно продлить. */
function storedPosts(count: number): GeneratedPost[] {
  return Array.from({ length: count }, (_unused, index) => ({
    ...SAMPLE_POST,
    number: index + 1,
    date: `2026-03-${String(16 + index).padStart(2, "0")}`,
  }));
}

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
  const appended: { planId: string; posts: readonly GeneratedPost[] }[] = [];
  const stored: PlanToContinue = { request: PLAN_REQUEST, posts: storedPosts(3) };

  return {
    sessionToken,
    quotaStore,
    saved,
    appended,
    stored,
    deps: {
      session,
      attempts,
      cascade: { provider: createFakeProvider(), sleep: (): Promise<void> => Promise.resolve() },
      quota: { store: quotaStore, today: TODAY },
      savePlan: (licenseId: string): Promise<string> => {
        saved.push({ licenseId });
        return Promise.resolve("plan-1");
      },
      loadPlan: (licenseId: string, planId: string): Promise<PlanToContinue | null> =>
        Promise.resolve(licenseId === "license-1" && planId === "plan-1" ? stored : null),
      appendPosts: (_licenseId: string, planId: string, result: unknown): Promise<void> => {
        appended.push({ planId, posts: (result as { posts: readonly GeneratedPost[] }).posts });
        return Promise.resolve();
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

describe("продолжение плана", () => {
  it("дописывает посты в тот же план, а не создаёт второй", async () => {
    const { deps, sessionToken, saved, appended } = await generateDeps();

    const response = await handleGenerate(
      post({ continuePlanId: "plan-1", periodDays: 7 }),
      sessionToken,
      deps,
      RESPONSE,
    );
    await readEvents(response);

    expect(saved).toHaveLength(0);
    expect(appended).toHaveLength(1);
    expect(appended[0]?.planId).toBe("plan-1");
  });

  it("нумерация и даты продолжаются с конца плана", async () => {
    const { deps, sessionToken, appended, stored } = await generateDeps();

    const response = await handleGenerate(
      post({ continuePlanId: "plan-1", periodDays: 7 }),
      sessionToken,
      deps,
      RESPONSE,
    );
    await readEvents(response);

    const fresh = appended[0]?.posts ?? [];
    const lastOld = stored.posts.at(-1);
    expect(fresh[0]?.number).toBe((lastOld?.number ?? 0) + 1);
    expect(fresh[0]?.date).toBe("2026-03-19");
    // Номера не идут по второму кругу: пересечения со старым планом нет.
    const oldNumbers = new Set(stored.posts.map((item) => item.number));
    expect(fresh.some((item) => oldNumbers.has(item.number))).toBe(false);
  });

  it("продолжение чужого плана не находится и модель не вызывает", async () => {
    const { deps, sessionToken, appended } = await generateDeps();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleGenerate(
      post({ continuePlanId: "plan-чужой", periodDays: 7 }),
      sessionToken,
      deps,
      RESPONSE,
    );

    expect(response.status).toBe(404);
    expect(appended).toHaveLength(0);
    log.mockRestore();
  });

  it("нелепый период продолжения отклоняется до модели", async () => {
    const { deps, sessionToken, appended } = await generateDeps();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleGenerate(
      post({ continuePlanId: "plan-1", periodDays: 365 }),
      sessionToken,
      deps,
      RESPONSE,
    );

    expect(response.status).toBe(400);
    expect(appended).toHaveLength(0);
    log.mockRestore();
  });

  it("продолжение стоит одну генерацию, как и новый план", async () => {
    const { deps, sessionToken, quotaStore } = await generateDeps();

    const response = await handleGenerate(
      post({ continuePlanId: "plan-1", periodDays: 7 }),
      sessionToken,
      deps,
      RESPONSE,
    );
    await readEvents(response);

    expect(await quotaStore.usedThisMonth("license-1", "2026-03")).toBe(1);
  });
});

async function improveDeps() {
  const licenses = createMemoryLicenseStore();
  const attempts = createMemoryAttemptStore();
  const improvements = createMemoryQuotaStore(30);
  licenses.add(await hashSecret(KEY, PEPPER), makeLicense());

  const session = { licenses, attempts, pepper: PEPPER, nowMs: NOW, today: TODAY };
  const activation = await handleActivate(post({ key: KEY }), { context: session }, RESPONSE);
  const { sessionToken } = (await activation.json()) as { sessionToken: string };

  const provider = createFakeProvider();
  const stored: PlanToContinue = { request: PLAN_REQUEST, posts: storedPosts(3) };
  const written: { planId: string; post: GeneratedPost }[] = [];

  return {
    sessionToken,
    improvements,
    provider,
    stored,
    written,
    deps: {
      session,
      attempts,
      cascade: { provider, sleep: (): Promise<void> => Promise.resolve() },
      quota: { store: improvements, today: TODAY },
      loadPlan: (licenseId: string, planId: string): Promise<PlanToContinue | null> =>
        Promise.resolve(licenseId === "license-1" && planId === "plan-1" ? stored : null),
      savePost: (licenseId: string, planId: string, edited: GeneratedPost): Promise<boolean> => {
        const owned = licenseId === "license-1" && planId === "plan-1";
        if (owned) written.push({ planId, post: edited });
        return Promise.resolve(owned);
      },
    },
  };
}

describe("улучшение поста", () => {
  const command = { planId: "plan-1", number: 2, instruction: "сделай короче" };

  it("возвращает переделанный пост и сохраняет его тем же путём, что и правка руками", async () => {
    const { deps, sessionToken, written } = await improveDeps();

    const response = await handleImprove(post(command), sessionToken, deps, RESPONSE);
    const body = (await response.json()) as { post: GeneratedPost };

    expect(response.status).toBe(200);
    // Место поста в плане улучшение не меняет: правится текст, а не расписание.
    expect(body.post.number).toBe(2);
    expect(body.post.date).toBe("2026-03-17");
    expect(written).toHaveLength(1);
    expect(written[0]?.post.number).toBe(2);
  });

  it("просьба человека уходит в промпт вместе с текущим текстом поста", async () => {
    const { deps, sessionToken, provider, stored } = await improveDeps();

    await handleImprove(post(command), sessionToken, deps, RESPONSE);

    const prompt = provider.calls[0]?.prompt ?? "";
    expect(prompt).toContain("сделай короче");
    expect(prompt).toContain(stored.posts[1]?.postContent ?? "нет текста");
    // Один слот, а не весь план: улучшается один пост.
    expect(prompt).not.toContain("| 2026-03-18 ");
  });

  it("тратит счётчик улучшений, а не генераций планов", async () => {
    const { deps, sessionToken, improvements } = await improveDeps();

    const response = await handleImprove(post(command), sessionToken, deps, RESPONSE);
    const body = (await response.json()) as { improvements: { used: number; left: number } };

    expect(await improvements.usedThisMonth("license-1", "2026-03")).toBe(1);
    expect(body.improvements).toMatchObject({ used: 1, limit: 30, left: 29 });
  });

  it("сбой модели не стоит человеку улучшения", async () => {
    const { deps, sessionToken, improvements, written } = await improveDeps();
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
    const response = await handleImprove(post(command), sessionToken, broken, RESPONSE);

    expect(response.status).toBe(500);
    expect(written).toHaveLength(0);
    expect(await improvements.usedThisMonth("license-1", "2026-03")).toBe(0);
    log.mockRestore();
  });

  it("исчерпанный счётчик объясняется отдельно от генераций планов", async () => {
    const { deps, sessionToken, improvements, provider } = await improveDeps();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (let taken = 0; taken < 30; taken += 1) {
      await improvements.reserve("license-1", "2026-03");
    }

    const response = await handleImprove(post(command), sessionToken, deps, RESPONSE);
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("IMPROVEMENTS_EXCEEDED");
    expect(body.error.message).toContain("улучшения");
    expect(provider.calls).toHaveLength(0);
    log.mockRestore();
  });

  it("чужой план не улучшается и модель не вызывает", async () => {
    const { deps, sessionToken, provider } = await improveDeps();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleImprove(
      post({ ...command, planId: "plan-чужой" }),
      sessionToken,
      deps,
      RESPONSE,
    );

    expect(response.status).toBe(404);
    expect(provider.calls).toHaveLength(0);
    log.mockRestore();
  });

  it("поста с таким номером в плане нет — это отдельный отказ", async () => {
    const { deps, sessionToken, provider } = await improveDeps();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleImprove(
      post({ ...command, number: 99 }),
      sessionToken,
      deps,
      RESPONSE,
    );
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("POST_NOT_FOUND");
    expect(provider.calls).toHaveLength(0);
    log.mockRestore();
  });

  it("пустая просьба отклоняется до обращения к модели", async () => {
    const { deps, sessionToken, provider, improvements } = await improveDeps();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleImprove(
      post({ ...command, instruction: "   " }),
      sessionToken,
      deps,
      RESPONSE,
    );

    expect(response.status).toBe(400);
    expect(provider.calls).toHaveLength(0);
    expect(await improvements.usedThisMonth("license-1", "2026-03")).toBe(0);
    log.mockRestore();
  });

  it("слишком длинная просьба обрезается, а не отклоняется", async () => {
    const { deps, sessionToken, provider } = await improveDeps();
    const long = `начало ${"а".repeat(INPUT_LIMITS.instruction * 2)} хвост`;

    const response = await handleImprove(
      post({ ...command, instruction: long }),
      sessionToken,
      deps,
      RESPONSE,
    );

    expect(response.status).toBe(200);
    expect(provider.calls[0]?.prompt).not.toContain("хвост");
  });

  it("без сессии не улучшает ничего", async () => {
    const { deps, provider } = await improveDeps();

    const response = await handleImprove(post(command), null, deps, RESPONSE);

    expect(response.status).toBe(401);
    expect(provider.calls).toHaveLength(0);
  });
});

async function imageDeps(provider = createFakeImageProvider()) {
  const licenses = createMemoryLicenseStore();
  const attempts = createMemoryAttemptStore();
  const images = createMemoryQuotaStore(30);
  licenses.add(await hashSecret(KEY, PEPPER), makeLicense());

  const session = { licenses, attempts, pepper: PEPPER, nowMs: NOW, today: TODAY };
  const activation = await handleActivate(post({ key: KEY }), { context: session }, RESPONSE);
  const { sessionToken } = (await activation.json()) as { sessionToken: string };

  const stored: PlanToContinue = { request: PLAN_REQUEST, posts: storedPosts(3) };
  const saved: { planId: string; number: number; mimeType: string; size: number }[] = [];

  return {
    sessionToken,
    images,
    provider,
    stored,
    saved,
    deps: {
      session,
      attempts,
      provider,
      quota: { store: images, today: TODAY },
      loadPlan: (licenseId: string, planId: string): Promise<PlanToContinue | null> =>
        Promise.resolve(licenseId === "license-1" && planId === "plan-1" ? stored : null),
      saveImage: (
        licenseId: string,
        planId: string,
        target: GeneratedPost,
        image: { bytes: Uint8Array; mimeType: string },
      ): Promise<string | null> => {
        if (licenseId !== "license-1" || planId !== "plan-1") return Promise.resolve(null);
        saved.push({
          planId,
          number: target.number,
          mimeType: image.mimeType,
          size: image.bytes.length,
        });
        return Promise.resolve(`https://storage.example/${planId}/${String(target.number)}.png`);
      },
    },
  };
}

describe("картинка к посту", () => {
  const command = { planId: "plan-1", number: 2 };

  it("отдаёт ссылку на картинку и сохраняет её у нужного поста", async () => {
    const { deps, sessionToken, saved } = await imageDeps();

    const response = await handleImage(post(command), sessionToken, deps, RESPONSE);
    const body = (await response.json()) as { imageUrl: string };

    expect(response.status).toBe(200);
    expect(body.imageUrl).toContain("https://storage.example/plan-1/2");
    expect(saved).toEqual([{ planId: "plan-1", number: 2, mimeType: "image/png", size: 4 }]);
  });

  it("модели уходит промпт из поста без мидджорнейских флагов", async () => {
    const { deps, sessionToken, provider } = await imageDeps();

    await handleImage(post(command), sessionToken, deps, RESPONSE);

    const call = provider.calls[0];
    expect(call?.prompt).toContain("sourdough loaf on a wire rack");
    // «--ar 16:9» Google не понимает и напишет флаг прямо в кадре.
    expect(call?.prompt).not.toContain("--ar");
    // Пропорции берутся у площадки и передаются настройкой запроса.
    expect(call?.aspectRatio).toBe("16:9");
  });

  it("тратит счётчик картинок, а не генераций и не улучшений", async () => {
    const { deps, sessionToken, images } = await imageDeps();

    const response = await handleImage(post(command), sessionToken, deps, RESPONSE);
    const body = (await response.json()) as { images: { used: number; left: number } };

    expect(await images.usedThisMonth("license-1", "2026-03")).toBe(1);
    expect(body.images).toMatchObject({ used: 1, limit: 30, left: 29 });
  });

  it("сбой модели не стоит человеку картинки", async () => {
    const broken = createFakeImageProvider(
      new GenerationError("PROVIDER_UNAVAILABLE", "рисовалка не отвечает"),
    );
    const { deps, sessionToken, images, saved } = await imageDeps(broken);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleImage(post(command), sessionToken, deps, RESPONSE);

    expect(response.status).toBe(503);
    expect(saved).toHaveLength(0);
    expect(await images.usedThisMonth("license-1", "2026-03")).toBe(0);
    log.mockRestore();
  });

  it("исчерпанный счётчик объясняется отдельно от планов и улучшений", async () => {
    const { deps, sessionToken, images, provider } = await imageDeps();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (let taken = 0; taken < 30; taken += 1) {
      await images.reserve("license-1", "2026-03");
    }

    const response = await handleImage(post(command), sessionToken, deps, RESPONSE);
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("IMAGES_EXCEEDED");
    expect(body.error.message).toContain("картинки");
    expect(provider.calls).toHaveLength(0);
    log.mockRestore();
  });

  it("к чужому плану картинку не рисует", async () => {
    const { deps, sessionToken, provider } = await imageDeps();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleImage(
      post({ ...command, planId: "plan-чужой" }),
      sessionToken,
      deps,
      RESPONSE,
    );

    expect(response.status).toBe(404);
    expect(provider.calls).toHaveLength(0);
    log.mockRestore();
  });

  it("поста с таким номером в плане нет — отказ до модели", async () => {
    const { deps, sessionToken, provider } = await imageDeps();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleImage(post({ ...command, number: 99 }), sessionToken, deps, RESPONSE);
    const body = (await response.json()) as { error: { code: string } };

    expect(response.status).toBe(404);
    expect(body.error.code).toBe("POST_NOT_FOUND");
    expect(provider.calls).toHaveLength(0);
    log.mockRestore();
  });

  it("без сессии не рисует ничего", async () => {
    const { deps, provider } = await imageDeps();

    const response = await handleImage(post(command), null, deps, RESPONSE);

    expect(response.status).toBe(401);
    expect(provider.calls).toHaveLength(0);
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
