/**
 * Состояние доступа для всего приложения.
 *
 * Контекст объявлен в отдельном файле от провайдера: так его можно
 * импортировать в хук без того, чтобы тянуть за собой сам провайдер и его
 * зависимости.
 */
import { createContext } from "react";
import type { Session } from "@/shared/api/session";
import type { QuotaStatus } from "@/shared/api/endpoints";

export interface AccessState {
  readonly session: Session | null;
  /** Идёт проверка ключа. */
  readonly checking: boolean;
  /**
   * Остаток генераций месяца. `null` — ещё не спрашивали или сервер не ответил;
   * в этом случае остаток не показывается вовсе. Показать неверное число хуже,
   * чем не показать никакого: по нему человек планирует работу.
   */
  readonly quota: QuotaStatus | null;
  /** Остаток улучшений постов. Считается отдельно от планов. */
  readonly improvements: QuotaStatus | null;
  /** Остаток картинок. Третий счётчик: цена картинки на порядок выше текста. */
  readonly images: QuotaStatus | null;
  enter(key: string): Promise<void>;
  leave(): Promise<void>;
  /** Сессия перестала действовать на стороне сервера. */
  expire(): void;
  /** Перечитать остаток. Вызывается после каждой генерации. */
  refreshQuota(): Promise<void>;
  /**
   * Запомнить остаток улучшений, который сервер вернул вместе с готовым постом.
   * Лишний запрос ради числа, которое уже пришло, — это задержка на ровном месте.
   */
  noteImprovements(status: QuotaStatus): void;
  /** То же самое для картинок: остаток приходит вместе с готовой картинкой. */
  noteImages(status: QuotaStatus): void;
}

export const AccessContext = createContext<AccessState | null>(null);
