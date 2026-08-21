/**
 * Оценка длины готового поста под площадку.
 *
 * Важно, чем это не является. `PLATFORMS[id].textLength` — редакционные
 * ориентиры из промпта третьей версии («сколько знаков читается хорошо»), а не
 * технические пределы площадок: в Telegram помещается 4096 знаков, и пост на
 * 1200 не «не влезет». Поэтому счётчик говорит «длинновато», а не «осталось
 * столько-то до предела»: второе — обещание, которого мы не проверяли.
 *
 * Для видео-площадок счётчик молчит: у TikTok главное не текст поста, а
 * сценарий по секундам, и знаки в нём ничего не значат.
 */
import { PLATFORMS, type PlatformId } from "@contracts";

export type LengthVerdict = "short" | "good" | "long" | "video";

export interface LengthHint {
  readonly verdict: LengthVerdict;
  readonly characters: number;
  /** Готовая фраза для экрана. */
  readonly text: string;
}

/** Ниже этой доли от нижнего ориентира текст уже не пост, а подпись. */
const SHORT_RATIO = 0.7;

function characters(text: string): number {
  // Переводы строк считаются: они и есть воздух, из-за которого пост читается.
  return text.trim().length;
}

function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = count % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export function lengthHint(text: string, platform: PlatformId): LengthHint {
  const profile = PLATFORMS[platform];
  const count = characters(text);
  const size = `${String(count)} ${plural(count, "знак", "знака", "знаков")}`;

  if (profile.isVideoFirst) {
    return {
      verdict: "video",
      characters: count,
      text: `${size}. Для ${profile.name} важнее сценарий по секундам, а не длина текста.`,
    };
  }

  const range = `${String(profile.textLength.min)}–${String(profile.textLength.max)}`;

  if (count > profile.textLength.max) {
    return {
      verdict: "long",
      characters: count,
      text: `${size} — длинновато. В ${profile.name} хорошо читается ${range}.`,
    };
  }

  if (count < profile.textLength.min * SHORT_RATIO) {
    return {
      verdict: "short",
      characters: count,
      text: `${size} — коротко для поста. В ${profile.name} хорошо читается ${range}.`,
    };
  }

  return { verdict: "good", characters: count, text: `${size} — хорошо читается.` };
}
