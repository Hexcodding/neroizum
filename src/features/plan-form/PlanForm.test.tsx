/**
 * Мастер заявки: то, что нельзя проверить глазами один раз и забыть.
 *
 * Три вещи: пустые поля не пускают дальше, заполненное переживает перезагрузку,
 * и до сервера доходит запрос ровно той формы, которую сервер ждёт.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerationRequest } from "@contracts";
import { PlanForm } from "./PlanForm";

const NICHE = "Домашняя пекарня в Химках, хлеб на закваске, печём под заказ.";
const AUDIENCE = "Семьи с детьми из соседних домов, читают состав, некогда готовить.";

function fill(label: RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function next(): void {
  fireEvent.click(screen.getByRole("button", { name: "Дальше" }));
}

describe("мастер заявки", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("с пустыми полями дальше не пускает и объясняет, почему", () => {
    render(<PlanForm onSubmit={vi.fn()} busy={false} />);

    next();

    expect(screen.getByText("Не хватает данных")).toBeInTheDocument();
    expect(screen.getByLabelText(/Чем вы занимаетесь/)).toBeInTheDocument();
  });

  it("заполненный шаг пропускает дальше", () => {
    render(<PlanForm onSubmit={vi.fn()} busy={false} />);

    fill(/Чем вы занимаетесь/, NICHE);
    fill(/Для кого вы пишете/, AUDIENCE);
    next();

    expect(screen.getByText("Где публикуете")).toBeInTheDocument();
  });

  it("заполненное не теряется при перезагрузке страницы", () => {
    render(<PlanForm onSubmit={vi.fn()} busy={false} />);
    fill(/Чем вы занимаетесь/, NICHE);

    cleanup();
    render(<PlanForm onSubmit={vi.fn()} busy={false} />);

    expect(screen.getByLabelText(/Чем вы занимаетесь/)).toHaveValue(NICHE);
  });

  it("«начать заново» очищает заявку, но оставляет профиль бренда", () => {
    localStorage.setItem(
      "neuroizium.draft",
      JSON.stringify({
        niche: NICHE,
        audience: AUDIENCE,
        brand: {
          tone: "по-домашнему, без канцелярита",
          products: "",
          proof: "",
          stopWords: [],
          styleSamples: [],
        },
      }),
    );
    render(<PlanForm onSubmit={vi.fn()} busy={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Начать заново" }));

    expect(screen.getByLabelText(/Чем вы занимаетесь/)).toHaveValue("");
    const saved: unknown = JSON.parse(localStorage.getItem("neuroizium.draft") ?? "{}");
    expect((saved as { brand: { tone: string } }).brand.tone).toBe("по-домашнему, без канцелярита");
  });

  it("до сервера доходит запрос той формы, которую он ждёт", () => {
    const onSubmit = vi.fn<(request: GenerationRequest) => void>();
    render(<PlanForm onSubmit={onSubmit} busy={false} />);

    fill(/Чем вы занимаетесь/, NICHE);
    fill(/Для кого вы пишете/, AUDIENCE);
    next();
    next();
    next();
    fireEvent.click(screen.getByRole("button", { name: "Создать план" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const request = onSubmit.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      niche: NICHE,
      audience: AUDIENCE,
      platforms: ["telegram"],
      previousPosts: [],
    });
    // Профиль бренда необязателен, но поля должны прийти пустыми, а не отсутствовать.
    expect(request?.brand.stopWords).toEqual([]);
  });

  it("во время генерации кнопки заблокированы: второй запрос не уйдёт", () => {
    render(<PlanForm onSubmit={vi.fn()} busy />);

    expect(screen.getByRole("button", { name: "Дальше" })).toBeDisabled();
  });
});
