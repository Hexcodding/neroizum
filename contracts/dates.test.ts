import { describe, expect, it } from "vitest";
import { addDays, formatHumanDate, parseIsoDate, weekdayName } from "./dates";

describe("даты", () => {
  it("разбирает корректную дату", () => {
    const date = parseIsoDate("2026-03-15");
    expect(date).not.toBeNull();
    expect(date?.getUTCFullYear()).toBe(2026);
    expect(date?.getUTCMonth()).toBe(2);
    expect(date?.getUTCDate()).toBe(15);
  });

  it("отвергает несуществующие и мусорные даты", () => {
    expect(parseIsoDate("2026-02-31")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("15.03.2026")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
  });

  it("считает переход через конец месяца", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("учитывает високосный год", () => {
    expect(parseIsoDate("2028-02-29")).not.toBeNull();
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(parseIsoDate("2026-02-29")).toBeNull();
  });

  it("считает переход через конец года", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("определяет день недели", () => {
    // 15 марта 2026 года — воскресенье.
    expect(weekdayName("2026-03-15")).toBe("Воскресенье");
    expect(weekdayName("2026-03-16")).toBe("Понедельник");
  });

  it("собирает дату для человека", () => {
    expect(formatHumanDate("2026-03-16")).toBe("16.03.2026, понедельник");
  });
});
