import { describe, expect, it } from "vitest";
import { CONTENT_TYPES, GOAL_IDS } from "../../contracts/index.ts";
import { CONTENT_MIX_BY_GOAL, expectedTypeCounts } from "./blocks/funnel.ts";

describe("стратегия под цель", () => {
  it("каждая цель даёт свои пропорции", () => {
    expect(CONTENT_MIX_BY_GOAL.sales).not.toEqual(CONTENT_MIX_BY_GOAL.reach);
    expect(CONTENT_MIX_BY_GOAL.reach).not.toEqual(CONTENT_MIX_BY_GOAL.loyalty);
  });

  it("сумма долей каждой цели равна ста процентам", () => {
    for (const goal of GOAL_IDS) {
      const mix = CONTENT_MIX_BY_GOAL[goal];
      const total = CONTENT_TYPES.reduce((sum, type) => sum + mix[type], 0);
      expect(total, `цель ${goal}`).toBe(100);
    }
  });

  it("продажи дают больше продающих постов, чем охваты", () => {
    expect(CONTENT_MIX_BY_GOAL.sales.Продающий).toBeGreaterThan(
      CONTENT_MIX_BY_GOAL.reach.Продающий,
    );
  });
});

describe("точные количества по типам", () => {
  it("сумма всегда совпадает с количеством постов", () => {
    for (const goal of GOAL_IDS) {
      for (const total of [1, 3, 6, 13, 30]) {
        const counts = expectedTypeCounts(total, CONTENT_MIX_BY_GOAL[goal]);
        const sum = CONTENT_TYPES.reduce((accumulated, type) => accumulated + counts[type], 0);
        expect(sum, `цель ${goal}, постов ${String(total)}`).toBe(total);
      }
    }
  });

  it("на малом количестве постов преобладает главный тип цели", () => {
    const counts = expectedTypeCounts(3, CONTENT_MIX_BY_GOAL.reach);
    expect(counts.Обучающий).toBeGreaterThanOrEqual(1);
  });

  it("не выдаёт отрицательных значений", () => {
    const counts = expectedTypeCounts(1, CONTENT_MIX_BY_GOAL.loyalty);
    for (const type of CONTENT_TYPES) {
      expect(counts[type]).toBeGreaterThanOrEqual(0);
    }
  });
});
