/**
 * Проверка качества готового плана.
 *
 * Промпт запрещает тизеры и требует пропорций, но запрет в инструкции — это
 * просьба, а не гарантия. Здесь те же правила проверяются программой, и посты,
 * которые их нарушили, отправляются на один автоматический перезапрос — молча
 * для пользователя.
 *
 * Формулировки причин написаны так, чтобы их можно было отдать модели при
 * перезапросе: они объясняют, что именно не так.
 */
import { PLATFORMS, type ContentType, type GeneratedPost } from "../../contracts/index.ts";
import { TEASER_PHRASES } from "../prompt/blocks/anti-teaser.ts";
import { findCliche } from "../prompt/blocks/voice.ts";
import { MAX_STYLE_REPEATS_IN_ROW } from "../prompt/blocks/visual.ts";
import { INFO_PLAN_FORBIDDEN_WORDS } from "../prompt/blocks/compliance.ts";

export interface PostDefect {
  readonly number: number;
  readonly reasons: readonly string[];
}

export interface QualityReport {
  /** Посты, которые нужно перегенерировать. */
  readonly defects: readonly PostDefect[];
  /** Замечания к плану целиком: перезапросом отдельных постов не лечатся. */
  readonly planWarnings: readonly string[];
}

/** Ниже этого текст не является постом, а не «коротким постом». */
const MIN_POST_LENGTH = 200;
const MIN_TITLE_LENGTH = 10;
/** Насколько допустимо превысить редакционный лимит площадки. */
const LENGTH_TOLERANCE = 1.5;

const LIST_MARKER = /(^|\n)\s*(?:\d+[).:]|[-–—•])\s+/g;

/**
 * Обещание количества в заголовке: «5 ошибок», «3 шага», «7 мифов».
 * Основы намеренно короткие: у «ошибок» и «ошибки» разные окончания, и полная
 * форма «ошибк» не совпала бы с родительным падежом — той самой формой, которая
 * в заголовках встречается чаще всего.
 */
const PROMISED_COUNT =
  /\b(\d{1,2})\s+(?:ошиб|шаг|миф|способ|причин|признак|правил|пункт|совет|при[её]м|инструмент|фактор)/i;

function countListItems(text: string): number {
  return text.match(LIST_MARKER)?.length ?? 0;
}

function findTeaser(text: string): string | null {
  const lower = text.toLowerCase();
  return TEASER_PHRASES.find((phrase) => lower.includes(phrase)) ?? null;
}

/**
 * Штамп в тексте. Проверяются и заголовок с хуком: именно там чаще всего
 * оказывается «Многие думают, что…» — то есть первое, что видит читатель.
 */
function findPostCliche(post: GeneratedPost): string | null {
  return findCliche(`${post.title}\n${post.hook}\n${post.postContent}`);
}

/** Обещал в заголовке количество — обязан перечислить столько же пунктов. */
function checkPromisedItems(post: GeneratedPost): string | null {
  const promised = PROMISED_COUNT.exec(post.title);
  if (promised?.[1] === undefined) return null;

  const expected = Number(promised[1]);
  if (expected < 2 || expected > 20) return null;

  const actual = countListItems(post.postContent);
  if (actual >= expected) return null;

  return `заголовок обещает ${String(expected)} пунктов, а в тексте перечислено ${String(actual)}: перечисли все обещанные пункты`;
}

function checkPost(post: GeneratedPost, infoPlanMode: boolean): string[] {
  const reasons: string[] = [];

  if (post.postContent.length < MIN_POST_LENGTH) {
    reasons.push("текст поста пустой или слишком короткий: нужен готовый к публикации пост");
  }
  if (post.title.length < MIN_TITLE_LENGTH) {
    reasons.push("нет заголовка");
  }

  const teaser = findTeaser(post.postContent);
  if (teaser !== null) {
    reasons.push(`текст обещает продолжение вместо пользы: «${teaser}»`);
  }

  const cliche = findPostCliche(post);
  if (cliche !== null) {
    reasons.push(
      `штамп «${cliche}»: начни с конкретного — сцены, цифры из данных о бизнесе или реплики клиента`,
    );
  }

  const promised = checkPromisedItems(post);
  if (promised !== null) reasons.push(promised);

  const limit = PLATFORMS[post.platform].textLength.max * LENGTH_TOLERANCE;
  if (post.postContent.length > limit) {
    reasons.push(
      `текст длиннее лимита площадки: сократи до ${String(PLATFORMS[post.platform].textLength.max)} знаков, не выбрасывая пользу`,
    );
  }

  if (infoPlanMode) {
    const lower = `${post.postContent} ${post.cta}`.toLowerCase();
    const forbidden = INFO_PLAN_FORBIDDEN_WORDS.find((word) => lower.includes(word));
    if (forbidden !== undefined) {
      reasons.push(`в режиме инфо-плана запрещено слово «${forbidden}»`);
    }
  }

  return reasons;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").replace(/\s+/g, " ").trim();
}

/** Повторы заголовков: чаще всего это один и тот же пост, переписанный заново. */
function findDuplicateTitles(posts: readonly GeneratedPost[]): Map<number, string> {
  const seen = new Map<string, number>();
  const duplicates = new Map<number, string>();

  for (const post of posts) {
    const key = normalizeTitle(post.title);
    if (key.length === 0) continue;
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, post.number);
    } else {
      duplicates.set(
        post.number,
        `заголовок повторяет пост №${String(first)}: нужна другая тема, а не пересказ`,
      );
    }
  }
  return duplicates;
}

function checkStyleRepeats(posts: readonly GeneratedPost[]): string[] {
  const warnings: string[] = [];
  let streak = 1;

  for (let index = 1; index < posts.length; index += 1) {
    const previous = posts[index - 1];
    const current = posts[index];
    if (previous === undefined || current === undefined) continue;

    streak = current.visualStyle === previous.visualStyle ? streak + 1 : 1;
    if (streak > MAX_STYLE_REPEATS_IN_ROW) {
      warnings.push(
        `визуальный стиль «${current.visualStyle}» повторяется ${String(streak)} раза подряд у поста №${String(current.number)}`,
      );
    }
  }
  return warnings;
}

function checkProportions(
  posts: readonly GeneratedPost[],
  expected: Readonly<Record<ContentType, number>>,
): string[] {
  const actual = new Map<ContentType, number>();
  for (const post of posts) {
    actual.set(post.type, (actual.get(post.type) ?? 0) + 1);
  }

  const warnings: string[] = [];
  // Отклонение на один пост — округление, а не нарушение пропорций.
  for (const [type, count] of Object.entries(expected) as [ContentType, number][]) {
    const difference = Math.abs((actual.get(type) ?? 0) - count);
    if (difference > 1) {
      warnings.push(
        `постов типа «${type}» получилось ${String(actual.get(type) ?? 0)} вместо ${String(count)}`,
      );
    }
  }
  return warnings;
}

export interface QualityInput {
  readonly posts: readonly GeneratedPost[];
  readonly expectedTypeCounts: Readonly<Record<ContentType, number>>;
  readonly infoPlanMode: boolean;
}

export function checkPlanQuality(input: QualityInput): QualityReport {
  const duplicates = findDuplicateTitles(input.posts);
  const defects: PostDefect[] = [];

  for (const post of input.posts) {
    const reasons = checkPost(post, input.infoPlanMode);
    const duplicate = duplicates.get(post.number);
    if (duplicate !== undefined) reasons.push(duplicate);
    if (reasons.length > 0) defects.push({ number: post.number, reasons });
  }

  return {
    defects,
    planWarnings: [
      ...checkStyleRepeats(input.posts),
      ...checkProportions(input.posts, input.expectedTypeCounts),
    ],
  };
}
