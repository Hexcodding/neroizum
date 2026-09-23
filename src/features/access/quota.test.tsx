/**
 * Остаток генераций на экране.
 *
 * Проверяется формулировка и поведение в двух граничных случаях: планы
 * закончились и сервер не ответил. Второй случай важнее: показать неверное
 * число хуже, чем не показать никакого — по остатку человек планирует работу.
 */
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchQuota = vi.fn();

vi.mock("@/shared/api/endpoints", () => ({
  activate: vi.fn(),
  logout: vi.fn(),
  fetchQuota: (token: string) => fetchQuota(token) as unknown,
}));

const { AccessProvider } = await import("./AccessProvider");
const { QuotaBadge } = await import("./QuotaBadge");

const SESSION = {
  token: "t".repeat(64),
  clientId: "ID-ABCDEF",
  monthlyLimit: 20,
  subscriptionUntil: "2026-12-31",
  expiresAtMs: Date.now() + 600_000,
};

function renderBadge() {
  return render(
    <AccessProvider>
      <QuotaBadge />
    </AccessProvider>,
  );
}

describe("остаток генераций", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("neuroizium.session", JSON.stringify(SESSION));
    fetchQuota.mockReset();
  });

  it("показывается остатком, а не расходом", async () => {
    fetchQuota.mockResolvedValue({
      quota: { used: 2, limit: 20, left: 18 },
      subscriptionUntil: "2026-12-31",
    });

    renderBadge();

    expect(await screen.findByText("Осталось 18 из 20")).toBeInTheDocument();
  });

  it("когда планы кончились, говорит об этом словами", async () => {
    fetchQuota.mockResolvedValue({
      quota: { used: 20, limit: 20, left: 0 },
      subscriptionUntil: "2026-12-31",
    });

    renderBadge();

    expect(await screen.findByText("Планы на этот месяц закончились")).toBeInTheDocument();
  });

  it("запрашивается с токеном сессии", async () => {
    fetchQuota.mockResolvedValue({
      quota: { used: 0, limit: 20, left: 20 },
      subscriptionUntil: "2026-12-31",
    });

    renderBadge();

    await waitFor(() => {
      expect(fetchQuota).toHaveBeenCalledWith(SESSION.token);
    });
  });

  it("если сервер не ответил, число не показывается вовсе", async () => {
    fetchQuota.mockRejectedValue(new Error("сеть"));

    const { container } = renderBadge();

    await waitFor(() => {
      expect(fetchQuota).toHaveBeenCalled();
    });
    expect(container.textContent).toBe("");
  });

  it("без сессии сервер не спрашивается", async () => {
    localStorage.clear();

    renderBadge();

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(fetchQuota).not.toHaveBeenCalled();
  });
});
