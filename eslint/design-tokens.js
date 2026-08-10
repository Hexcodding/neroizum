/**
 * Запрет хардкода цвета в компонентах.
 *
 * Зачем: в предыдущей версии цвета типов контента были прописаны прямо в коде
 * мимо переменных темы, и светлая тема ломалась незаметно — на тёмной всё
 * выглядело нормально. Проверка ловит и hex-цвета, и палитру Tailwind.
 */

const TAILWIND_PALETTE = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
].join("|");

const COLOR_UTILITIES = "bg|text|border|ring|outline|fill|stroke|from|via|to|shadow|divide|decoration";

const HARDCODED_COLOR = `(#[0-9a-fA-F]{3,8}\\b|\\b(${COLOR_UTILITIES})-(${TAILWIND_PALETTE})-[0-9]{2,3}\\b|\\brgba?\\(|\\bhsla?\\()`;

const MESSAGE =
  "Цвет только из токенов темы: bg-primary, text-muted-foreground, border-border/70. Хардкод ломает светлую тему незаметно.";

export const designTokenRules = {
  files: ["src/**/*.{ts,tsx}"],
  ignores: ["src/**/*.{test,spec}.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      { selector: `Literal[value=/${HARDCODED_COLOR}/]`, message: MESSAGE },
      { selector: `TemplateElement[value.raw=/${HARDCODED_COLOR}/]`, message: MESSAGE },
    ],
  },
};
