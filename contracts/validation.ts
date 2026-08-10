/**
 * Проверка запроса на генерацию.
 *
 * Лежит в общем словаре, потому что нужна дважды: интерфейс подсказывает
 * пользователю до отправки, сервер не доверяет присланному и проверяет заново.
 * Если правила разъедутся, появится худший вариант — форма разрешает, а сервер
 * отказывает без объяснений.
 *
 * Сообщения написаны для человека без маркетолога: что именно поправить, а не
 * «поле niche не прошло валидацию».
 */
import { isPlatformId, PLATFORM_IDS } from "./platforms.ts";
import {
  AUTHOR_ROLE_IDS,
  CHANNEL_STAGE_IDS,
  GOAL_IDS,
  PERIOD_DAYS_OPTIONS,
  POSTS_PER_WEEK_OPTIONS,
} from "./content.ts";
import { INPUT_LIMITS } from "./request.ts";
import { parseIsoDate } from "./dates.ts";

export interface FieldError {
  /** Имя поля, чтобы интерфейс подсветил нужное место формы. */
  readonly field: string;
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly FieldError[] };

const MIN_NICHE_LENGTH = 10;
const MIN_AUDIENCE_LENGTH = 5;

function isOneOf(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === "string" && allowed.includes(value);
}

function checkText(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
  hint: string,
): FieldError | null {
  if (typeof value !== "string" || value.trim().length < minLength) {
    return { field, message: hint };
  }
  if (value.length > maxLength) {
    return {
      field,
      message: `Слишком длинно: оставьте до ${String(maxLength)} символов, самое важное в начале.`,
    };
  }
  return null;
}

function checkPlatforms(value: unknown): FieldError | null {
  if (!Array.isArray(value) || value.length === 0) {
    return { field: "platforms", message: "Выберите хотя бы одну площадку." };
  }
  if (value.length > PLATFORM_IDS.length) {
    return { field: "platforms", message: "Площадка в списке указана дважды." };
  }
  if (!value.every(isPlatformId)) {
    return { field: "platforms", message: "Одна из выбранных площадок не поддерживается." };
  }
  if (new Set(value).size !== value.length) {
    return { field: "platforms", message: "Площадка в списке указана дважды." };
  }
  return null;
}

function checkBrand(value: unknown): FieldError[] {
  if (typeof value !== "object" || value === null) {
    return [{ field: "brand", message: "Профиль бренда не заполнен." }];
  }

  const brand = value as Record<string, unknown>;
  const errors: FieldError[] = [];
  const limits: readonly [string, number][] = [
    ["tone", INPUT_LIMITS.tone],
    ["products", INPUT_LIMITS.products],
    ["proof", INPUT_LIMITS.proof],
  ];

  for (const [field, limit] of limits) {
    const text = brand[field];
    if (text !== undefined && typeof text === "string" && text.length > limit) {
      errors.push({
        field: `brand.${field}`,
        message: `Слишком длинно: оставьте до ${String(limit)} символов.`,
      });
    }
  }

  if (brand.stopWords !== undefined && !Array.isArray(brand.stopWords)) {
    errors.push({ field: "brand.stopWords", message: "Запрещённые слова нужно передать списком." });
  }
  if (brand.styleSamples !== undefined && !Array.isArray(brand.styleSamples)) {
    errors.push({
      field: "brand.styleSamples",
      message: "Образцы стиля нужно передать списком.",
    });
  }
  return errors;
}

function checkChoices(request: Record<string, unknown>): FieldError[] {
  const errors: FieldError[] = [];

  if (!isOneOf(request.goal, GOAL_IDS)) {
    errors.push({ field: "goal", message: "Выберите цель плана." });
  }
  if (!isOneOf(request.channelStage, CHANNEL_STAGE_IDS)) {
    errors.push({ field: "channelStage", message: "Выберите стадию проекта." });
  }
  if (!isOneOf(request.authorRole, AUTHOR_ROLE_IDS)) {
    errors.push({ field: "authorRole", message: "Выберите, от чьего имени вести соцсети." });
  }
  if (!POSTS_PER_WEEK_OPTIONS.includes(request.postsPerWeek as never)) {
    errors.push({ field: "postsPerWeek", message: "Выберите, как часто вы готовы публиковать." });
  }
  if (!PERIOD_DAYS_OPTIONS.includes(request.periodDays as never)) {
    errors.push({ field: "periodDays", message: "Выберите период плана: 7, 14 или 30 дней." });
  }
  if (typeof request.infoPlanMode !== "boolean") {
    errors.push({ field: "infoPlanMode", message: "Не указан режим плана." });
  }
  return errors;
}

export function validateGenerationRequest(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) {
    return { ok: false, errors: [{ field: "request", message: "Запрос пустой." }] };
  }

  const request = input as Record<string, unknown>;
  const errors: FieldError[] = [];

  const niche = checkText(
    request.niche,
    "niche",
    MIN_NICHE_LENGTH,
    INPUT_LIMITS.niche,
    "Расскажите, чем занимается бизнес — хотя бы одним предложением. Без этого план получится про всё и ни о чём.",
  );
  if (niche !== null) errors.push(niche);

  const audience = checkText(
    request.audience,
    "audience",
    MIN_AUDIENCE_LENGTH,
    INPUT_LIMITS.audience,
    "Опишите, для кого вы пишете: кто эти люди и что их волнует.",
  );
  if (audience !== null) errors.push(audience);

  const platforms = checkPlatforms(request.platforms);
  if (platforms !== null) errors.push(platforms);

  errors.push(...checkChoices(request));

  if (typeof request.startDate !== "string" || parseIsoDate(request.startDate) === null) {
    errors.push({ field: "startDate", message: "Укажите дату, с которой начинается план." });
  }

  errors.push(...checkBrand(request.brand));

  if (request.previousPosts !== undefined && !Array.isArray(request.previousPosts)) {
    errors.push({ field: "previousPosts", message: "Список созданных постов повреждён." });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
