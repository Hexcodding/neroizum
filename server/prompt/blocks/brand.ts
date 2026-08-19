/**
 * Профиль бренда: голос, стоп-слова, образцы стиля.
 *
 * Факты о бизнесе (продукты, доказательства) живут в <CLIENT_DATA> —
 * blocks/client-data.ts. Здесь только то, КАК звучать: иначе модель смешает
 * «что продаём» с «каким голосом» и начнёт копировать темы из образцов.
 *
 * Перенесено из третьей версии с одним исправлением: там профиль терялся
 * целиком в браузерном режиме генерации, потому что функция преобразования
 * формы не переносила tone, products, proof, stopWords и styleSamples.
 * Здесь путь генерации один, и терять данные негде.
 */
import { INPUT_LIMITS, type AuthorRoleId, type BrandProfile } from "../../../contracts/index.ts";
import { clampBlock, clampLine, clampList, userData } from "../core/sanitize.ts";

/** Тональность по роли автора. Применяется, если голос бренда не задан явно. */
const TONE_BY_ROLE: Readonly<Record<AuthorRoleId, string>> = {
  founder:
    "пиши от первого лица, признавай ошибки и показывай выводы, транслируй личное отношение к делу",
  employee:
    "показывай закулисье и рабочие процессы, «как мы это делаем», говори от лица команды",
  brand: "официально, но по-человечески: экспертность, забота о клиенте, никакой канцелярщины",
};

function styleSamplesSection(samples: readonly string[]): string {
  const numbered = samples
    .map((sample, index) => userData(`style_sample_${index + 1}`, sample))
    .join("\n\n");

  return `ОБРАЗЦЫ АВТОРСКОГО СТИЛЯ. Копируй ритм, длину предложений, лексику и способ подачи. НЕ повторяй темы из образцов и не пересказывай их содержание:
${numbered}`;
}

export function buildBrandBlock(brand: BrandProfile, authorRole: AuthorRoleId): string {
  const parts: string[] = [];

  const tone = clampLine(brand.tone, INPUT_LIMITS.tone);
  parts.push(
    tone.length > 0
      ? `Голос бренда, соблюдай строго: ${userData("brand_tone", tone)}`
      : `Тональность по роли автора: ${TONE_BY_ROLE[authorRole]}`,
  );

  const stopWords = clampList(
    brand.stopWords,
    INPUT_LIMITS.stopWordsCount,
    INPUT_LIMITS.stopWord,
  );
  if (stopWords.length > 0) {
    parts.push(`ЗАПРЕЩЁННЫЕ слова и штампы, не используй ни в какой форме: ${stopWords.join(", ")}`);
  }

  // Образцы стиля проходят через clampBlock, а не clampLine: в них важен
  // ритм и разбивка на абзацы, а одна строка его уничтожает.
  const samples = brand.styleSamples
    .map((sample) => clampBlock(sample, INPUT_LIMITS.styleSample))
    .filter((sample) => sample.length > 0)
    .slice(0, INPUT_LIMITS.styleSamplesCount);
  if (samples.length > 0) {
    parts.push(styleSamplesSection(samples));
  }

  return `ПРОФИЛЬ БРЕНДА:\n${parts.join("\n")}`;
}
