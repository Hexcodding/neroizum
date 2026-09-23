/**
 * Черновик заявки на план.
 *
 * Хранится в браузере и переживает перезагрузку. Причина простая: заполнение
 * занимает несколько минут, а сбой генерации или случайное закрытие вкладки не
 * должны стоить этих минут. В предыдущей версии форма обнулялась, и человек
 * второй раз её просто не заполнял.
 *
 * Профиль бренда лежит в том же черновике и переиспользуется в следующих
 * планах: это и есть «мы знаем ваш голос, а ChatGPT нет».
 */
import {
  EMPTY_BRAND_PROFILE,
  todayIso,
  type AuthorRoleId,
  type BrandProfile,
  type ChannelStageId,
  type GenerationRequest,
  type GoalId,
  type PeriodDays,
  type PlatformId,
  type PostsPerWeek,
} from "@contracts";

const STORAGE_KEY = "neuroizium.draft";

export interface PlanDraft {
  readonly niche: string;
  readonly audience: string;
  readonly goal: GoalId;
  readonly platforms: readonly PlatformId[];
  readonly postsPerWeek: PostsPerWeek;
  readonly periodDays: PeriodDays;
  readonly channelStage: ChannelStageId;
  readonly authorRole: AuthorRoleId;
  readonly infoPlanMode: boolean;
  readonly startDate: string;
  readonly brand: BrandProfile;
}

export function emptyDraft(): PlanDraft {
  return {
    niche: "",
    audience: "",
    goal: "sales",
    platforms: ["telegram"],
    postsPerWeek: 3,
    periodDays: 7,
    channelStage: "start",
    authorRole: "founder",
    infoPlanMode: false,
    // Первый день — сегодня: самый частый ответ, и его не нужно вводить.
    startDate: todayIso(),
    brand: EMPTY_BRAND_PROFILE,
  };
}

export function readDraft(): PlanDraft {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return emptyDraft();

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return emptyDraft();
    // Поля черновика могли устареть после обновления: недостающие берутся из
    // пустого черновика, а не превращаются в undefined посреди формы.
    return { ...emptyDraft(), ...(parsed as Partial<PlanDraft>) };
  } catch {
    return emptyDraft();
  }
}

export function saveDraft(draft: PlanDraft): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

/** Черновик в запрос к серверу. Пустые поля бренда отбрасываются. */
export function toGenerationRequest(draft: PlanDraft): GenerationRequest {
  return {
    niche: draft.niche.trim(),
    audience: draft.audience.trim(),
    goal: draft.goal,
    platforms: draft.platforms,
    postsPerWeek: draft.postsPerWeek,
    periodDays: draft.periodDays,
    channelStage: draft.channelStage,
    authorRole: draft.authorRole,
    infoPlanMode: draft.infoPlanMode,
    startDate: draft.startDate,
    brand: {
      tone: draft.brand.tone.trim(),
      products: draft.brand.products.trim(),
      proof: draft.brand.proof.trim(),
      stopWords: draft.brand.stopWords.filter((word) => word.trim().length > 0),
      styleSamples: draft.brand.styleSamples.filter((sample) => sample.trim().length > 0),
    },
    previousPosts: [],
  };
}
