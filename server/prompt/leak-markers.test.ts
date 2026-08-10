/**
 * Список фраз, по которым ищется утечка промпта в браузерный бандл, обязан
 * состоять из фраз, которые в промпте действительно есть.
 *
 * Иначе получается худший из возможных исходов: проверка отрабатывает, ничего
 * не находит, все спокойны — а искала она текст, которого давно нет. Именно
 * поэтому тест сверяет каждый маркер с собранным промптом.
 */
import { describe, expect, it } from "vitest";
import { buildSchedule, EMPTY_BRAND_PROFILE, type GenerationRequest } from "@contracts";
import markers from "../../scripts/prompt-leak-markers.json";
import { buildPrompt } from "./index";

function buildSample(infoPlanMode: boolean): string {
  const request: GenerationRequest = {
    niche: "пекарня",
    audience: "жители района",
    goal: "sales",
    platforms: ["telegram"],
    postsPerWeek: 3,
    periodDays: 7,
    channelStage: "start",
    authorRole: "founder",
    brand: EMPTY_BRAND_PROFILE,
    infoPlanMode,
    startDate: "2026-03-02",
    previousPosts: [],
  };

  const slots = buildSchedule({
    startDate: request.startDate,
    periodDays: request.periodDays,
    postsPerWeek: request.postsPerWeek,
    platforms: request.platforms,
  });

  return buildPrompt(request, slots).text;
}

describe("маркеры защиты бандла", () => {
  // Инфо-план включается флагом, поэтому его фразы ищем во втором варианте.
  const prompts = [buildSample(false), buildSample(true)];

  it("список не пуст", () => {
    expect(markers.markers.length).toBeGreaterThan(5);
  });

  it("каждый маркер встречается в промпте", () => {
    for (const marker of markers.markers) {
      const found = prompts.some((prompt) => prompt.includes(marker));
      expect(found, `маркер «${marker}» не найден в промпте`).toBe(true);
    }
  });

  it("маркеры достаточно длинные, чтобы не совпасть случайно", () => {
    for (const marker of markers.markers) {
      expect(marker.length, `маркер «${marker}»`).toBeGreaterThan(8);
    }
  });
});
