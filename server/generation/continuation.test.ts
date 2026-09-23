/**
 * Продолжение плана. Проверяется то, что человек замечает сразу: посты не
 * начинаются заново с первого номера, не встают на уже занятые дни и не
 * ломают чередование площадок.
 */
import { describe, expect, it } from "vitest";
import {
  buildSchedule,
  EMPTY_BRAND_PROFILE,
  type GeneratedPost,
  type GenerationRequest,
} from "../../contracts/index.ts";
import { SAMPLE_POST } from "../http/__fixtures__/sample-post.ts";
import {
  buildContinuation,
  CONTINUATION_CONTEXT_POSTS,
  readContinuationCommand,
} from "./continuation.ts";

const REQUEST: GenerationRequest = {
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
};

/** Посты так, как их создал бы первый прогон: по расписанию из контрактов. */
function existingPosts(count: number): GeneratedPost[] {
  return buildSchedule({
    startDate: REQUEST.startDate,
    periodDays: 30,
    postsPerWeek: 7,
    platforms: REQUEST.platforms,
  })
    .slice(0, count)
    .map((slot) => ({ ...SAMPLE_POST, ...slot }));
}

describe("заявка на продолжение", () => {
  it("нумерация продолжается, а не начинается заново", () => {
    const continued = buildContinuation(REQUEST, existingPosts(3), 7);

    expect(continued.startNumber).toBe(4);
    expect(continued.platformOffset).toBe(3);
  });

  it("первый новый пост встаёт на день после последнего старого", () => {
    const posts = existingPosts(3);
    const continued = buildContinuation(REQUEST, posts, 14);

    expect(posts.at(-1)?.date).toBe("2026-03-04");
    expect(continued.request.startDate).toBe("2026-03-05");
    expect(continued.request.periodDays).toBe(14);
  });

  it("чередование площадок не сбивается на стыке частей", () => {
    const posts = existingPosts(3);
    const continued = buildContinuation(REQUEST, posts, 7);

    const next = buildSchedule({
      startDate: continued.request.startDate,
      periodDays: continued.request.periodDays,
      postsPerWeek: REQUEST.postsPerWeek,
      platforms: REQUEST.platforms,
      startNumber: continued.startNumber,
      platformOffset: continued.platformOffset,
    });

    expect(posts.map((post) => post.platform)).toEqual(["telegram", "vk", "telegram"]);
    expect(next.map((slot) => slot.platform)).toEqual(["vk", "telegram", "vk"]);
    expect(next.map((slot) => slot.number)).toEqual([4, 5, 6]);
  });

  it("предыстория обрезается: в промпт уходят только последние посты", () => {
    const posts = existingPosts(30);
    const continued = buildContinuation(REQUEST, posts, 30);

    expect(continued.request.previousPosts).toHaveLength(CONTINUATION_CONTEXT_POSTS);
    // Обрезаются давние, а не свежие: повтор грозит прежде всего с соседями.
    expect(continued.request.previousPosts.at(-1)?.number).toBe(30);
    // Нумерация при этом считается по плану целиком, а не по обрезку.
    expect(continued.startNumber).toBe(31);
  });

  it("порядок постов в базе не влияет на результат", () => {
    const shuffled = [...existingPosts(5)].reverse();
    const continued = buildContinuation(REQUEST, shuffled, 7);

    expect(continued.startNumber).toBe(6);
    expect(continued.request.previousPosts.map((post) => post.number)).toEqual([1, 2, 3, 4, 5]);
  });

  it("план без постов продолжать нечем", () => {
    expect(() => buildContinuation(REQUEST, [], 7)).toThrowError(/нет постов/);
  });
});

describe("разбор просьбы продолжить", () => {
  it("обычная заявка продолжением не считается", () => {
    expect(readContinuationCommand({ niche: "пекарня", periodDays: 7 })).toBeNull();
  });

  it("продолжение узнаётся по идентификатору плана", () => {
    expect(readContinuationCommand({ continuePlanId: "plan-1", periodDays: 14 })).toEqual({
      planId: "plan-1",
      periodDays: 14,
    });
  });

  it("период не из списка отклоняется до обращения к базе", () => {
    expect(() =>
      readContinuationCommand({ continuePlanId: "plan-1", periodDays: 365 }),
    ).toThrowError(/период продолжения/);
  });
});
