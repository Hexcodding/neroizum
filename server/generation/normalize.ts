/**
 * Приведение ответа модели к форме поста.
 *
 * Главный принцип: расписание — источник правды. Номер, дату и площадку
 * берём из своего слота, а не из ответа модели, даже если она их вернула.
 * Модель отвечает за содержание; всё, что можно посчитать самим, она не может
 * испортить.
 */
import {
  CONTENT_TYPES,
  POST_FORMATS,
  type ContentType,
  type GeneratedPost,
  type PostFormat,
  type ScheduleSlot,
} from "../../contracts/index.ts";
import { VISUAL_STYLE_IDS } from "../prompt/blocks/visual.ts";

const DEFAULT_TYPE: ContentType = "Обучающий";
const DEFAULT_FORMAT: PostFormat = "Текстовый пост";
const MAX_HASHTAGS = 5;

/** Разметку в тексте поста запрещает промпт, но проверять всё равно надо. */
function stripMarkdown(text: string): string {
  return text.replace(/\*\*/g, "").replace(/^#{1,6}\s+/gm, "").trim();
}

function readString(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  return typeof value === "string" ? value.trim() : "";
}

function readHashtags(raw: Record<string, unknown>): string[] {
  const value = raw.hashtags;
  const list = typeof value === "string" ? value.split(/[,\s]+/) : Array.isArray(value) ? value : [];

  return list
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 1)
    .map((item) => (item.startsWith("#") ? item : `#${item}`))
    .slice(0, MAX_HASHTAGS);
}

function readOneOf<T extends string>(
  raw: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = readString(raw, key);
  return (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function readVisualStyle(raw: Record<string, unknown>, slotNumber: number): string {
  const value = readString(raw, "visualStyle");
  if (VISUAL_STYLE_IDS.includes(value)) return value;

  // Стиль нужен для проверки повторов, поэтому пустым он остаться не может:
  // подставляем по номеру поста, чтобы соседние посты не совпали.
  const fallback = VISUAL_STYLE_IDS[slotNumber % VISUAL_STYLE_IDS.length];
  return fallback ?? "flash-candid";
}

export function normalizePost(raw: Record<string, unknown>, slot: ScheduleSlot): GeneratedPost {
  return {
    number: slot.number,
    date: slot.date,
    platform: slot.platform,
    time: /^\d{1,2}:\d{2}$/.test(readString(raw, "time")) ? readString(raw, "time") : "10:00",
    rubric: readString(raw, "rubric"),
    format: readOneOf(raw, "format", POST_FORMATS, DEFAULT_FORMAT),
    title: stripMarkdown(readString(raw, "title")),
    hook: stripMarkdown(readString(raw, "hook")),
    description: readString(raw, "description"),
    script: readString(raw, "script"),
    type: readOneOf(raw, "type", CONTENT_TYPES, DEFAULT_TYPE),
    cta: readString(raw, "cta"),
    hashtags: readHashtags(raw),
    visual: readString(raw, "visual"),
    visualStyle: readVisualStyle(raw, slot.number),
    imagePrompt: readString(raw, "imagePrompt"),
    postContent: stripMarkdown(readString(raw, "postContent")),
  };
}

/**
 * Раскладывает ответ по слотам расписания. Модель обычно возвращает посты по
 * порядку, но если она вернула номер — верим номеру: при спасении оборванного
 * ответа порядок может быть неполным.
 */
export function normalizePosts(
  items: readonly Record<string, unknown>[],
  slots: readonly ScheduleSlot[],
): GeneratedPost[] {
  const bySlotNumber = new Map<number, Record<string, unknown>>();
  const withoutNumber: Record<string, unknown>[] = [];

  for (const item of items) {
    const number = typeof item.number === "number" ? item.number : Number(item.number);
    if (Number.isInteger(number) && !bySlotNumber.has(number)) {
      bySlotNumber.set(number, item);
    } else {
      withoutNumber.push(item);
    }
  }

  const posts: GeneratedPost[] = [];
  for (const slot of slots) {
    const raw = bySlotNumber.get(slot.number) ?? withoutNumber.shift();
    if (raw === undefined) continue;
    posts.push(normalizePost(raw, slot));
  }
  return posts;
}
