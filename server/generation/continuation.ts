/**
 * Продолжение сохранённого плана: новые посты дописываются в тот же план.
 *
 * Заявку клиент не присылает — сервер берёт её из базы. Причина не в недоверии,
 * а в целостности: номера постов и дата первого нового поста обязаны считаться
 * от того, что уже лежит в базе. Иначе два продолжения подряд дадут
 * повторяющиеся номера и наложенные друг на друга даты.
 */
import {
  addDays,
  PERIOD_DAYS_OPTIONS,
  toPreviousPostSummary,
  type GeneratedPost,
  type GenerationRequest,
  type PeriodDays,
} from "../../contracts/index.ts";
import { GenerationError } from "./errors.ts";

/**
 * Сколько прошлых постов уходит в промпт при продолжении. Обрезка, а не
 * поднятие общего лимита: промпт растёт линейно с числом постов, а польза от
 * давних падает. Повториться новый пост рискует прежде всего с соседями по
 * времени, а не с тем, что вышло месяц назад.
 */
export const CONTINUATION_CONTEXT_POSTS = 24;

/** Что просит клиент: какой план продлить и на сколько дней. */
export interface ContinuationCommand {
  readonly planId: string;
  readonly periodDays: PeriodDays;
}

export interface ContinuationOffsets {
  /** Номер первого нового поста: нумерация продолжается, а не начинается заново. */
  readonly startNumber: number;
  /** Сколько площадок уже роздано: круг чередования не сбрасывается. */
  readonly platformOffset: number;
}

export interface ContinuedPlan extends ContinuationOffsets {
  readonly request: GenerationRequest;
}

/**
 * Продолжение узнаётся по одному полю: обычная заявка его не содержит. Так
 * продолжение обходится без своей публичной точки входа со своим CORS,
 * своим лимитом попыток и своей возможностью забыть проверку доступа.
 */
export function readContinuationCommand(
  body: Record<string, unknown>,
): ContinuationCommand | null {
  const planId = body.continuePlanId;
  if (planId === undefined || planId === null) return null;

  if (typeof planId !== "string" || planId.length === 0) {
    throw new GenerationError("INVALID_REQUEST", "не указан план для продолжения");
  }
  if (!PERIOD_DAYS_OPTIONS.includes(body.periodDays as never)) {
    throw new GenerationError("INVALID_REQUEST", "период продолжения не из списка", [
      { field: "periodDays", message: "Выберите, на сколько продлить план: 7, 14 или 30 дней." },
    ]);
  }

  return { planId, periodDays: body.periodDays as PeriodDays };
}

function lastDateOf(posts: readonly GeneratedPost[]): string {
  return posts.reduce((latest, post) => (post.date > latest ? post.date : latest), "");
}

function lastNumberOf(posts: readonly GeneratedPost[]): number {
  return posts.reduce((highest, post) => Math.max(highest, post.number), 0);
}

/**
 * Заявка на продолжение: та же самая, но с новым периодом, новой датой старта
 * и предысторией из уже написанных постов.
 */
export function buildContinuation(
  storedRequest: unknown,
  posts: readonly GeneratedPost[],
  periodDays: PeriodDays,
): ContinuedPlan {
  if (typeof storedRequest !== "object" || storedRequest === null || Array.isArray(storedRequest)) {
    throw new GenerationError("INVALID_REQUEST", "у плана не сохранена заявка");
  }
  if (posts.length === 0) {
    throw new GenerationError("INVALID_REQUEST", "в плане нет постов, продолжать нечего");
  }

  const ordered = [...posts].sort((left, right) => left.number - right.number);

  return {
    request: {
      ...(storedRequest as GenerationRequest),
      periodDays,
      startDate: addDays(lastDateOf(ordered), 1),
      previousPosts: ordered.slice(-CONTINUATION_CONTEXT_POSTS).map(toPreviousPostSummary),
    },
    startNumber: lastNumberOf(ordered) + 1,
    platformOffset: ordered.length,
  };
}
