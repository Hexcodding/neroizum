/**
 * Подготовка постов к показу: группировка по дням и подписи.
 *
 * Живёт в предметном слое, а не в компоненте: группировка по дням нужна и
 * списку, и календарю, и экспорту. Реализованная в компоненте, она была бы
 * скопирована трижды и разошлась бы.
 */
import { formatHumanDate, PLATFORMS, type GeneratedPost, type PlatformId } from "@contracts";

export interface PostDay {
  readonly date: string;
  /** Дата для человека: «16 марта, понедельник». */
  readonly label: string;
  readonly posts: readonly GeneratedPost[];
}

export function groupByDay(posts: readonly GeneratedPost[]): readonly PostDay[] {
  const byDate = new Map<string, GeneratedPost[]>();

  for (const post of posts) {
    const day = byDate.get(post.date);
    if (day === undefined) byDate.set(post.date, [post]);
    else day.push(post);
  }

  return [...byDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, dayPosts]) => ({
      date,
      label: safeLabel(date),
      posts: [...dayPosts].sort((left, right) => left.time.localeCompare(right.time)),
    }));
}

function safeLabel(date: string): string {
  try {
    return formatHumanDate(date);
  } catch {
    // Дата пришла испорченной: показываем как есть, но экран не роняем.
    return date;
  }
}

export function platformName(platform: PlatformId): string {
  return PLATFORMS[platform].name;
}

/**
 * Оформление метки типа контента. Одинаковое во всех местах, где тип упоминается.
 *
 * Различаются насыщенностью и рамкой, а не разными цветами: своих цветов у
 * продукта два, и придумывать третий ради метки — верный способ получить тему,
 * которая ломается при переключении на светлую.
 */
export function typeTone(type: string): string {
  switch (type) {
    case "Продающий":
      return "bg-primary/20 text-foreground";
    case "Экспертный":
      return "bg-accent/20 text-foreground";
    case "Обучающий":
      return "border border-border/70 text-foreground";
    default:
      return "bg-secondary text-foreground";
  }
}

function comparable(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Призыв, который стоит показать отдельной строкой.
 *
 * По контракту готовый текст поста заканчивается призывом, и поле cta повторяет
 * его для таблицы. Пока интерфейс печатал оба подряд, читатель видел один и тот
 * же вопрос дважды — и в посте, и в буфере обмена, и в выгрузке. Отдельная
 * строка нужна только тогда, когда призыва в тексте нет.
 */
export function separateCta(post: GeneratedPost): string {
  const cta = post.cta.trim();
  if (cta.length === 0) return "";
  return comparable(post.postContent).includes(comparable(cta)) ? "" : cta;
}

/** Что попадает в буфер обмена: текст, призыв, хештеги — то, что человек вставит. */
export function postToClipboard(post: GeneratedPost): string {
  return [post.postContent, separateCta(post), post.hashtags.join(" ")]
    .filter((part) => part.trim().length > 0)
    .join("\n\n");
}
