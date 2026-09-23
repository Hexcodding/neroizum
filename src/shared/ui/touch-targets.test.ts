/**
 * Мобильные требования, проверяемые механически.
 *
 * Требование «нажимаемые элементы не меньше 44 пикселей» невозможно удержать
 * договорённостью: кнопки добавляют по одной, в спешке, и очередная оказывается
 * на 32 пикселя. Здесь проверяется исходный код целиком, поэтому правило
 * действует и на код, который ещё не написан.
 *
 * Так же с полями ввода: собственный <input> в обход дизайн-системы теряет и
 * высоту, и размер шрифта 16px, из-за которого мобильный браузер не увеличивает
 * страницу при фокусе.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE_ROOT = path.resolve(process.cwd(), "src");
const UI_KIT = path.join("shared", "ui");

function sourceFiles(): string[] {
  return readdirSync(SOURCE_ROOT, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .filter((entry) => !entry.name.includes(".test."))
    .map((entry) => path.join(entry.parentPath ?? SOURCE_ROOT, entry.name));
}

/**
 * Разметка одного элемента: от имени тега до закрывающей угловой скобки.
 *
 * Скобку нельзя искать простым выражением: внутри атрибутов живут стрелочные
 * функции, и «>» из «=>» обрывает тег на середине. Поэтому закрывающей считается
 * скобка, перед которой нет знака равенства.
 */
function openingTags(content: string, tag: string): string[] {
  const tags: string[] = [];
  const opening = new RegExp(`<${tag}[\\s/>]`, "g");

  for (const match of content.matchAll(opening)) {
    const start = match.index;
    for (let cursor = start; cursor < content.length; cursor += 1) {
      if (content[cursor] === ">" && content[cursor - 1] !== "=") {
        tags.push(content.slice(start, cursor + 1));
        break;
      }
    }
  }
  return tags;
}

describe("размер нажимаемых элементов", () => {
  it("все размеры кнопки дизайн-системы держат минимум 44 пикселя", () => {
    const content = readFileSync(path.join(SOURCE_ROOT, UI_KIT, "Button.tsx"), "utf8");
    const sizes = /size:\s*\{([\s\S]*?)\}/.exec(content)?.[1] ?? "";

    expect(sizes).not.toBe("");
    for (const line of sizes.split("\n").filter((item) => item.includes(":"))) {
      expect(line).toContain("min-h-touch");
    }
  });

  it("каждая своя кнопка задаёт высоту не меньше 44 пикселей", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      // Сама кнопка дизайн-системы проверена размерами выше.
      if (file.endsWith(path.join(UI_KIT, "Button.tsx"))) continue;

      const content = readFileSync(file, "utf8");
      for (const tag of openingTags(content, "button")) {
        // Button из дизайн-системы задаёт высоту сам, здесь речь о своих кнопках.
        if (!tag.includes("min-h-touch") && !tag.includes("min-w-touch")) {
          offenders.push(`${path.relative(SOURCE_ROOT, file)}: ${tag.slice(0, 60)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("поля ввода создаются только в дизайн-системе", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const relative = path.relative(SOURCE_ROOT, file);
      if (relative.startsWith(UI_KIT)) continue;

      const content = readFileSync(file, "utf8");
      for (const tag of ["input", "textarea", "select"]) {
        if (openingTags(content, tag).length > 0) {
          offenders.push(`${relative}: <${tag}>`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
