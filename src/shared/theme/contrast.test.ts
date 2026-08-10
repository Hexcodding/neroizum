/**
 * Контраст текста считается, а не оценивается на глаз.
 *
 * Повод завести эту проверку конкретный: `text-muted` какое-то время указывал на
 * токен плашки вместо токена текста, и подписи в тёмной теме отличались от фона
 * на процент. На экране это выглядит как «шрифт бледноват», а не как поломка,
 * поэтому такое живёт месяцами. Арифметика замечает сразу.
 *
 * Порог 4.5:1 — требование WCAG AA для обычного текста; подсказки под полями
 * набраны мелким, к ним применяется именно он.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CSS = readFileSync(path.resolve(process.cwd(), "src/index.css"), "utf8");
const MINIMUM_RATIO = 4.5;

/** Значения токенов одной темы: тёмная объявлена в :root, светлая — в .light. */
function themeTokens(selector: string): Map<string, string> {
  const start = CSS.indexOf(selector);
  const block = CSS.slice(start, CSS.indexOf("}", start));
  const tokens = new Map<string, string>();

  for (const match of block.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) tokens.set(name, value.trim());
  }
  return tokens;
}

/** «320 12% 9%» → доли красного, зелёного и синего. */
function hslToRgb(value: string): [number, number, number] {
  const [hue, saturation, lightness] = value.split(/\s+/).map((part) => Number.parseFloat(part));
  if (hue === undefined || saturation === undefined || lightness === undefined) {
    throw new Error(`Не разобрать цвет: ${value}`);
  }

  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const sector = hue / 60;
  const second = chroma * (1 - Math.abs((sector % 2) - 1));
  const base = l - chroma / 2;

  const points: [number, number, number][] = [
    [chroma, second, 0],
    [second, chroma, 0],
    [0, chroma, second],
    [0, second, chroma],
    [second, 0, chroma],
    [chroma, 0, second],
  ];
  const point = points[Math.min(5, Math.floor(sector))] ?? [0, 0, 0];
  return [point[0] + base, point[1] + base, point[2] + base];
}

function relativeLuminance(value: string): number {
  const linear = hslToRgb(value).map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(first: string, second: string): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

const THEMES = [
  { name: "тёмная", selector: ":root {" },
  { name: "светлая", selector: ".light {" },
] as const;

describe("контраст текста", () => {
  it("проверка сама себя проверяет на известных крайностях", () => {
    expect(contrast("0 0% 100%", "0 0% 0%")).toBeCloseTo(21, 0);
    expect(contrast("0 0% 50%", "0 0% 50%")).toBeCloseTo(1, 2);
  });

  for (const theme of THEMES) {
    describe(theme.name, () => {
      const tokens = themeTokens(theme.selector);
      const background = tokens.get("--background");

      it("токены темы прочитаны", () => {
        expect(background).toBeDefined();
        expect(tokens.size).toBeGreaterThan(10);
      });

      const pairs = [
        ["основной текст", "--foreground", "--background"],
        ["второстепенный текст", "--muted-foreground", "--background"],
        ["текст на карточке", "--card-foreground", "--card"],
        ["текст на плашке", "--secondary-foreground", "--secondary"],
        ["текст на кнопке", "--primary-foreground", "--primary"],
      ] as const;

      for (const [label, textToken, surfaceToken] of pairs) {
        it(`${label} читается`, () => {
          const text = tokens.get(textToken);
          const surface = tokens.get(surfaceToken);
          expect(text, textToken).toBeDefined();
          expect(surface, surfaceToken).toBeDefined();

          expect(contrast(text as string, surface as string)).toBeGreaterThanOrEqual(
            MINIMUM_RATIO,
          );
        });
      }
    });
  }
});
