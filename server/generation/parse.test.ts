import { describe, expect, it } from "vitest";
import { parsePlanResponse } from "./parse";

describe("разбор ответа", () => {
  it("читает обычный массив", () => {
    const result = parsePlanResponse('[{"number":1},{"number":2}]');
    expect(result.items).toHaveLength(2);
    expect(result.rescued).toBe(false);
  });

  it("не спотыкается на обёртке из тройных кавычек", () => {
    const result = parsePlanResponse('```json\n[{"number":1}]\n```');
    expect(result.items).toHaveLength(1);
    expect(result.rescued).toBe(false);
  });

  it("отбрасывает болтовню модели до массива", () => {
    const result = parsePlanResponse('Конечно! Вот ваш план:\n[{"number":1}]');
    expect(result.items).toHaveLength(1);
  });
});

describe("спасение оборванного ответа", () => {
  it("достаёт целые посты, когда последний обрезан", () => {
    const truncated = '[{"number":1,"title":"первый"},{"number":2,"title":"второй"},{"number":3,"tit';
    const result = parsePlanResponse(truncated);

    expect(result.rescued).toBe(true);
    expect(result.items).toHaveLength(2);
    expect(result.items[1]?.title).toBe("второй");
  });

  it("не путает скобки внутри текста поста со структурой", () => {
    const withBraces =
      '[{"number":1,"postContent":"Пример: {\\"это\\": \\"строка\\"} внутри текста"},{"number":2,"post';
    const result = parsePlanResponse(withBraces);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.number).toBe(1);
  });

  it("пропускает один битый объект и сохраняет остальные", () => {
    const broken = '[{"number":1},{"number":,,,},{"number":3}]';
    const result = parsePlanResponse(broken);

    expect(result.items.map((item) => item.number)).toEqual([1, 3]);
    expect(result.rescued).toBe(true);
  });

  it("падает понятной ошибкой, если спасать нечего", () => {
    expect(() => parsePlanResponse("Извините, не могу помочь.")).toThrow(/разобрать/i);
    expect(() => parsePlanResponse("")).toThrow(/пустой/i);
  });
});
