/**
 * Картинка к одному посту.
 *
 * Промпт заново не сочиняется: он уже лежит в самом посте в поле imagePrompt —
 * на английском, с описанием света, метафоры и текстуры. Так задумано с первой
 * версии промпта, и второй генератор описаний означал бы, что картинка
 * перестала соответствовать полю visual, которое человек читает глазами.
 *
 * Пропорции берутся у площадки, а не из текста промпта: модель текста пишет их
 * в мидджорнейском виде «--ar 16:9», и Google такой флаг не понимает — он
 * попадёт в кадр надписью. Поэтому флаг вырезается, а пропорции передаются
 * настройкой запроса.
 */
import { getPlatform, type GeneratedPost } from "../../contracts/index.ts";
import { GenerationError } from "./errors.ts";
import type { ImageProvider, ImageResult } from "./provider/types.ts";

const REQUEST_TIMEOUT_MS = 90_000;

/** Флаги вида «--ar 16:9», «--v 6», «--style raw» из промпта для Midjourney. */
const CLI_FLAGS = /\s--[a-z]+(?:\s+[^\s-][^\s]*)?/gi;

export function toImagePrompt(post: GeneratedPost): string {
  const written = post.imagePrompt.replace(CLI_FLAGS, "").trim();
  if (written.length > 0) return written;

  // Модель текста поленилась заполнить поле. Описание кадра по-русски всё же
  // лучше, чем отказ: генератор понимает и его.
  const fallback = post.visual.trim();
  if (fallback.length > 0) return fallback;
  throw new GenerationError("BAD_RESPONSE", "у поста нет описания картинки");
}

export interface ImageOptions {
  readonly provider: ImageProvider;
  readonly signal?: AbortSignal;
}

export async function createPostImage(
  post: GeneratedPost,
  options: ImageOptions,
): Promise<ImageResult> {
  return await options.provider.create({
    prompt: toImagePrompt(post),
    aspectRatio: getPlatform(post.platform).imageAspectRatio,
    timeoutMs: REQUEST_TIMEOUT_MS,
    signal: options.signal,
  });
}
