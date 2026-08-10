/**
 * Тема — единственное, что переключает внешний вид всего приложения.
 * Проверяем главное: на <html> всегда ровно один класс темы. Без класса
 * dark не работали бы варианты Tailwind вида dark:*, и это была бы
 * ошибка, которую глазами не поймать.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ThemeProvider } from "./ThemeProvider";
import { THEME_STORAGE_KEY } from "./theme-context";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";

function renderWithTheme() {
  return render(
    <ThemeProvider>
      <ThemeToggle />
    </ThemeProvider>,
  );
}

describe("тема", () => {
  it("по умолчанию тёмная и класс висит на html", () => {
    renderWithTheme();
    expect(document.documentElement).toHaveClass("dark");
    expect(document.documentElement).not.toHaveClass("light");
  });

  it("переключение меняет класс и сохраняет выбор", () => {
    renderWithTheme();

    fireEvent.click(screen.getByRole("button"));

    expect(document.documentElement).toHaveClass("light");
    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("сохранённая тема подхватывается при запуске", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    renderWithTheme();
    expect(document.documentElement).toHaveClass("light");
  });
});
