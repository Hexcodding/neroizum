/**
 * Словарь контента: типы постов, форматы, цели, стадия проекта, роль автора.
 *
 * Значения типов и форматов заданы на кириллице специально — именно в таком
 * виде их возвращает модель. Любое преобразование туда-обратно было бы лишним
 * местом, где значения могут разойтись.
 */

export const CONTENT_TYPES = ["Обучающий", "Вовлекающий", "Экспертный", "Продающий"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const POST_FORMATS = [
  "Текстовый пост",
  "Видео (до 60 сек)",
  "Карусель",
  "Сторис",
  "Рилс",
  "Опрос",
] as const;
export type PostFormat = (typeof POST_FORMATS)[number];

export const GOAL_IDS = ["sales", "reach", "loyalty"] as const;
export type GoalId = (typeof GOAL_IDS)[number];

/** Формулировки на языке бизнеса, а не маркетингового жаргона. */
export const GOAL_LABELS: Readonly<Record<GoalId, string>> = {
  sales: "Продажи",
  reach: "Охваты и новая аудитория",
  loyalty: "Доверие и лояльность",
};

export const CHANNEL_STAGE_IDS = ["start", "growth", "leader"] as const;
export type ChannelStageId = (typeof CHANNEL_STAGE_IDS)[number];

export const CHANNEL_STAGE_LABELS: Readonly<Record<ChannelStageId, string>> = {
  start: "Старт (до 1000 подписчиков)",
  growth: "Рост (1–10 тысяч)",
  leader: "Лидер (больше 10 тысяч)",
};

export const AUTHOR_ROLE_IDS = ["founder", "employee", "brand"] as const;
export type AuthorRoleId = (typeof AUTHOR_ROLE_IDS)[number];

export const AUTHOR_ROLE_LABELS: Readonly<Record<AuthorRoleId, string>> = {
  founder: "Основатель — от первого лица, с ошибками и выводами",
  employee: "Сотрудник — закулисье и «как мы это делаем»",
  brand: "Бренд — экспертность и сервис",
};

/**
 * Частота публикаций хранится числом, а не строкой вида «3 поста в неделю».
 * Причина: в предыдущих версиях количество постов и даты считала сама модель
 * по текстовому описанию частоты, и результат гулял. Теперь расписание
 * рассчитывается в коде, а модели передаются готовые даты.
 */
export const POSTS_PER_WEEK_OPTIONS = [2, 3, 5, 7] as const;
export type PostsPerWeek = (typeof POSTS_PER_WEEK_OPTIONS)[number];

export const POSTS_PER_WEEK_LABELS: Readonly<Record<PostsPerWeek, string>> = {
  2: "2 поста в неделю",
  3: "3 поста в неделю",
  5: "5 постов в неделю",
  7: "каждый день",
};

export const PERIOD_DAYS_OPTIONS = [7, 14, 30] as const;
export type PeriodDays = (typeof PERIOD_DAYS_OPTIONS)[number];

export function isContentType(value: unknown): value is ContentType {
  return typeof value === "string" && (CONTENT_TYPES as readonly string[]).includes(value);
}

export function isGoalId(value: unknown): value is GoalId {
  return typeof value === "string" && (GOAL_IDS as readonly string[]).includes(value);
}
