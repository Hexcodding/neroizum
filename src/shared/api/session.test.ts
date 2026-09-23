import { beforeEach, describe, expect, it } from "vitest";
import { clearSession, readSession, saveSession, type Session } from "./session";
import { ApiError, toApiError } from "./errors";

const NOW = Date.UTC(2026, 2, 15);

const SESSION: Session = {
  token: "a".repeat(64),
  clientId: "ID-ABCDEF",
  monthlyLimit: 20,
  subscriptionUntil: "2026-12-31",
  expiresAtMs: NOW + 1000,
};

describe("сессия между заходами", () => {
  beforeEach(() => {
    clearSession();
  });

  it("сохраняется и читается", () => {
    saveSession(SESSION);
    expect(readSession(NOW)).toEqual(SESSION);
  });

  it("истёкшая сессия не возвращается и удаляется", () => {
    saveSession(SESSION);

    expect(readSession(SESSION.expiresAtMs + 1)).toBeNull();
    // Повторное чтение уже в «рабочее» время тоже пусто: запись удалена.
    expect(readSession(NOW)).toBeNull();
  });

  it("испорченная запись не роняет приложение", () => {
    localStorage.setItem("neuroizium.session", "{это не json");

    expect(readSession(NOW)).toBeNull();
  });

  it("запись без нужных полей считается негодной", () => {
    localStorage.setItem("neuroizium.session", JSON.stringify({ token: "abc" }));

    expect(readSession(NOW)).toBeNull();
  });
});

describe("разбор ошибки сервера", () => {
  it("берёт готовый текст и признак повтора", () => {
    const error = toApiError({
      error: { code: "RATE_LIMITED", message: "Подождите минуту.", retryable: true, fields: [] },
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.retryable).toBe(true);
  });

  it("непонятный ответ превращается в сетевую ошибку с советом", () => {
    const error = toApiError("<html>502 Bad Gateway</html>");

    expect(error.code).toBe("NETWORK");
    expect(error.message).toContain("интернет");
    // Технические подробности наружу не просачиваются.
    expect(error.message).not.toContain("502");
  });
});
