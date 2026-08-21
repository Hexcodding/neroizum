/**
 * Счётчик длины поста.
 *
 * Главное, что проверяется, — формулировки. Ориентиры редакционные, поэтому
 * счётчик не имеет права говорить «осталось столько-то знаков»: это обещание
 * технического предела, которого мы не проверяли.
 */
import { describe, expect, it } from "vitest";
import { lengthHint } from "./length";

const filler = (count: number): string => "а".repeat(count);

describe("длина поста под площадку", () => {
  it("текст в ориентире считается хорошим", () => {
    const hint = lengthHint(filler(600), "telegram");

    expect(hint.verdict).toBe("good");
    expect(hint.text).toContain("600 знаков");
    expect(hint.text).toContain("хорошо читается");
  });

  it("длинный текст называется длинноватым, а не ошибкой", () => {
    const hint = lengthHint(filler(1500), "telegram");

    expect(hint.verdict).toBe("long");
    expect(hint.text).toContain("длинновато");
    expect(hint.text).toContain("450–900");
    // Ни слова про предел: 1500 знаков в Telegram публикуются без проблем.
    expect(hint.text).not.toContain("осталось");
    expect(hint.text).not.toContain("предел");
  });

  it("у MAX свой ориентир, и он называется в подсказке", () => {
    const hint = lengthHint(filler(700), "max");

    expect(hint.verdict).toBe("long");
    expect(hint.text).toContain("300–600");
    expect(hint.text).toContain("MAX");
  });

  it("подпись вместо поста замечается", () => {
    const hint = lengthHint(filler(120), "vk");

    expect(hint.verdict).toBe("short");
    expect(hint.text).toContain("коротко");
  });

  it("у видео-площадки счётчик не судит длину, а отправляет к сценарию", () => {
    const hint = lengthHint(filler(2000), "tiktok");

    expect(hint.verdict).toBe("video");
    expect(hint.text).toContain("сценарий");
    expect(hint.text).not.toContain("длинновато");
  });

  it("знаки склоняются по-русски", () => {
    expect(lengthHint(filler(1), "telegram").text).toContain("1 знак ");
    expect(lengthHint(filler(573), "telegram").text).toContain("573 знака");
    expect(lengthHint(filler(511), "telegram").text).toContain("511 знаков");
    expect(lengthHint(filler(614), "telegram").text).toContain("614 знаков");
  });

  it("пробелы по краям не считаются постом", () => {
    expect(lengthHint("   \n  привет  \n ", "telegram").characters).toBe(6);
  });
});
