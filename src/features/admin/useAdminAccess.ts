/**
 * Вход в панель управления и хранение админского токена.
 *
 * Токен лежит в sessionStorage, а не в localStorage: он должен исчезать вместе
 * с закрытой вкладкой. Клиентская сессия живёт две недели ради удобства, а
 * админская — до конца работы, потому что цена чужого доступа здесь другая:
 * это все ключи всех клиентов.
 */
import { useCallback, useState } from "react";
import { adminLogin } from "@/shared/api/admin";
import { toApiError } from "@/shared/api/errors";
import type { ApiError } from "@/shared/api/errors";

const STORAGE_KEY = "neuroizium.admin";

interface StoredAdmin {
  readonly token: string;
  readonly expiresAtMs: number;
}

function read(nowMs: number): StoredAdmin | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAdmin>;
    const valid =
      typeof parsed.token === "string" &&
      typeof parsed.expiresAtMs === "number" &&
      parsed.expiresAtMs > nowMs;
    if (!valid) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return { token: parsed.token as string, expiresAtMs: parsed.expiresAtMs as number };
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export interface AdminAccessState {
  readonly token: string | null;
  readonly checking: boolean;
  readonly error: ApiError | null;
  enter(password: string): Promise<void>;
  leave(): void;
}

export function useAdminAccess(): AdminAccessState {
  const [token, setToken] = useState<string | null>(() => read(Date.now())?.token ?? null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const enter = useCallback(async (password: string): Promise<void> => {
    setChecking(true);
    setError(null);
    try {
      const session = await adminLogin(password);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      setToken(session.token);
    } catch (cause) {
      setError(toApiError(cause));
    } finally {
      setChecking(false);
    }
  }, []);

  const leave = useCallback((): void => {
    sessionStorage.removeItem(STORAGE_KEY);
    setToken(null);
  }, []);

  return { token, checking, error, enter, leave };
}
