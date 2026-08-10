/**
 * Состояние доступа для всего приложения.
 *
 * Контекст объявлен в отдельном файле от провайдера: так его можно
 * импортировать в хук без того, чтобы тянуть за собой сам провайдер и его
 * зависимости.
 */
import { createContext } from "react";
import type { Session } from "@/shared/api/session";

export interface AccessState {
  readonly session: Session | null;
  /** Идёт проверка ключа. */
  readonly checking: boolean;
  enter(key: string): Promise<void>;
  leave(): Promise<void>;
  /** Сессия перестала действовать на стороне сервера. */
  expire(): void;
}

export const AccessContext = createContext<AccessState | null>(null);
