import { describe, expect, it } from "vitest";
import type { GeneratedPost } from "@contracts";
import { groupByDay, platformName, postToClipboard, separateCta } from "./view";

function makePost(number: number, date: string, time: string): GeneratedPost {
  return {
    number,
    date,
    time,
    platform: "telegram",
    rubric: "Разбор ошибки",
    format: "Текстовый пост",
    title: `Пост ${String(number)}`,
    hook: "Хук.",
    description: "Описание.",
    script: "",
    type: "Обучающий",
    cta: "Призыв.",
    hashtags: ["#хлеб"],
    visual: "Картинка.",
    visualStyle: "craft-design",
    imagePrompt: "prompt",
    postContent: "Текст.",
  };
}

describe("группировка по дням", () => {
  it("дни идут по возрастанию даты, посты внутри дня — по времени", () => {
    const days = groupByDay([
      makePost(3, "2026-03-18", "09:00"),
      makePost(2, "2026-03-16", "19:00"),
      makePost(1, "2026-03-16", "08:30"),
    ]);

    expect(days.map((day) => day.date)).toEqual(["2026-03-16", "2026-03-18"]);
    expect(days[0]?.posts.map((post) => post.number)).toEqual([1, 2]);
  });

  it("подпись дня написана для человека: с днём недели", () => {
    const [day] = groupByDay([makePost(1, "2026-03-16", "10:00")]);

    expect(day?.label).toContain("понедельник");
  });

  it("испорченная дата не роняет экран", () => {
    const [day] = groupByDay([makePost(1, "не дата", "10:00")]);

    expect(day?.label).toBe("не дата");
  });
});

describe("копирование поста", () => {
  it("в буфер уходит текст, призыв и хештеги — и ничего лишнего", () => {
    const copied = postToClipboard(makePost(1, "2026-03-16", "10:00"));

    expect(copied).toBe("Текст.\n\nПризыв.\n\n#хлеб");
    expect(copied).not.toContain("Картинка.");
    expect(copied).not.toContain("prompt");
  });

  it("пустые части не оставляют дыр из пустых строк", () => {
    const post = { ...makePost(1, "2026-03-16", "10:00"), cta: "", hashtags: [] };

    expect(postToClipboard(post)).toBe("Текст.");
  });

  it("призыв не повторяется, если он уже есть в конце текста", () => {
    const cta = "Как вы считаете, ваш бизнес готов к этому?";
    const post = {
      ...makePost(1, "2026-03-16", "10:00"),
      postContent: `Первый абзац.\n\n${cta}`,
      cta,
      hashtags: [],
    };

    expect(separateCta(post)).toBe("");
    expect(postToClipboard(post)).toBe(`Первый абзац.\n\n${cta}`);
  });

  it("разница в знаках и регистре не мешает узнать тот же призыв", () => {
    const post = {
      ...makePost(1, "2026-03-16", "10:00"),
      postContent: "Первый абзац.\n\nА ваш бизнес — готов?",
      cta: "А ваш бизнес готов?",
    };

    expect(separateCta(post)).toBe("");
  });

  it("настоящий отдельный призыв остаётся на месте", () => {
    const post = {
      ...makePost(1, "2026-03-16", "10:00"),
      postContent: "Разбор ошибки хранения хлеба.",
      cta: "Расскажите, как храните хлеб вы.",
    };

    expect(separateCta(post)).toBe("Расскажите, как храните хлеб вы.");
  });
});

describe("названия площадок", () => {
  it("берутся из общего словаря", () => {
    expect(platformName("vk")).toBe("ВКонтакте");
  });
});
