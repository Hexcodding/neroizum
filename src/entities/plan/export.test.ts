import { describe, expect, it } from "vitest";
import type { GeneratedPost } from "@contracts";
import { safeFileName, toCsv, toPlainText } from "./export";

function makePost(overrides: Partial<GeneratedPost> = {}): GeneratedPost {
  return {
    number: 1,
    date: "2026-03-16",
    time: "10:00",
    platform: "telegram",
    rubric: "Разбор ошибки",
    format: "Текстовый пост",
    title: "Почему хлеб черствеет",
    hook: "Убираете тёплым в пакет.",
    description: "Разбор ошибки хранения.",
    script: "",
    type: "Обучающий",
    cta: "Расскажите, как храните вы.",
    hashtags: ["#хлеб", "#закваска"],
    visual: "Буханка на решётке.",
    visualStyle: "craft-design",
    imagePrompt: "sourdough loaf, --ar 16:9",
    postContent: "Текст поста.",
    ...overrides,
  };
}

describe("выгрузка текстом", () => {
  it("группирует по дням и содержит сам текст поста", () => {
    const text = toPlainText("Пекарня", [
      makePost(),
      makePost({ number: 2, date: "2026-03-18", postContent: "Второй пост." }),
    ]);

    expect(text).toContain("КОНТЕНТ-ПЛАН: Пекарня");
    expect(text).toContain("Текст поста.");
    expect(text).toContain("Второй пост.");
    // Дни идут по возрастанию даты, а не в порядке прихода постов.
    expect(text.indexOf("Текст поста.")).toBeLessThan(text.indexOf("Второй пост."));
  });

  it("включает призыв и хештеги — то, что публикуется вместе с текстом", () => {
    const text = toPlainText("Пекарня", [makePost()]);

    expect(text).toContain("Расскажите, как храните вы.");
    expect(text).toContain("#хлеб #закваска");
  });
});

describe("выгрузка таблицей", () => {
  it("начинается с метки кодировки и разделяет точкой с запятой", () => {
    const csv = toCsv([makePost()]);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.split("\r\n")[0]).toContain('"Дата";"Время"');
  });

  it("кавычки внутри текста удваиваются, и таблица не разъезжается", () => {
    const csv = toCsv([makePost({ postContent: 'Он сказал: "готово"' })]);

    expect(csv).toContain('"Он сказал: ""готово"""');
    // Одна строка заголовка и одна строка данных: перевод строки внутри поля
    // не должен создавать третью.
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it("перевод строки внутри поста остаётся внутри ячейки", () => {
    const csv = toCsv([makePost({ postContent: "Первая строка\nВторая строка" })]);

    expect(csv).toContain("Первая строка\nВторая строка");
  });
});

describe("имя файла", () => {
  it("убирает символы, запрещённые в файловой системе", () => {
    expect(safeFileName('План: "хлеб"/март', "txt")).toBe("План хлеб март.txt");
  });

  it("у плана без названия есть имя по умолчанию", () => {
    expect(safeFileName("   ", "csv")).toBe("контент-план.csv");
  });
});
