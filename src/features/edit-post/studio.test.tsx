/**
 * Студия поста в редакторе: длина под площадку и предпросмотр ленты.
 *
 * Проверяется, что цифра живая (считает черновик, а не сохранённый пост) и что
 * предпросмотр показывает ровно то, что человек вставит в редактор публикации.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GeneratedPost } from "@contracts";
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
  hashtags: ["#хлеб", "#закваска"],
  visual: "Буханка на решётке.",
  visualStyle: "craft-design",
  imagePrompt: "sourdough loaf on a wire rack, --ar 16:9",
  postContent: "Хлеб черствеет за сутки, если убрать его тёплым в пакет.",
};

function renderEditor(post: GeneratedPost = POST) {
  render(<PostEditor post={post} saving={false} onSave={vi.fn()} onCancel={vi.fn()} />);
}

describe("студия поста", () => {
  afterEach(cleanup);

  it("считает черновик, а не сохранённый текст", () => {
    renderEditor();
    expect(screen.getByText(/56 знаков/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Текст поста"), {
      target: { value: "а".repeat(600) },
    });

    expect(screen.getByText(/600 знаков — хорошо читается/)).toBeInTheDocument();
  });

  it("предпросмотр свёрнут, пока его не попросят", () => {
    renderEditor();

    expect(screen.queryByText("Ваш канал")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Показать в ленте" }));

    expect(screen.getByText("Ваш канал")).toBeInTheDocument();
  });

  it("в ленте показан текст, призыв и хештеги — то же, что копируется", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: "Показать в ленте" }));
    const preview = within(screen.getByRole("group", { name: "Предпросмотр в ленте" }));

    expect(preview.getByText(POST.postContent)).toBeInTheDocument();
    expect(preview.getByText(POST.cta)).toBeInTheDocument();
    expect(preview.getByText("#хлеб #закваска")).toBeInTheDocument();
  });

  it("у видео-площадки в ленте показан сценарий, а не текст поста", () => {
    renderEditor({
      ...POST,
      platform: "tiktok",
      script: "0-3 сек: крупный план буханки. 4-10 сек: ошибка с пакетом.",
    });

    fireEvent.click(screen.getByRole("button", { name: "Показать в ленте" }));

    expect(screen.getByText("Сценарий ролика")).toBeInTheDocument();
    expect(screen.getByText(/0-3 сек/)).toBeInTheDocument();
  });
});
