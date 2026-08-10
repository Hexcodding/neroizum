/**
 * Провайдер доступа: помнит сессию, отдаёт вход и выход.
 *
 * Ключ здесь не сохраняется никуда — он обменивается на токен и забывается.
 * Ошибку от сервера провайдер не переписывает: у активации есть отдельные
 * ответы для «ключ не подошёл» и «подписка закончилась», и подменять их общим
 * текстом значит отправлять клиента в поддержку.
 */
import { useCallback, useMemo, useState } from "react";
import { activate, logout } from "@/shared/api/endpoints";
import { clearSession, readSession, saveSession } from "@/shared/api/session";
import type { Session } from "@/shared/api/session";
import { AccessContext } from "./access-context";
import type { AccessState } from "./access-context";

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [checking, setChecking] = useState(false);

  const enter = useCallback(async (key: string): Promise<void> => {
    setChecking(true);
    try {
      const fresh = await activate(key);
      saveSession(fresh);
      setSession(fresh);
    } finally {
      setChecking(false);
    }
  }, []);

  const leave = useCallback(async (): Promise<void> => {
    const token = session?.token;
    // Сначала забываем локально: если сервер не ответит, человек всё равно
    // вышел, а не остался в непонятном состоянии.
    clearSession();
    setSession(null);
    if (token === undefined) return;
    try {
      await logout(token);
    } catch {
      // Сессия истечёт сама через две недели.
    }
  }, [session]);

  const expire = useCallback((): void => {
    clearSession();
    setSession(null);
  }, []);

  const value = useMemo<AccessState>(
    () => ({ session, checking, enter, leave, expire }),
    [session, checking, enter, leave, expire],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}
