import { useContext } from "react";
import { AccessContext } from "./access-context";
import type { AccessState } from "./access-context";

export function useAccess(): AccessState {
  const value = useContext(AccessContext);
  if (value === null) {
    throw new Error("useAccess вызван вне AccessProvider");
  }
  return value;
}

/**
 * Токен для запросов. Отдельный хук, потому что сервисам нужен только он, а не
 * весь набор действий над сессией.
 */
export function useSessionToken(): string {
  const { session } = useAccess();
  if (session === null) {
    throw new Error("Запрос к серверу без сессии: экран должен быть за проверкой доступа");
  }
  return session.token;
}
