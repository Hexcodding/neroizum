/**
 * Выгрузка плана.
 *
 * Два формата, и оба выбраны по тому, как люди на самом деле работают: текст —
 * чтобы переслать в мессенджере или распечатать, таблица — чтобы открыть в
 * Excel и раздать исполнителям. Всё остальное (PDF, интеграции) в MVP не нужно.
 */
import { type GeneratedPost } from "@contracts";
import { groupByDay, platformName, separateCta } from "@/entities/post/view";

export function toPlainText(title: string, posts: readonly GeneratedPost[]): string {
  const lines: string[] = [`КОНТЕНТ-ПЛАН: ${title}`, ""];

  for (const day of groupByDay(posts)) {
    lines.push(`${day.label.toUpperCase()}`, "");
    for (const post of day.posts) {
      // Призыв печатается строкой только тогда, когда его нет в тексте поста:
      // иначе читатель видит один и тот же вопрос дважды подряд.
      const cta = separateCta(post);
      lines.push(
        `${post.time} · ${platformName(post.platform)} · ${post.type} · ${post.rubric}`,
        post.title,
        "",
        post.postContent,
        "",
        cta.length > 0 ? `Призыв: ${cta}` : "",
        post.hashtags.length > 0 ? post.hashtags.join(" ") : "",
        `Картинка: ${post.visual}`,
        "",
        "— — —",
        "",
      );
    }
  }

  return lines.filter((line, index, all) => !(line === "" && all[index - 1] === "")).join("\n");
}

const CSV_HEADER = [
  "Дата",
  "Время",
  "Площадка",
  "Тип",
  "Рубрика",
  "Формат",
  "Заголовок",
  "Текст поста",
  "Призыв",
  "Хештеги",
  "Картинка",
];

/** Кавычки внутри поля удваиваются — иначе таблица разъедется на первой цитате. */
function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export function toCsv(posts: readonly GeneratedPost[]): string {
  const rows = posts.map((post) =>
    [
      post.date,
      post.time,
      platformName(post.platform),
      post.type,
      post.rubric,
      post.format,
      post.title,
      post.postContent,
      post.cta,
      post.hashtags.join(" "),
      post.visual,
    ]
      .map(csvCell)
      .join(";"),
  );

  // Разделитель — точка с запятой, и файл начинается с метки кодировки:
  // без этого Excel на русской Windows открывает файл в одну колонку кракозябрами.
  return `\uFEFF${[CSV_HEADER.map(csvCell).join(";"), ...rows].join("\r\n")}`;
}

/** Имя файла из заголовка плана: без символов, запрещённых в файловой системе. */
export function safeFileName(title: string, extension: string): string {
  const clean = title
    .replace(/[\\/:*?"<>|]/g, " ")
    // Пробелы схлопываются: иначе на месте убранных символов остаются провалы.
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  return `${clean.length > 0 ? clean : "контент-план"}.${extension}`;
}
