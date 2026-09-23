/**
 * Хранение сессии между заходами.
 *
 * Токен лежит в localStorage — так человек не вводит ключ каждое утро. Это
 * осознанный компромисс: код на странице теоретически может прочитать
 * хранилище, но и куки без сервера на своём домене нам недоступны, а вводить
 * ключ по десять раз в день никто не станет.
 *
 * Что смягчает риск: токен живёт две недели и обрывается на сервере при
 * блокировке ключа, а сам лицензионный ключ здесь не хранится никогда — только
 * выданный в обмен на него токен.
 */

const STORAGE_KEY = "neuroizium.session";

export interface Session {
  readonly token: string;
  /** Видимый номер клиента: его можно показывать в интерфейсе. */
  readonly clientId: string;
  readonly monthlyLimit: number;
  readonly subscriptionUntil: string;
  readonly expiresAtMs: number;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.token === "string" &&
    typeof candidate.clientId === "string" &&
    typeof candidate.monthlyLimit === "number" &&
    typeof candidate.subscriptionUntil === "string" &&
    typeof candidate.expiresAtMs === "number"
  );
}

export function readSession(nowMs: number = Date.now()): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isSession(parsed)) {
      clearSession();
      return null;
    }
    // Истёкшая сессия удаляется сразу: иначе пользователь увидит рабочий
    // интерфейс, который откажет на первом же действии.
    if (parsed.expiresAtMs <= nowMs) {
      clearSession();
      return null;
    }
    return parsed;
  } catch {
    clearSession();
    return null;
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
