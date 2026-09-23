/**
 * Первый запуск и вход в заявку.
 *
 * Проверяется то, ради чего вступление существует: человек, открывший продукт
 * впервые, видит объяснение, а вернувшийся — сразу форму. И отдельно — что
 * исчерпанный лимит виден до заполнения, а не после.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchQuota = vi.fn();

vi.mock("@/shared/api/endpoints", () => ({
  activate: vi.fn(),
  logout: vi.fn(),
  fetchQuota: (token: string) => fetchQuota(token) as unknown,
  openPlanStream: vi.fn(),
  openContinuationStream: vi.fn(),
}));

const { AccessProvider } = await import("@/features/access/AccessProvider");
const CreatePlanPage = (await import("./CreatePlanPage")).default;

const SESSION = {
  token: "t".repeat(64),
  clientId: "ID-ABCDEF",
  monthlyLimit: 20,
  subscriptionUntil: "2026-12-31",
  expiresAtMs: Date.now() + 600_000,
};

/** Ждём ответа про остаток: он приходит сам и иначе догоняет уже готовые проверки. */
async function renderPage(): Promise<void> {
  render(
    <MemoryRouter>
      <AccessProvider>
        <CreatePlanPage />
      </AccessProvider>
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(fetchQuota).toHaveBeenCalled();
  });
}

describe("экран создания плана", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("neuroizium.session", JSON.stringify(SESSION));
    fetchQuota.mockReset();
    fetchQuota.mockResolvedValue({
      quota: { used: 0, limit: 20, left: 20 },
      subscriptionUntil: "2026-12-31",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("при первом запуске объясняет, что произойдёт", async () => {
    await renderPage();

    expect(screen.getByText("Контент-план на месяц — за одну заявку")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Составить первый план" })).toBeInTheDocument();
    // Формы ещё нет: сначала объяснение, потом вопросы.
    expect(screen.queryByLabelText(/Чем вы занимаетесь/)).not.toBeInTheDocument();
  });

  it("после нажатия открывается заявка", async () => {
    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Составить первый план" }));

    expect(screen.getByLabelText(/Чем вы занимаетесь/)).toBeInTheDocument();
  });

  it("вернувшийся человек вступления больше не видит", async () => {
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Составить первый план" }));
    cleanup();

    await renderPage();

    expect(screen.queryByText("Контент-план на месяц — за одну заявку")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Чем вы занимаетесь/)).toBeInTheDocument();
  });

  it("исчерпанный лимит виден до заполнения, и форма заблокирована", async () => {
    localStorage.setItem("neuroizium.intro-seen", "yes");
    fetchQuota.mockResolvedValue({
      quota: { used: 20, limit: 20, left: 0 },
      subscriptionUntil: "2026-12-31",
    });

    await renderPage();

    expect(await screen.findByText("Планы на этот месяц закончились")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Дальше" })).toBeDisabled();
  });
});
