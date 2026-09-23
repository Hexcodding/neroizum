/**
 * Картинка к посту в редакторе.
 *
 * Проверяется то, что стоит денег: одно нажатие — один запрос, остаток виден
 * там же, где тратится, а исчерпанный счётчик объяснён словами, а не погашенной
 * кнопкой. Картинка — самая дорогая единица расхода в продукте, и лишний вызов
 * здесь стоит не миллисекунд, а денег.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GeneratedPost } from "@contracts";
import { ApiError } from "@/shared/api/errors";
import { PostEditor } from "./PostEditor";

const POST: GeneratedPost = {
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
  visual: "Буханка на решётке у окна, утренний свет.",
  visualStyle: "craft-design",
  imagePrompt: "sourdough loaf on a wire rack, --ar 16:9",
  postContent: "Текст поста, готовый к публикации.",
};

const URL = "https://storage.example/plan-1/3.png";

function renderEditor(offer: {
  left?: number | null;
  limit?: number | null;
  url?: string | null;
  run?: () => Promise<string>;
}) {
  render(
    <PostEditor
      post={POST}
      saving={false}
      onSave={vi.fn()}
      onCancel={vi.fn()}
      image={{
        left: offer.left ?? 10,
        limit: offer.limit ?? 30,
        url: offer.url ?? null,
        run: offer.run ?? ((): Promise<string> => Promise.resolve(URL)),
      }}
    />,
  );
}

function click(name: string): void {
  fireEvent.click(screen.getByRole("button", { name }));
}

describe("картинка к посту в редакторе", () => {
  afterEach(cleanup);

  it("одно нажатие — один запрос к модели", async () => {
    const run = vi.fn().mockResolvedValue(URL);
    renderEditor({ run });

    click("Нарисовать картинку");

    await waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  it("пока рисуется, второй запрос не уходит", async () => {
    const run = vi.fn().mockReturnValue(new Promise<string>(() => undefined));
    renderEditor({ run });

    click("Нарисовать картинку");
    click("Рисуем…");

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("готовая картинка показана, а кнопка предлагает нарисовать другую", () => {
    renderEditor({ url: URL });

    expect(screen.getByRole("img", { name: POST.visual })).toHaveAttribute("src", URL);
    expect(screen.getByRole("button", { name: "Нарисовать заново" })).toBeInTheDocument();
  });

  it("остаток показан там же, где тратится", () => {
    renderEditor({ left: 7, limit: 30 });

    expect(screen.getByText("Осталось 7 из 30")).toBeInTheDocument();
  });

  it("когда картинки кончились, вместо погашенной кнопки объяснение", () => {
    renderEditor({ left: 0 });

    expect(screen.queryByRole("button", { name: "Нарисовать картинку" })).not.toBeInTheDocument();
    expect(screen.getByText(/счётчик обновится первого числа/)).toBeInTheDocument();
    // Описание кадра остаётся: его можно отдать дизайнеру, это бесплатно.
    expect(screen.getByText(POST.visual)).toBeInTheDocument();
  });

  it("отказ сервера объясняется человеческим текстом", async () => {
    const run = vi
      .fn()
      .mockRejectedValue(
        new ApiError("IMAGES_EXCEEDED", "Картинки на этот месяц закончились.", false, []),
      );
    renderEditor({ run });

    click("Нарисовать картинку");

    expect(await screen.findByText("Картинки на этот месяц закончились.")).toBeInTheDocument();
  });
});
