/**
 * Площадки. Знание специфики российских соцсетей — одно из главных отличий
 * продукта от переписки с ChatGPT, поэтому список закрытый и осознанный.
 *
 * Числа взяты из промпта третьей версии: это редакционные ориентиры
 * («сколько знаков читается хорошо»), а не технические лимиты платформ.
 * Технические лимиты нужно сверять с документацией площадок отдельно.
 */

export const PLATFORM_IDS = ["telegram", "vk", "max", "tiktok", "ok"] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

export interface PlatformProfile {
  readonly id: PlatformId;
  /** Как площадка называется в интерфейсе и в ответе модели. */
  readonly name: string;
  /** Пропорции картинки для этой площадки. */
  readonly imageAspectRatio: string;
  /** Редакционный ориентир длины готового поста в знаках. */
  readonly textLength: { readonly min: number; readonly max: number };
  /** Площадка про видео: вместо текста поста нужен сценарий по секундам. */
  readonly isVideoFirst: boolean;
}

/** Общий ориентир из третьей версии: 450–900 знаков. */
const DEFAULT_TEXT_LENGTH = { min: 450, max: 900 } as const;

export const PLATFORMS: Readonly<Record<PlatformId, PlatformProfile>> = {
  telegram: {
    id: "telegram",
    name: "Telegram",
    imageAspectRatio: "16:9",
    textLength: DEFAULT_TEXT_LENGTH,
    isVideoFirst: false,
  },
  vk: {
    id: "vk",
    name: "ВКонтакте",
    imageAspectRatio: "1:1",
    textLength: DEFAULT_TEXT_LENGTH,
    isVideoFirst: false,
  },
  max: {
    id: "max",
    name: "MAX",
    // Единственное отличающееся число, прямо заданное в промпте v3: до 600.
    imageAspectRatio: "16:9",
    textLength: { min: 300, max: 600 },
    isVideoFirst: false,
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    imageAspectRatio: "9:16",
    textLength: DEFAULT_TEXT_LENGTH,
    isVideoFirst: true,
  },
  ok: {
    id: "ok",
    name: "Одноклассники",
    imageAspectRatio: "1:1",
    textLength: DEFAULT_TEXT_LENGTH,
    isVideoFirst: false,
  },
};

export function isPlatformId(value: unknown): value is PlatformId {
  return typeof value === "string" && (PLATFORM_IDS as readonly string[]).includes(value);
}

export function getPlatform(id: PlatformId): PlatformProfile {
  return PLATFORMS[id];
}

/** Отображаемое имя по идентификатору: используется и в промпте, и на экране. */
export function platformName(id: PlatformId): string {
  return PLATFORMS[id].name;
}

/** Обратное преобразование: имя из ответа модели → идентификатор. */
export function platformIdByName(name: string): PlatformId | null {
  const normalized = name.trim().toLowerCase();
  for (const id of PLATFORM_IDS) {
    if (PLATFORMS[id].name.toLowerCase() === normalized) return id;
  }
  return null;
}
