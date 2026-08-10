/**
 * Состояние темы. Вынесено из компонента-провайдера отдельно, чтобы
 * файл с компонентом экспортировал только компонент — иначе ломается
 * горячая перезагрузка при разработке.
 */
import { createContext } from "react";

export type Theme = "light" | "dark";

/** Ключ хранения. Он же продублирован в index.html: там тема применяется
 *  до первой отрисовки, и импортировать модуль оттуда невозможно. */
export const THEME_STORAGE_KEY = "neuroizium-theme";

export const DEFAULT_THEME: Theme = "dark";

export interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeState | null>(null);

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}
