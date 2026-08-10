import { describe, expect, it } from "vitest";
import { buildSchedule, countByPlatform, postCount } from "./schedule";
import type { PlatformId } from "./platforms";

describe("количество постов", () => {
  it("считается из частоты и длины периода", () => {
    expect(postCount(7, 3)).toBe(3);
    expect(postCount(14, 3)).toBe(6);
    expect(postCount(30, 3)).toBe(13);
    expect(postCount(7, 7)).toBe(7);
    expect(postCount(30, 7)).toBe(30);
  });

  it("никогда не равно нулю", () => {
    expect(postCount(1, 2)).toBe(1);
  });
});

describe("расписание", () => {
  const platforms: readonly PlatformId[] = ["telegram", "vk", "max"];

  it("начинается с указанной даты и не выходит за период", () => {
    const slots = buildSchedule({
      startDate: "2026-03-02",
      periodDays: 14,
      postsPerWeek: 3,
      platforms,
    });

    expect(slots).toHaveLength(6);
    expect(slots[0]?.date).toBe("2026-03-02");
    expect(slots.at(-1)?.date).toBe("2026-03-13");
  });

  it("не ставит два поста на один день", () => {
    const slots = buildSchedule({
      startDate: "2026-03-02",
      periodDays: 30,
      postsPerWeek: 3,
      platforms,
    });
    const dates = new Set(slots.map((slot) => slot.date));
    expect(dates.size).toBe(slots.length);
  });

  it("распределяет площадки равномерно", () => {
    const slots = buildSchedule({
      startDate: "2026-03-02",
      periodDays: 30,
      postsPerWeek: 7,
      platforms,
    });
    const counts = Object.values(countByPlatform(slots));

    expect(counts).toHaveLength(platforms.length);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  });

  it("каждая выбранная площадка появляется в плане", () => {
    const slots = buildSchedule({
      startDate: "2026-03-02",
      periodDays: 7,
      postsPerWeek: 5,
      platforms: ["telegram", "vk", "max", "tiktok", "ok"],
    });
    const used = new Set(slots.map((slot) => slot.platform));
    expect(used.size).toBe(5);
  });

  it("продолжает нумерацию и чередование площадок", () => {
    const first = buildSchedule({
      startDate: "2026-03-02",
      periodDays: 7,
      postsPerWeek: 3,
      platforms,
    });
    const second = buildSchedule({
      startDate: "2026-03-09",
      periodDays: 7,
      postsPerWeek: 3,
      platforms,
      startNumber: first.length + 1,
      platformOffset: first.length,
    });

    expect(second[0]?.number).toBe(4);
    // Первая часть закончилась на третьей площадке, вторая начинается с первой.
    expect(first.at(-1)?.platform).toBe("max");
    expect(second[0]?.platform).toBe("telegram");
  });

  it("падает понятной ошибкой без площадок", () => {
    expect(() =>
      buildSchedule({ startDate: "2026-03-02", periodDays: 7, postsPerWeek: 3, platforms: [] }),
    ).toThrow(/площадка/i);
  });
});
