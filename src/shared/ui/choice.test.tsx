/**
 * Выбор вариантов: проверяется не оформление, а то, что легко потерять при
 * первой же переделке вида — настоящие поля формы, связанная подпись группы и
 * невозможность снять последнюю площадку.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { MultiChoice, SingleChoice } from "./Choice";

const GOALS = [
  { id: "sales", label: "Продажи" },
  { id: "reach", label: "Охваты", note: "Больше новых людей" },
] as const;

const PLATFORMS = [
  { id: "telegram", label: "Telegram" },
  { id: "vk", label: "ВКонтакте" },
] as const;

describe("одиночный выбор", () => {
  it("это радиокнопки, а не раскрашенные кнопки", () => {
    render(
      <SingleChoice label="Цель плана" options={GOALS} value="sales" onChange={vi.fn()} />,
    );

    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByRole("radio", { name: /Продажи/ })).toBeChecked();
    expect(screen.getByRole("group", { name: "Цель плана" })).toBeInTheDocument();
  });

  it("варианты одной группы объединены общим именем — иначе стрелки не работают", () => {
    render(<SingleChoice label="Цель плана" options={GOALS} value={null} onChange={vi.fn()} />);

    const [first, second] = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(first?.name).toBe(second?.name);
    expect(first?.name).not.toBe("");
  });

  it("две группы на одном экране не мешают друг другу", () => {
    render(
      <>
        <SingleChoice label="Цель" options={GOALS} value="sales" onChange={vi.fn()} />
        <SingleChoice label="Стадия" options={GOALS} value="reach" onChange={vi.fn()} />
      </>,
    );

    const names = (screen.getAllByRole("radio") as HTMLInputElement[]).map((item) => item.name);
    expect(new Set(names).size).toBe(2);
  });

  it("выбор передаётся наверх", () => {
    const onChange = vi.fn();
    render(<SingleChoice label="Цель" options={GOALS} value="sales" onChange={onChange} />);

    fireEvent.click(screen.getByRole("radio", { name: /Охваты/ }));

    expect(onChange).toHaveBeenCalledWith("reach");
  });
});

describe("множественный выбор", () => {
  it("это флажки с подписанной группой", () => {
    render(
      <MultiChoice label="Площадки" options={PLATFORMS} values={["telegram"]} onChange={vi.fn()} />,
    );

    expect(screen.getByRole("checkbox", { name: "Telegram" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "ВКонтакте" })).not.toBeChecked();
    expect(screen.getByRole("group", { name: "Площадки" })).toBeInTheDocument();
  });

  it("добавляет и снимает отметку", () => {
    function Harness() {
      const [values, setValues] = useState<readonly string[]>(["telegram"]);
      return (
        <MultiChoice label="Площадки" options={PLATFORMS} values={values} onChange={setValues} />
      );
    }
    render(<Harness />);

    fireEvent.click(screen.getByRole("checkbox", { name: "ВКонтакте" }));
    expect(screen.getByRole("checkbox", { name: "ВКонтакте" })).toBeChecked();

    fireEvent.click(screen.getByRole("checkbox", { name: "ВКонтакте" }));
    expect(screen.getByRole("checkbox", { name: "ВКонтакте" })).not.toBeChecked();
  });
});
