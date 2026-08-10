import { describe, expect, it, vi } from "vitest";
import { EMPTY_BRAND_PROFILE, type GenerationRequest, type PeriodDays } from "../../contracts/index.ts";
import { generatePlan, type QuotaGuard } from "./orchestrate.ts";
import { GenerationError } from "./errors.ts";
import { createFakeProvider, type FakeBehaviour } from "./__fixtures__/fake-provider.ts";

function makeRequest(overrides: Partial<GenerationRequest> = {}): GenerationRequest {
  return {
    niche: "домашняя пекарня, хлеб на закваске",
    audience: "жители района, семьи с детьми",
    goal: "loyalty",
    platforms: ["telegram", "vk"],
    postsPerWeek: 3,
    periodDays: 7,
    channelStage: "start",
    authorRole: "founder",
    brand: EMPTY_BRAND_PROFILE,
    infoPlanMode: false,
    startDate: "2026-03-02",
    previousPosts: [],
    ...overrides,
  };
}

function run(request: unknown, script: readonly FakeBehaviour[] = [], signal?: AbortSignal) {
  const provider = createFakeProvider(script);
  const promise = generatePlan(request, {
    cascade: { provider, sleep: () => Promise.resolve() },
    signal,
  });
  return { provider, promise };
}

describe("генерация плана", () => {
  it("собирает план на нужное количество постов", async () => {
    const { promise } = run(makeRequest());
    const result = await promise;

    expect(result.posts).toHaveLength(3);
    expect(result.stopped).toBe(false);
    expect(result.promptVersion).toBe("1.0.0");
  });

  it("даты и площадки берутся из расписания, а не из ответа модели", async () => {
    const { promise } = run(makeRequest(), [
      { kind: "ok-with", overrides: { date: "1999-01-01", platform: "tiktok" } },
    ]);
    const result = await promise;

    expect(result.posts[0]?.date).toBe("2026-03-02");
    expect(result.posts.map((post) => post.platform)).toEqual(["telegram", "vk", "telegram"]);
  });

  it("длинный план собирается частями и показывает прогресс", async () => {
    const events: number[] = [];
    const provider = createFakeProvider();
    const result = await generatePlan(makeRequest({ periodDays: 30, postsPerWeek: 7 }), {
      cascade: { provider, sleep: () => Promise.resolve() },
      onProgress: (event) => events.push(event.readyPosts),
    });

    expect(result.posts).toHaveLength(30);
    // Тридцать постов не влезают в один ответ: частей должно быть несколько.
    expect(provider.calls.length).toBeGreaterThan(1);
    expect(events).toEqual([8, 16, 24, 30]);
  });

  it("каждая следующая часть знает предыдущие посты", async () => {
    const { provider, promise } = run(makeRequest({ periodDays: 30, postsPerWeek: 7 }));
    await promise;

    expect(provider.calls[0]?.prompt).not.toContain("УЖЕ СОЗДАННЫЕ ПОСТЫ");
    expect(provider.calls[1]?.prompt).toContain("УЖЕ СОЗДАННЫЕ ПОСТЫ");
  });

  it("недостающие посты добираются повторным запросом, а не теряются", async () => {
    const { provider, promise } = run(makeRequest(), [{ kind: "partial", count: 1 }]);
    const result = await promise;

    expect(result.posts).toHaveLength(3);
    expect(provider.calls).toHaveLength(2);
  });

  it("спасает оборванный ответ и помечает это в результате", async () => {
    const { promise } = run(makeRequest(), [{ kind: "truncated" }]);
    const result = await promise;

    expect(result.rescuedBatches).toBe(1);
    expect(result.posts).toHaveLength(3);
  });
});

describe("проверка качества и перезапрос", () => {
  it("плохой пост переписывается вторым запросом молча для пользователя", async () => {
    const { provider, promise } = run(makeRequest(), [
      {
        kind: "ok-with",
        onlyIndex: 1,
        overrides: { postContent: "Подробности смотри карусель." },
      },
      { kind: "ok" },
    ]);
    const result = await promise;

    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1]?.prompt).toContain("ИСПРАВЛЕНИЕ");
    expect(provider.calls[1]?.prompt).toContain("смотри карусель");
    expect(result.quality.defects).toHaveLength(0);
  });

  it("перезапрос просит переделать только испорченный пост", async () => {
    const { provider, promise } = run(makeRequest(), [
      { kind: "ok-with", onlyIndex: 1, overrides: { postContent: "Коротко." } },
      { kind: "ok" },
    ]);
    await promise;

    const repairPrompt = provider.calls[1]?.prompt ?? "";
    expect(repairPrompt).toContain("Создай РОВНО 1 постов");
    expect(repairPrompt).toContain("пост №2");
  });

  it("если исправить не удалось, план всё равно отдаётся с замечаниями", async () => {
    // Ошибка нашей стороны: каскад её не повторяет, поэтому перезапрос
    // проваливается окончательно — именно это здесь и проверяется.
    const { promise } = run(makeRequest(), [
      { kind: "ok-with", onlyIndex: 1, overrides: { postContent: "Коротко." } },
      { kind: "fail", error: new GenerationError("INTERNAL", "тест") },
    ]);
    const result = await promise;

    expect(result.posts).toHaveLength(3);
    expect(result.quality.defects.length).toBeGreaterThan(0);
  });

  it("когда плохих постов больше половины, перезапрос не делается", async () => {
    const { provider, promise } = run(makeRequest(), [
      { kind: "ok-with", overrides: { postContent: "Коротко." } },
    ]);
    const result = await promise;

    expect(provider.calls).toHaveLength(1);
    expect(result.quality.defects).toHaveLength(3);
  });
});

describe("остановка и квота", () => {
  it("остановка сохраняет уже готовые посты", async () => {
    const controller = new AbortController();
    const provider = createFakeProvider();
    const result = await generatePlan(makeRequest({ periodDays: 30, postsPerWeek: 7 }), {
      cascade: { provider, sleep: () => Promise.resolve() },
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });

    expect(result.stopped).toBe(true);
    expect(result.posts).toHaveLength(8);
  });

  it("квота подтверждается только после успеха", async () => {
    const order: string[] = [];
    const quota: QuotaGuard = {
      reserve: () => {
        order.push("reserve");
        return Promise.resolve();
      },
      commit: () => {
        order.push("commit");
        return Promise.resolve();
      },
      release: () => {
        order.push("release");
        return Promise.resolve();
      },
    };

    const provider = createFakeProvider();
    await generatePlan(makeRequest(), {
      cascade: { provider, sleep: () => Promise.resolve() },
      quota,
    });

    expect(order).toEqual(["reserve", "commit"]);
  });

  it("при сбое квота возвращается клиенту", async () => {
    const release = vi.fn(() => Promise.resolve());
    const commit = vi.fn(() => Promise.resolve());
    const provider = createFakeProvider([{ kind: "raw", text: "не могу помочь" }]);

    await expect(
      generatePlan(makeRequest(), {
        cascade: { provider, sleep: () => Promise.resolve() },
        quota: { reserve: () => Promise.resolve(), commit, release },
      }),
    ).rejects.toMatchObject({ code: "BAD_RESPONSE" });

    expect(release).toHaveBeenCalledTimes(1);
    expect(commit).not.toHaveBeenCalled();
  });
});

describe("проверка запроса", () => {
  it("пустая ниша не уходит к модели", async () => {
    const { provider, promise } = run(makeRequest({ niche: "хлеб" }));

    await expect(promise).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(provider.calls).toHaveLength(0);
  });

  it("ошибка называет поле и говорит, что поправить", async () => {
    const { promise } = run(makeRequest({ platforms: [] }));

    await expect(promise).rejects.toMatchObject({
      fields: [{ field: "platforms", message: "Выберите хотя бы одну площадку." }],
    });
  });

  it("невозможный период отклоняется до запроса", async () => {
    const { promise } = run(makeRequest({ periodDays: 90 as PeriodDays }));
    await expect(promise).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });
});
