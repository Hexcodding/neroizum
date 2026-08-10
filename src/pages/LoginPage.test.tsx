/**
 * Вход по ключу целиком: от ввода до отказа сервера.
 *
 * Проверяется то, что легко сломать незаметно: кнопка не даёт отправить огрызок
 * ключа, текст отказа приходит от сервера дословно, а сам ключ никуда не
 * сохраняется — в браузере остаётся только токен.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/errors";

const activate = vi.fn();
const logout = vi.fn();

vi.mock("@/shared/api/endpoints", () => ({
  activate: (key: string) => activate(key) as unknown,
  logout: (token: string) => logout(token) as unknown,
}));

const { AccessProvider } = await import("@/features/access/AccessProvider");
const LoginPage = (await import("./LoginPage")).default;

const SESSION = {
  token: "t".repeat(64),
  clientId: "ID-ABCDEF",
  monthlyLimit: 20,
  subscriptionUntil: "2026-12-31",
  expiresAtMs: Date.now() + 60_000,
};

function renderLogin() {
  return render(
    <AccessProvider>
      <LoginPage />
    </AccessProvider>,
  );
}

function typeKey(value: string): void {
  fireEvent.change(screen.getByLabelText(/Ключ доступа/), { target: { value } });
}

describe("экран входа", () => {
  beforeEach(() => {
    localStorage.clear();
    activate.mockReset();
    logout.mockReset();
  });

  it("огрызок ключа отправить нельзя", () => {
    renderLogin();
    typeKey("A2B3");

    expect(screen.getByRole("button", { name: "Войти" })).toBeDisabled();
  });

  it("ключ уходит на сервер в каноническом виде, а сессия сохраняется", async () => {
    activate.mockResolvedValue(SESSION);
    renderLogin();

    typeKey(" nzm–a2b3 c4d5 e6f7 ");
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    await waitFor(() => {
      expect(activate).toHaveBeenCalledWith("NZM-A2B3-C4D5-E6F7");
    });
    await waitFor(() => {
      expect(localStorage.getItem("neuroizium.session")).toContain(SESSION.clientId);
    });
    // Сам ключ не сохраняется нигде: он обменян на токен и забыт.
    expect(JSON.stringify(localStorage)).not.toContain("A2B3");
  });

  it("отказ показывается словами сервера, а не общей ошибкой", async () => {
    activate.mockRejectedValue(
      new ApiError("SUBSCRIPTION_ENDED", "Подписка закончилась 1 марта.", false, []),
    );
    renderLogin();

    typeKey("NZM-A2B3-C4D5-E6F7");
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByText("Подписка закончилась 1 марта.")).toBeInTheDocument();
    expect(screen.getByText("Подписка закончилась")).toBeInTheDocument();
  });

  it("после неудачи можно попробовать снова: кнопка не заблокирована навсегда", async () => {
    activate.mockRejectedValue(new ApiError("INVALID_KEY", "Ключ не подошёл.", false, []));
    renderLogin();

    typeKey("NZM-A2B3-C4D5-E6F7");
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByText("Ключ не подошёл.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти" })).toBeEnabled();
  });
});
