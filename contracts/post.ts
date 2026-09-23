/**
 * Форма готового поста — это и контракт ответа модели, и то, что хранится
 * в базе, и то, что показывает интерфейс. Одна форма на все три роли, чтобы
 * не появилось слоя перевода имён полей, в котором теряются данные.
 *
 * Отличия от предыдущей версии, сделанные осознанно:
 * — дата хранится как ГГГГ-ММ-ДД, а не «15.03.2026 (Суббота)». Дату для
 *   человека собирает интерфейс; в данных лежит то, что можно сортировать.
 * — площадка хранится идентификатором, а не отображаемым именем.
 * — добавлено поле visualStyle: без него правило «не повторять стиль более
 *   двух раз подряд» невозможно проверить программой, только на глаз.
 */
import type { PlatformId } from "./platforms.ts";
import type { ContentType, PostFormat } from "./content.ts";

export interface GeneratedPost {
  /** Порядковый номер в плане, начиная с 1. */
  readonly number: number;
  /** Дата публикации в формате ГГГГ-ММ-ДД. */
  readonly date: string;
  /** Время публикации в формате ЧЧ:ММ. */
  readonly time: string;
  readonly platform: PlatformId;
  /** Рубрика из каталога либо своя под нишу. */
  readonly rubric: string;
  readonly format: PostFormat;
  /** Заголовок-хук. */
  readonly title: string;
  /** Первые строки, которые удерживают внимание. */
  readonly hook: string;
  /** Коротко о чём пост. Вспомогательное поле, не замена тексту. */
  readonly description: string;
  /** План слайдов или кадров для карусели и видео. */
  readonly script: string;
  readonly type: ContentType;
  /** Призыв к действию. */
  readonly cta: string;
  readonly hashtags: readonly string[];
  /** Описание композиции и света на русском — для человека. */
  readonly visual: string;
  /** Идентификатор стиля из визуальной матрицы. */
  readonly visualStyle: string;
  /** Промпт для генератора картинок, на английском. */
  readonly imagePrompt: string;
  /** ГЛАВНОЕ поле: готовый к публикации текст поста. */
  readonly postContent: string;
}

/** Все поля поста, обязательные к заполнению моделью. */
export const GENERATED_POST_FIELDS = [
  "number",
  "date",
  "time",
  "platform",
  "rubric",
  "format",
  "title",
  "hook",
  "description",
  "script",
  "type",
  "cta",
  "hashtags",
  "visual",
  "visualStyle",
  "imagePrompt",
  "postContent",
] as const satisfies readonly (keyof GeneratedPost)[];

export interface ContentPlan {
  readonly id: string;
  /** Момент создания в формате ISO. */
  readonly createdAt: string;
  /** Версия промпта, которым сгенерирован план. */
  readonly promptVersion: string;
  readonly posts: readonly GeneratedPost[];
}

/**
 * Сжатое описание уже созданного поста. Передаётся модели при генерации
 * следующей части плана. В предыдущей версии передавались только номер,
 * дата, заголовок и тип — рубрика, хук и формат терялись, и на плане
 * в 30 дней повторы становились почти неизбежными.
 */
export interface PreviousPostSummary {
  readonly number: number;
  readonly date: string;
  readonly platform: PlatformId;
  readonly title: string;
  readonly type: ContentType;
  readonly rubric: string;
  readonly hook: string;
  readonly format: PostFormat;
}

export function toPreviousPostSummary(post: GeneratedPost): PreviousPostSummary {
  return {
    number: post.number,
    date: post.date,
    platform: post.platform,
    title: post.title,
    type: post.type,
    rubric: post.rubric,
    hook: post.hook,
    format: post.format,
  };
}
