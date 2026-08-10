/**
 * Расписание плана считается кодом, а не моделью.
 *
 * В предыдущих версиях модели передавали текст «3 поста в неделю» и просили
 * «рассчитай точное количество и распредели равномерно». Модель считает
 * арифметику ненадёжно: количество постов гуляло, даты повторялись, а при
 * четырёх выбранных площадках можно было получить четыре поста подряд для
 * Telegram. Здесь дата и площадка каждого поста определены заранее, а модели
 * остаётся то, что она умеет — содержание.
 */
import type { PlatformId } from "./platforms";
import type { PeriodDays, PostsPerWeek } from "./content";
import { addDays, weekdayName } from "./dates";

export interface ScheduleSlot {
  readonly number: number;
  /** Дата в формате ГГГГ-ММ-ДД. */
  readonly date: string;
  readonly weekday: string;
  readonly platform: PlatformId;
}

export interface ScheduleParams {
  readonly startDate: string;
  readonly periodDays: PeriodDays;
  readonly postsPerWeek: PostsPerWeek;
  readonly platforms: readonly PlatformId[];
  /** Номер, с которого продолжается нумерация при генерации следующей части. */
  readonly startNumber?: number;
  /** Сколько площадок уже использовано ранее — чтобы чередование не сбилось. */
  readonly platformOffset?: number;
}

const DAYS_IN_WEEK = 7;

/** Сколько постов приходится на период при заданной частоте. */
export function postCount(periodDays: number, postsPerWeek: number): number {
  const exact = (periodDays * postsPerWeek) / DAYS_IN_WEEK;
  return Math.max(1, Math.round(exact));
}

/**
 * Дни публикаций внутри периода. Раскладка по формуле «номер поста умножить
 * на длину периода и поделить на количество постов» даёт равные промежутки
 * и гарантирует, что два поста не встанут на один день.
 */
function dayOffsets(periodDays: number, count: number): number[] {
  const offsets: number[] = [];
  for (let index = 0; index < count; index += 1) {
    offsets.push(Math.floor((index * periodDays) / count));
  }
  return offsets;
}

/**
 * Площадки чередуются по кругу. При продолжении плана круг не начинается
 * заново, иначе первая площадка получала бы больше постов остальных.
 */
function platformAt(platforms: readonly PlatformId[], index: number): PlatformId {
  const platform = platforms[index % platforms.length];
  if (platform === undefined) {
    throw new Error("Список площадок пуст: нечего распределять");
  }
  return platform;
}

export function buildSchedule(params: ScheduleParams): ScheduleSlot[] {
  const { startDate, periodDays, postsPerWeek, platforms } = params;
  if (platforms.length === 0) {
    throw new Error("Не выбрана ни одна площадка");
  }

  const startNumber = params.startNumber ?? 1;
  const platformOffset = params.platformOffset ?? 0;
  const count = postCount(periodDays, postsPerWeek);

  return dayOffsets(periodDays, count).map((offset, index) => {
    const date = addDays(startDate, offset);
    return {
      number: startNumber + index,
      date,
      weekday: weekdayName(date),
      platform: platformAt(platforms, platformOffset + index),
    };
  });
}

/** Сколько постов досталось каждой площадке: нужно для проверки качества. */
export function countByPlatform(
  slots: readonly ScheduleSlot[],
): Readonly<Partial<Record<PlatformId, number>>> {
  const counts: Partial<Record<PlatformId, number>> = {};
  for (const slot of slots) {
    counts[slot.platform] = (counts[slot.platform] ?? 0) + 1;
  }
  return counts;
}
