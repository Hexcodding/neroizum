/**
 * Панель управления: вход, выдача ключа, действия над лицензией.
 *
 * Главное, что проверяется, — обращение с ключом. Он существует ровно один раз,
 * в ответе на выдачу, и экран не должен ни спрятать его раньше времени, ни
 * потерять при обновлении списка.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/errors";

const adminLogin = vi.fn();
const adminLicenses = vi.fn();
const adminIssue = vi.fn();
const adminSetDisabled = vi.fn();
const adminResetSession = vi.fn();
const adminSetLimit = vi.fn();
const adminSetSubscription = vi.fn();

vi.mock("@/shared/api/admin", () => ({
  adminLogin: (password: string) => adminLogin(password) as unknown,
  adminLicenses: (token: string) => adminLicenses(token) as unknown,
  adminIssue: (token: string, input: unknown) => adminIssue(token, input) as unknown,
  adminSetDisabled: (token: string, id: string, disabled: boolean) =>
    adminSetDisabled(token, id, disabled) as unknown,
  adminSetLimit: (token: string, id: string, limit: number) =>
    adminSetLimit(token, id, limit) as unknown,
  adminSetSubscription: (token: string, id: string, until: string) =>
    adminSetSubscription(token, id, until) as unknown,
  adminResetSession: (token: string, id: string) => adminResetSession(token, id) as unknown,
}));

const AdminPage = (await import("./AdminPage")).default;
const { ThemeProvider } = await import("@/shared/theme/ThemeProvider");

/** Тема нужна кнопке переключения: в приложении провайдер стоит выше маршрутов. */
function renderAdmin() {
  return render(
    <ThemeProvider>
      <AdminPage />
    </ThemeProvider>,
  );
}

const TOKEN = "admin-token";
const LICENSE = {
  id: "license-1",
  clientId: "ID-ABCDEF",
  disabled: false,
  subscriptionUntil: "2026-12-31",
  monthlyLimit: 20,
  note: "Пекарня в Химках",
  createdAt: "2026-08-01T10:00:00.000Z",
  usedThisMonth: 3,
};

function signedIn(): void {
  sessionStorage.setItem(
    "neuroizium.admin",
    JSON.stringify({ token: TOKEN, expiresAtMs: Date.now() + 600_000 }),
  );
}

describe("панель управления", () => {
  beforeEach(() => {
    sessionStorage.clear();
    for (const mock of [
      adminLogin,
      adminLicenses,
      adminIssue,
      adminSetDisabled,
      adminResetSession,
      adminSetLimit,
      adminSetSubscription,
    ]) {
      mock.mockReset();
    }
    adminLicenses.mockResolvedValue([LICENSE]);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("без входа показывает только пароль, а список не запрашивает", () => {
    renderAdmin();

    expect(screen.getByLabelText("Пароль")).toBeInTheDocument();
    expect(adminLicenses).not.toHaveBeenCalled();
  });

  it("неверный пароль объясняется, и токен не сохраняется", async () => {
    adminLogin.mockRejectedValue(
      new ApiError("ADMIN_DENIED", "Нужен вход в панель управления.", false, []),
    );
    renderAdmin();

    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "неверный" } });
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByText("Нужен вход в панель управления.")).toBeInTheDocument();
    expect(sessionStorage.getItem("neuroizium.admin")).toBeNull();
  });

  it("после входа показывает лицензии с расходом за месяц", async () => {
    adminLogin.mockResolvedValue({ token: TOKEN, expiresAtMs: Date.now() + 600_000 });
    renderAdmin();

    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "верный" } });
    fireEvent.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByText("ID-ABCDEF")).toBeInTheDocument();
    expect(screen.getByText("3 из 20")).toBeInTheDocument();
    expect(screen.getByText("Пекарня в Химках")).toBeInTheDocument();
  });

  it("выданный ключ показывается целиком и не исчезает сам", async () => {
    signedIn();
    adminIssue.mockResolvedValue({
      licenseId: "license-2",
      clientId: "ID-QWERTY",
      key: "NZM-A2B3-C4D5-E6F7",
    });
    renderAdmin();

    fireEvent.click(await screen.findByRole("button", { name: "Выдать ключ" }));

    expect(await screen.findByText("NZM-A2B3-C4D5-E6F7")).toBeInTheDocument();
    expect(screen.getByText(/Скопируйте его сейчас/)).toBeInTheDocument();
    // Список перечитан, но карточка с ключом на месте: обновление её не смывает.
    await waitFor(() => {
      expect(adminLicenses).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText("NZM-A2B3-C4D5-E6F7")).toBeInTheDocument();
  });

  it("отключение доступа требует подтверждения", async () => {
    signedIn();
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirm);
    renderAdmin();

    fireEvent.click(await screen.findByRole("button", { name: "Отключить" }));

    expect(confirm).toHaveBeenCalled();
    expect(adminSetDisabled).not.toHaveBeenCalled();
  });

  it("подтверждённое отключение уходит на сервер", async () => {
    signedIn();
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    adminSetDisabled.mockResolvedValue(undefined);
    renderAdmin();

    fireEvent.click(await screen.findByRole("button", { name: "Отключить" }));

    await waitFor(() => {
      expect(adminSetDisabled).toHaveBeenCalledWith(TOKEN, "license-1", true);
    });
  });

  it("сброс входа не спрашивает подтверждения: он ничего не ломает", async () => {
    signedIn();
    adminResetSession.mockResolvedValue(undefined);
    renderAdmin();

    fireEvent.click(await screen.findByRole("button", { name: "Сбросить вход" }));

    await waitFor(() => {
      expect(adminResetSession).toHaveBeenCalledWith(TOKEN, "license-1");
    });
  });

  it("продление подписки отправляет только изменённое поле", async () => {
    signedIn();
    adminSetSubscription.mockResolvedValue(undefined);
    renderAdmin();

    fireEvent.click(await screen.findByRole("button", { name: "Изменить срок и лимит" }));
    fireEvent.change(screen.getByLabelText("Продлить до"), { target: { value: "2027-01-31" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(adminSetSubscription).toHaveBeenCalledWith(TOKEN, "license-1", "2027-01-31");
    });
    // Лимит не менялся — запроса на него нет.
    expect(adminSetLimit).not.toHaveBeenCalled();
  });

  it("выход забывает токен", async () => {
    signedIn();
    renderAdmin();

    fireEvent.click(await screen.findByRole("button", { name: "Выйти" }));

    expect(sessionStorage.getItem("neuroizium.admin")).toBeNull();
    expect(screen.getByLabelText("Пароль")).toBeInTheDocument();
  });

  it("просроченный токен не считается входом", () => {
    sessionStorage.setItem(
      "neuroizium.admin",
      JSON.stringify({ token: TOKEN, expiresAtMs: Date.now() - 1 }),
    );

    renderAdmin();

    expect(screen.getByLabelText("Пароль")).toBeInTheDocument();
    expect(sessionStorage.getItem("neuroizium.admin")).toBeNull();
  });
});
