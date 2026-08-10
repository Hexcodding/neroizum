import { describe, expect, it, vi } from "vitest";
import type { GeneratedPost } from "../../contracts/index.ts";
import { hashSecret } from "../access/keys.ts";
import {
  createMemoryAttemptStore,
  createMemoryLicenseStore,
  createMemoryQuotaStore,
  makeLicense,
} from "../access/__fixtures__/memory-stores.ts";
import { corsHeaders } from "./cors.ts";
import { handleActivate } from "./handlers/activate.ts";
import { handlePlans, type PlanStore } from "./handlers/plans.ts";

const PEPPER = "тестовый-секрет";
const KEY = "NZM-A2B3-C4D5-E6F7";
const NOW = Date.UTC(2026, 2, 15);
const TODAY = "2026-03-15";
const RESPONSE = { cors: corsHeaders("https://neuroizium.ru", { allowedOrigins: [] }) };

function post(body: unknown): Request {
  return new Request("https://api.example/plans", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const SAMPLE_POST: GeneratedPost = {
  number: 1,
  date: "2026-03-16",
  time: "10:00",
  platform: "telegram",
  rubric: "Разбор ошибки",
  format: "Текстовый пост",
  title: "Почему хлеб черствеет",
  hook: "Вы убираете хлеб тёплым в пакет.",
  description: "Разбор ошибки хранения.",
  script: "",
  type: "Обучающий",
  cta: "Расскажите, как храните вы.",
  hashtags: ["#хлеб"],
  visual: "Буханка на решётке.",
  visualStyle: "craft-design",
  imagePrompt: "sourdough loaf on a wire rack, --ar 16:9",
  postContent: "Текст поста, готовый к публикации.",
};

/** Хранилище, которое честно учитывает владельца: план виден только своему. */
function makeStore(): PlanStore & { readonly updates: unknown[] } {
  const owner = "license-1";
  const updates: unknown[] = [];

  return {
    updates,
    list: (licenseId) => Promise.resolve(licenseId === owner ? [{ id: "plan-1" }] : []),
    load: (licenseId, planId) =>
      Promise.resolve(licenseId === owner && planId === "plan-1" ? { id: "plan-1" } : null),
    updatePost: (licenseId, planId, editedPost) => {
      const allowed = licenseId === owner && planId === "plan-1";
      if (allowed) updates.push(editedPost);
      return Promise.resolve(allowed);
    },
    remove: (licenseId, planId) => Promise.resolve(licenseId === owner && planId === "plan-1"),
  };
}

async function makeDeps() {
  const licenses = createMemoryLicenseStore();
  const attempts = createMemoryAttemptStore();
  licenses.add(await hashSecret(KEY, PEPPER), makeLicense());

  const session = { licenses, attempts, pepper: PEPPER, nowMs: NOW, today: TODAY };
  const activation = await handleActivate(
    new Request("https://api.example/activate", {
      method: "POST",
      body: JSON.stringify({ key: KEY }),
    }),
    { context: session },
    RESPONSE,
  );
  const { sessionToken } = (await activation.json()) as { sessionToken: string };
  const store = makeStore();
  const quotaStore = createMemoryQuotaStore(20);

  return {
    sessionToken,
    store,
    quotaStore,
    deps: { session, store, quota: { store: quotaStore, today: TODAY } },
  };
}

describe("мои планы", () => {
  it("без сессии не отдаёт ничего", async () => {
    const { deps } = await makeDeps();

    const response = await handlePlans(post({ action: "list" }), null, deps, RESPONSE);

    expect(response.status).toBe(401);
  });

  it("отдаёт список и открывает план владельцу", async () => {
    const { deps, sessionToken } = await makeDeps();

    const list = await handlePlans(post({ action: "list" }), sessionToken, deps, RESPONSE);
    const one = await handlePlans(
      post({ action: "get", planId: "plan-1" }),
      sessionToken,
      deps,
      RESPONSE,
    );

    expect((await list.json()) as { plans: unknown[] }).toEqual({ plans: [{ id: "plan-1" }] });
    expect(one.status).toBe(200);
  });

  it("чужой план не находится", async () => {
    const { deps, sessionToken } = await makeDeps();

    const response = await handlePlans(
      post({ action: "get", planId: "plan-чужой" }),
      sessionToken,
      deps,
      RESPONSE,
    );

    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).toContain("Такого плана нет");
  });

  it("правка поста сохраняется", async () => {
    const { deps, sessionToken, store } = await makeDeps();

    const response = await handlePlans(
      post({ action: "update-post", planId: "plan-1", post: SAMPLE_POST }),
      sessionToken,
      deps,
      RESPONSE,
    );

    expect(response.status).toBe(200);
    expect(store.updates).toEqual([SAMPLE_POST]);
  });

  it("пустой текст поста не сохраняется, и объясняется почему", async () => {
    const { deps, sessionToken, store } = await makeDeps();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handlePlans(
      post({ action: "update-post", planId: "plan-1", post: { ...SAMPLE_POST, postContent: "  " } }),
      sessionToken,
      deps,
      RESPONSE,
    );

    expect(response.status).toBe(400);
    expect(JSON.stringify(await response.json())).toContain("Текст поста не может быть пустым");
    expect(store.updates).toHaveLength(0);
    log.mockRestore();
  });

  it("подменённая площадка не проходит", async () => {
    const { deps, sessionToken } = await makeDeps();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handlePlans(
      post({
        action: "update-post",
        planId: "plan-1",
        post: { ...SAMPLE_POST, platform: "своя-площадка" },
      }),
      sessionToken,
      deps,
      RESPONSE,
    );

    expect(response.status).toBe(400);
    log.mockRestore();
  });

  it("удаление чужого плана ничего не удаляет", async () => {
    const { deps, sessionToken } = await makeDeps();

    const response = await handlePlans(
      post({ action: "delete", planId: "plan-чужой" }),
      sessionToken,
      deps,
      RESPONSE,
    );

    expect(response.status).toBe(404);
  });

  it("остаток генераций считается по календарному месяцу", async () => {
    const { deps, sessionToken, quotaStore } = await makeDeps();
    await quotaStore.reserve("license-1", "2026-03");
    await quotaStore.reserve("license-1", "2026-03");
    // Генерация прошлого месяца остаток этого не уменьшает.
    await quotaStore.reserve("license-1", "2026-02");

    const response = await handlePlans(post({ action: "quota" }), sessionToken, deps, RESPONSE);

    expect(await response.json()).toEqual({
      quota: { used: 2, limit: 20, left: 18 },
      subscriptionUntil: "2026-12-31",
    });
  });

  it("остаток чужой лицензии не виден", async () => {
    const { deps, sessionToken, quotaStore } = await makeDeps();
    await quotaStore.reserve("license-другой", "2026-03");

    const response = await handlePlans(post({ action: "quota" }), sessionToken, deps, RESPONSE);

    expect((await response.json()) as { quota: { used: number } }).toMatchObject({
      quota: { used: 0 },
    });
  });

  it("неизвестное действие отклоняется", async () => {
    const { deps, sessionToken } = await makeDeps();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handlePlans(post({ action: "выгрузить-всё" }), sessionToken, deps, RESPONSE);

    expect(response.status).toBe(400);
    log.mockRestore();
  });
});
