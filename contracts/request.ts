/**
 * Что пользователь просит сгенерировать. Единая форма запроса для интерфейса,
 * проверки на границе сервера и сборки промпта.
 */
import type { PlatformId } from "./platforms.ts";
import type {
  AuthorRoleId,
  ChannelStageId,
  GoalId,
  PeriodDays,
  PostsPerWeek,
} from "./content.ts";
import type { PreviousPostSummary } from "./post.ts";

/**
 * Профиль бренда. Собирается один раз в мастере первого запуска из свободного
 * рассказа о бизнесе и потом применяется ко всем постам автоматически — это
 * и есть ответ на вопрос «чем вы отличаетесь от ChatGPT».
 */
export interface BrandProfile {
  /** Голос бренда: как звучит автор. */
  readonly tone: string;
  /** Продукты и предложения. Модели запрещено придумывать те, которых здесь нет. */
  readonly products: string;
  /** Факты доверия: опыт, кейсы, цифры. */
  readonly proof: string;
  /** Слова и штампы, которые запрещено использовать. */
  readonly stopWords: readonly string[];
  /** До трёх образцов авторского текста: копируется ритм, но не темы. */
  readonly styleSamples: readonly string[];
}

export const EMPTY_BRAND_PROFILE: BrandProfile = {
  tone: "",
  products: "",
  proof: "",
  stopWords: [],
  styleSamples: [],
};

export interface GenerationRequest {
  /** Чем занимается бизнес — своими словами. */
  readonly niche: string;
  /** Для кого — своими словами. */
  readonly audience: string;
  readonly goal: GoalId;
  /** Минимум одна площадка. Каждая выбранная обязана появиться в плане. */
  readonly platforms: readonly PlatformId[];
  readonly postsPerWeek: PostsPerWeek;
  readonly periodDays: PeriodDays;
  readonly channelStage: ChannelStageId;
  readonly authorRole: AuthorRoleId;
  readonly brand: BrandProfile;
  /**
   * Юридический режим: контент как информирование о деятельности, без
   * рекламных формулировок. Требование ФЗ о рекламе.
   */
  readonly infoPlanMode: boolean;
  /** Первый день плана в формате ГГГГ-ММ-ДД. */
  readonly startDate: string;
  /**
   * Уже созданные посты, если это продолжение плана или следующая часть
   * длинного плана. Пусто при первой генерации.
   */
  readonly previousPosts: readonly PreviousPostSummary[];
}

/** Ограничения длины пользовательского ввода. */
export const INPUT_LIMITS = {
  niche: 500,
  audience: 500,
  tone: 400,
  products: 600,
  proof: 600,
  stopWord: 40,
  stopWordsCount: 20,
  styleSample: 900,
  styleSamplesCount: 3,
  previousPostsCount: 40,
  /** Просьба переделать пост: одна-две фразы, а не второе техзадание. */
  instruction: 300,
} as const;
