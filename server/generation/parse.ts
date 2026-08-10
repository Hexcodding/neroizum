/**
 * Разбор ответа модели, включая спасение оборванного ответа.
 *
 * Обычный путь: модель вернула массив JSON — разбираем и идём дальше.
 * Плохой путь: ответ оборвался на середине девятого поста из десяти. Раньше
 * в этом случае `JSON.parse` бросал исключение, и вся часть плана терялась,
 * хотя восемь постов были целыми. Теперь целые объекты достаются по одному.
 */
import { GenerationError } from "./errors.ts";

export interface ParseResult {
  readonly items: readonly Record<string, unknown>[];
  /** Ответ был неполным и собран из целых объектов. */
  readonly rescued: boolean;
}

function stripWrapping(text: string): string {
  const withoutFences = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const start = withoutFences.indexOf("[");
  return start > 0 ? withoutFences.slice(start) : withoutFences;
}

/**
 * Достаёт из текста все объекты верхнего уровня с закрытой скобкой. Кавычки
 * и экранирование учитываются: скобка внутри строки не считается структурой.
 */
function extractObjects(text: string): string[] {
  const found: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === '"') {
      inString = !inString;
    } else if (inString) {
      continue;
    } else if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        found.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return found;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rescue(text: string): readonly Record<string, unknown>[] {
  const items: Record<string, unknown>[] = [];
  for (const candidate of extractObjects(text)) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (isPlainObject(parsed)) items.push(parsed);
    } catch {
      // Один битый объект не повод терять остальные.
    }
  }
  return items;
}

export function parsePlanResponse(rawText: string): ParseResult {
  const text = stripWrapping(rawText);
  if (text.trim().length === 0) {
    throw new GenerationError("BAD_RESPONSE", "Модель вернула пустой ответ");
  }

  const closingBracket = text.lastIndexOf("]");
  if (closingBracket !== -1) {
    try {
      const parsed: unknown = JSON.parse(text.slice(0, closingBracket + 1));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return { items: parsed.filter(isPlainObject), rescued: false };
      }
    } catch {
      // Падаем в спасение ниже: возможно, оборвано внутри массива.
    }
  }

  const items = rescue(text);
  if (items.length === 0) {
    throw new GenerationError("BAD_RESPONSE", `Не удалось разобрать ответ: ${text.slice(0, 200)}`);
  }
  return { items, rescued: true };
}
