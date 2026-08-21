/**
 * Улучшение поста в редакторе.
 *
 * Главная проверка здесь одна: прежний текст не теряется. Замена без возврата
 * — самый быстрый способ лишиться хорошего поста, и словами это требование в
 * задании стоит отдельным пунктом.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GeneratedPost } from "@contracts";
import { ApiError } from "@/shared/api/errors";
import { PostEditor } from "./PostEditor";

const ORIGINAL: GeneratedPost = {
  number: 3,
  date: "2026-03-18",
  time: "10:00",
  platform: "telegram",
  rubric: "Разбор ошибки",
  format: "Текстовый пост",
  title: "Почему хлеб черствеет",
  hook: "Вы убираете хлеб тёплым в пакет.",
  description: "Разбор ошибки хранения.",
  script: "",
  type: "Обучающий",
  cta: "Расскажите, как храните вы.",
  hashtags: ["#хлеб"],
  visual: "Буханка на решётке.",
  visualStyle: "craft-design",
  imagePrompt: "sourdough loaf on a wire rack, --ar 16:9",
  postContent: "Прежний текст, который человек не хочет потерять.",
};

const IMPROVED: GeneratedPost = { ...ORIGINAL, postContent: "Новый вариант, вдвое короче." };

function renderEditor(offer: {
  left?: number | null;
  limit?: number | null;
  run?: (instruction: string) => Promise<GeneratedPost>;
}) {
  const onSave = vi.fn();
  render(
    <PostEditor
      post={ORIGINAL}
      saving={false}
      onSave={onSave}
      onCancel={vi.fn()}
      improve={{
        left: offer.left ?? 10,
        limit: offer.limit ?? 30,
        run: offer.run ?? ((): Promise<GeneratedPost> => Promise.resolve(IMPROVED)),
      }}
    />,
  );
  return { onSave };
}

function textField(): HTMLTextAreaElement {
  return screen.getByLabelText("Текст поста");
}

function click(name: string): void {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("улучшение поста в редакторе", () => {
  afterEach(cleanup);

  it("готовая просьба уходит целой фразой, а не словом с кнопки", async () => {
    const run = vi.fn().mockResolvedValue(IMPROVED);
    renderEditor({ run });

    click("Короче");

    await waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1);
    });
    expect(String(run.mock.calls[0]?.[0])).toContain("сократи");
  });

  it("новый вариант показан, а прежний текст возвращается одной кнопкой", async () => {
    renderEditor({});

    click("Короче");
    await waitFor(() => {
      expect(textField().value).toBe(IMPROVED.postContent);
    });

    click("Вернуть прежний текст");

    expect(textField().value).toBe(ORIGINAL.postContent);
  });

  it("после двух улучшений подряд возврат ведёт к исходному тексту", async () => {
    const second: GeneratedPost = { ...ORIGINAL, postContent: "Третий вариант." };
    const run = vi.fn().mockResolvedValueOnce(IMPROVED).mockResolvedValueOnce(second);
    renderEditor({ run });

    click("Короче");
    await waitFor(() => {
      expect(textField().value).toBe(IMPROVED.postContent);
    });
    click("Проще словами");
    await waitFor(() => {
      expect(textField().value).toBe(second.postContent);
    });

    click("Вернуть прежний текст");

    expect(textField().value).toBe(ORIGINAL.postContent);
  });

  it("отказ сервера объясняется, а текст поста остаётся нетронутым", async () => {
    const run = vi
      .fn()
      .mockRejectedValue(
        new ApiError("IMPROVEMENTS_EXCEEDED", "Улучшения на этот месяц закончились.", false, []),
      );
    renderEditor({ run });

    click("Короче");

    expect(await screen.findByText("Улучшения на этот месяц закончились.")).toBeInTheDocument();
    expect(textField().value).toBe(ORIGINAL.postContent);
  });

  it("когда улучшения кончились, вместо погашенной кнопки объяснение", () => {
    renderEditor({ left: 0 });

    expect(screen.queryByRole("button", { name: "Короче" })).not.toBeInTheDocument();
    expect(screen.getByText(/счётчик обновится первого числа/)).toBeInTheDocument();
  });

  it("остаток показан там же, где тратится", () => {
    renderEditor({ left: 7, limit: 30 });

    expect(screen.getByText("Осталось 7 из 30")).toBeInTheDocument();
  });
});
