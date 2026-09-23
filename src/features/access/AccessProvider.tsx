/**
 * Провайдер доступа: помнит сессию, отдаёт вход, выход и остаток генераций.
 *
 * Ключ здесь не сохраняется никуда — он обменивается на токен и забывается.
 * Ошибку от сервера провайдер не переписывает: у активации есть отдельные
 * ответы для «ключ не подошёл» и «подписка закончилась», и подменять их общим
 * текстом значит отправлять клиента в поддержку.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { activate, fetchQuota, logout } from "@/shared/api/endpoints";
import type { QuotaStatus } from "@/shared/api/endpoints";
import { clearSession, readSession, saveSession } from "@/shared/api/session";
import type { Session } from "@/shared/api/session";
import { AccessContext } from "./access-context";
import type { AccessState } from "./access-context";

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => readSession());
  const [checking, setChecking] = useState(false);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [improvements, setImprovements] = useState<QuotaStatus | null>(null);
  const [images, setImages] = useState<QuotaStatus | null>(null);

  const refreshQuota = useCallback(async (): Promise<void> => {
    const token = session?.token;
    if (token === undefined) return;
    try {
      const result = await fetchQuota(token);
      setQuota(result.quota);
      setImprovements(result.improvements);
      setImages(result.images);
    } catch {
      // Остаток — сведение, а не условие работы. Не ответил сервер — просто не
      // показываем цифру, вместо того чтобы пугать человека ошибкой.
      setQuota(null);
      setImprovements(null);
      setImages(null);
    }
  }, [session]);

  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota]);

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

  const forget = useCallback((): void => {
    clearSession();
    setSession(null);
    setQuota(null);
    setImprovements(null);
    setImages(null);
  }, []);

  const leave = useCallback(async (): Promise<void> => {
    const token = session?.token;
    // Сначала забываем локально: если сервер не ответит, человек всё равно
    // вышел, а не остался в непонятном состоянии.
    forget();
    if (token === undefined) return;
    try {
      await logout(token);
    } catch {
      // Сессия истечёт сама через две недели.
    }
  }, [session, forget]);

  const value = useMemo<AccessState>(
    () => ({
      session,
      checking,
      quota,
      improvements,
      images,
      enter,
      leave,
      expire: forget,
      refreshQuota,
      noteImprovements: setImprovements,
      noteImages: setImages,
    }),
    [session, checking, quota, improvements, images, enter, leave, forget, refreshQuota],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}
