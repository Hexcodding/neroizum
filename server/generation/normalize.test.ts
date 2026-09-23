/**
 * Нормализация ответа модели. Служебные поля схемы не должны протекать
 * в сохранённый пост: иначе через месяц в базе окажется черновик размышлений.
 */
import { describe, expect, it } from "vitest";
import { normalizePost } from "./normalize.ts";

const SLOT = {
  number: 1,
  date: "2026-03-02",
  weekday: "Понедельник",
  platform: "telegram" as const,
};

describe("нормализация поста", () => {
  it("отбрасывает служебную самопроверку из схемы ответа", () => {
    const post = normalizePost(
      {
        _zeroClickCheck: "польза есть, пункты раскрыты, готов в прод",
        number: 99,
        date: "2099-01-01",
        time: "18:30",
        platform: "ok",
        rubric: "Разбор ошибки",
        format: "Текстовый пост",
        title: "Почему хлеб черствеет за сутки",
        hook: "Тёплый пакет.",
        description: "Хранение.",
        script: "",
        type: "Обучающий",
        cta: "Напишите, как храните.",
        hashtags: ["#хлеб"],
        visual: "Буханка.",
        visualStyle: "craft-design",
        imagePrompt: "sourdough loaf",
        postContent: "Дайте хлебу остыть на решётке два часа и уберите в лён.",
      },
      SLOT,
    );

    expect(post).not.toHaveProperty("_zeroClickCheck");
    // Расписание — источник правды: номер, дата и площадка из слота, не из модели.
    expect(post.number).toBe(1);
    expect(post.date).toBe("2026-03-02");
    expect(post.platform).toBe("telegram");
    expect(post.time).toBe("18:30");
  });
});
