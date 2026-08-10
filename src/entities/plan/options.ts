/**
 * Варианты выбора для формы: подписи и короткие пояснения.
 *
 * Значения приходят из общего словаря, а пояснения живут здесь: это правило
 * интерфейса, а не предметной области. Пояснение к варианту важнее, чем кажется:
 * человек без маркетолога не выбирает между «охватом» и «лояльностью», пока не
 * прочитает, что это значит для его бизнеса.
 */
import {
  AUTHOR_ROLE_IDS,
  AUTHOR_ROLE_LABELS,
  CHANNEL_STAGE_IDS,
  CHANNEL_STAGE_LABELS,
  GOAL_IDS,
  GOAL_LABELS,
  PERIOD_DAYS_OPTIONS,
  PLATFORM_IDS,
  PLATFORMS,
  POSTS_PER_WEEK_LABELS,
  POSTS_PER_WEEK_OPTIONS,
  type AuthorRoleId,
  type ChannelStageId,
  type GoalId,
  type PeriodDays,
  type PlatformId,
  type PostsPerWeek,
} from "@contracts";

export interface Option<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly note?: string;
}

const GOAL_NOTES: Readonly<Record<GoalId, string>> = {
  sales: "Больше продающих постов и прямых предложений",
  reach: "Больше вовлекающего: репосты, обсуждения, новые люди",
  loyalty: "Больше экспертного и закулисья: чтобы вам поверили",
};

export const GOAL_OPTIONS: readonly Option<GoalId>[] = GOAL_IDS.map((id) => ({
  id,
  label: GOAL_LABELS[id],
  note: GOAL_NOTES[id],
}));

export const STAGE_OPTIONS: readonly Option<ChannelStageId>[] = CHANNEL_STAGE_IDS.map((id) => ({
  id,
  label: CHANNEL_STAGE_LABELS[id],
}));

/** Подпись роли автора длинная, поэтому разрезается на название и пояснение. */
export const ROLE_OPTIONS: readonly Option<AuthorRoleId>[] = AUTHOR_ROLE_IDS.map((id) => {
  const [label, note] = AUTHOR_ROLE_LABELS[id].split(" — ");
  return { id, label: label ?? id, note };
});

export const PLATFORM_OPTIONS: readonly Option<PlatformId>[] = PLATFORM_IDS.map((id) => ({
  id,
  label: PLATFORMS[id].name,
}));

/** Частота и период — числа, но выбор в интерфейсе всегда по строке. */
export const FREQUENCY_OPTIONS: readonly Option<string>[] = POSTS_PER_WEEK_OPTIONS.map((value) => ({
  id: String(value),
  label: POSTS_PER_WEEK_LABELS[value],
}));

const PERIOD_NOTES: Readonly<Record<number, string>> = {
  7: "Попробовать и посмотреть на результат",
  14: "Две недели без спешки",
  30: "Месяц целиком — самый частый выбор",
};

export const PERIOD_OPTIONS: readonly Option<string>[] = PERIOD_DAYS_OPTIONS.map((value) => ({
  id: String(value),
  label: `${String(value)} дней`,
  note: PERIOD_NOTES[value],
}));

export function toPostsPerWeek(value: string): PostsPerWeek {
  const parsed = Number(value);
  return (POSTS_PER_WEEK_OPTIONS.find((option) => option === parsed) ??
    POSTS_PER_WEEK_OPTIONS[1]) as PostsPerWeek;
}

export function toPeriodDays(value: string): PeriodDays {
  const parsed = Number(value);
  return (PERIOD_DAYS_OPTIONS.find((option) => option === parsed) ??
    PERIOD_DAYS_OPTIONS[0]) as PeriodDays;
}
