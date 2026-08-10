/**
 * Точки входа админки.
 *
 * Все действия, кроме входа, требуют подписанного токена. Проверка стоит одна
 * на весь модуль — в requireAdmin: забыть её в отдельном обработчике нельзя,
 * потому что обработчики не вызываются иначе как через route ниже.
 */
import { adminLogin, verifyAdminToken } from "../../admin/auth.ts";
import type { AdminAuthConfig } from "../../admin/auth.ts";
import {
  AdminInputError,
  changeMonthlyLimit,
  changeSubscriptionUntil,
  issueLicense,
  listLicenses,
  resetSession,
  setLicenseDisabled,
} from "../../admin/licenses.ts";
import type { AdminDeps } from "../../admin/licenses.ts";
import type { AttemptStore } from "../../access/rate-limit.ts";
import { monthKey } from "../../access/quota.ts";
import { clientAddress, errorResponse, jsonResponse, readJson, tooManyAttempts } from "../respond.ts";
import type { ResponseContext } from "../respond.ts";

export interface AdminHttpDeps {
  readonly admin: AdminDeps;
  readonly attempts: AttemptStore;
  readonly config: AdminAuthConfig;
  readonly nowMs: number;
  /** Сегодняшняя дата ГГГГ-ММ-ДД: по ней считается расход за месяц. */
  readonly today: string;
}

type Action =
  | "login"
  | "licenses"
  | "issue"
  | "set-disabled"
  | "set-limit"
  | "set-subscription"
  | "reset-session";

const ACTIONS: readonly Action[] = [
  "login",
  "licenses",
  "issue",
  "set-disabled",
  "set-limit",
  "set-subscription",
  "reset-session",
];

function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

function denied(response: ResponseContext): Response {
  return jsonResponse(
    {
      error: {
        code: "ADMIN_DENIED",
        message: "Нужен вход в панель управления.",
        retryable: false,
        fields: [],
      },
    },
    401,
    response,
  );
}

function badInput(message: string, response: ResponseContext): Response {
  return jsonResponse(
    { error: { code: "INVALID_REQUEST", message, retryable: false, fields: [] } },
    400,
    response,
  );
}

function requireString(body: Record<string, unknown>, field: string): string {
  const value = body[field];
  if (typeof value !== "string" || value.length === 0) {
    throw new AdminInputError(`Не заполнено поле «${field}»`);
  }
  return value;
}

function requireNumber(body: Record<string, unknown>, field: string): number {
  const value = body[field];
  if (typeof value !== "number") {
    throw new AdminInputError(`Поле «${field}» должно быть числом`);
  }
  return value;
}

async function login(
  request: Request,
  body: Record<string, unknown>,
  deps: AdminHttpDeps,
  response: ResponseContext,
): Promise<Response> {
  const result = await adminLogin(
    {
      password: typeof body.password === "string" ? body.password : "",
      clientAddress: clientAddress(request),
      nowMs: deps.nowMs,
    },
    { attempts: deps.attempts, config: deps.config },
  );

  if (result.ok) {
    return jsonResponse({ token: result.token, expiresAtMs: result.expiresAtMs }, 200, response);
  }
  if (result.reason === "rate-limited") {
    return tooManyAttempts(result.retryAfterMs, response);
  }
  return denied(response);
}

async function runAction(
  action: Exclude<Action, "login">,
  body: Record<string, unknown>,
  deps: AdminHttpDeps,
  response: ResponseContext,
): Promise<Response> {
  switch (action) {
    case "licenses":
      return jsonResponse(
        { licenses: await listLicenses(monthKey(deps.today), deps.admin) },
        200,
        response,
      );

    case "issue": {
      const issued = await issueLicense(
        {
          subscriptionUntil: requireString(body, "subscriptionUntil"),
          monthlyLimit: requireNumber(body, "monthlyLimit"),
          note: typeof body.note === "string" ? body.note : "",
        },
        deps.admin,
      );
      // Ключ отдаётся здесь единственный раз за всю его жизнь.
      return jsonResponse(issued, 200, response);
    }

    case "set-disabled":
      await setLicenseDisabled(
        requireString(body, "licenseId"),
        body.disabled === true,
        deps.admin,
      );
      return jsonResponse({ ok: true }, 200, response);

    case "set-limit":
      await changeMonthlyLimit(
        requireString(body, "licenseId"),
        requireNumber(body, "monthlyLimit"),
        deps.admin,
      );
      return jsonResponse({ ok: true }, 200, response);

    case "set-subscription":
      await changeSubscriptionUntil(
        requireString(body, "licenseId"),
        requireString(body, "subscriptionUntil"),
        deps.admin,
      );
      return jsonResponse({ ok: true }, 200, response);

    case "reset-session":
      await resetSession(requireString(body, "licenseId"), deps.admin);
      return jsonResponse({ ok: true }, 200, response);
  }
}

export async function handleAdmin(
  request: Request,
  adminToken: string | null,
  deps: AdminHttpDeps,
  response: ResponseContext,
): Promise<Response> {
  try {
    const body = await readJson(request);
    if (!isAction(body.action)) {
      return badInput("Неизвестное действие панели управления.", response);
    }

    if (body.action === "login") {
      return await login(request, body, deps, response);
    }

    const authorized =
      adminToken !== null && (await verifyAdminToken(adminToken, deps.config, deps.nowMs));
    if (!authorized) {
      return denied(response);
    }

    return await runAction(body.action, body, deps, response);
  } catch (error) {
    if (error instanceof AdminInputError) {
      return badInput(error.message, response);
    }
    return errorResponse(error, response);
  }
}
