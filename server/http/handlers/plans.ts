/**
 * Точка входа «мои планы»: список, открыть, правка поста, удаление.
 *
 * Владелец плана проверяется не отдельным условием в коде, а условием запроса
 * к базе: план чужого клиента просто не находится. Так нельзя случайно забыть
 * проверку в одной из четырёх операций — а забыть её в коде очень легко.
 */
import { validateEditedPost, type GeneratedPost } from "../../../contracts/index.ts";
import { resolveSession } from "../../access/activation.ts";
import type { ActivationContext } from "../../access/activation.ts";
import { readQuotaStatus } from "../../access/quota.ts";
import type { QuotaContext } from "../../access/quota.ts";
import type { LicenseRecord } from "../../access/store.ts";
import { GenerationError } from "../../generation/errors.ts";
import { errorPayload, errorResponse, jsonResponse, readJson } from "../respond.ts";
import type { ResponseContext } from "../respond.ts";

export interface PlanStore {
  list(licenseId: string): Promise<readonly unknown[]>;
  load(licenseId: string, planId: string): Promise<unknown | null>;
  updatePost(licenseId: string, planId: string, post: GeneratedPost): Promise<boolean>;
  remove(licenseId: string, planId: string): Promise<boolean>;
}

export interface PlansDeps {
  readonly session: Omit<ActivationContext, "clientAddress">;
  readonly store: PlanStore;
  /**
   * Остаток генераций отдаётся этой же точкой входа, а не отдельной функцией.
   * Причина: это два числа для того же клиента с тем же токеном. Отдельная
   * функция означала бы ещё одну публичную точку входа со своим лимитом
   * попыток, своим CORS и своим шансом ошибиться в проверке доступа.
   */
  readonly quota: Omit<QuotaContext, "licenseId">;
  /** Остаток улучшений постов: считается отдельно от планов, показывается вместе. */
  readonly improvements: Omit<QuotaContext, "licenseId">;
  /** Остаток картинок: третий счётчик, тем же ответом. */
  readonly images: Omit<QuotaContext, "licenseId">;
}

const ACTIONS = ["list", "get", "update-post", "delete", "quota"] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

// Текст берётся из общего справочника ошибок: тот же отказ приходит и при
// попытке продлить чужой план, и звучать он обязан одинаково.
const NOT_FOUND = errorPayload(new GenerationError("PLAN_NOT_FOUND", "план не найден"));

function planId(body: Record<string, unknown>): string {
  const value = body.planId;
  if (typeof value !== "string" || value.length === 0) {
    throw new GenerationError("INVALID_REQUEST", "не указан план");
  }
  return value;
}

export async function handlePlans(
  request: Request,
  sessionToken: string | null,
  deps: PlansDeps,
  response: ResponseContext,
): Promise<Response> {
  const session = await resolveSession(sessionToken, deps.session);
  if (!session.ok) {
    return jsonResponse(
      {
        error: {
          code: "NO_SESSION",
          message: "Сессия закончилась. Введите ключ доступа ещё раз — планы на месте.",
          retryable: false,
          fields: [],
        },
      },
      401,
      response,
    );
  }

  try {
    const body = await readJson(request);
    if (!isAction(body.action)) {
      throw new GenerationError("INVALID_REQUEST", "неизвестное действие");
    }
    return await runAction(body.action, body, session.license, deps, response);
  } catch (error) {
    return errorResponse(error, response);
  }
}

async function runAction(
  action: Action,
  body: Record<string, unknown>,
  license: LicenseRecord,
  deps: PlansDeps,
  response: ResponseContext,
): Promise<Response> {
  const licenseId = license.id;

  switch (action) {
    case "list":
      return jsonResponse({ plans: await deps.store.list(licenseId) }, 200, response);

    case "quota": {
      const quota = await readQuotaStatus({ ...deps.quota, licenseId }, license.monthlyLimit);
      const improvements = await readQuotaStatus(
        { ...deps.improvements, licenseId },
        license.improvementLimit,
      );
      const images = await readQuotaStatus({ ...deps.images, licenseId }, license.imageLimit);
      return jsonResponse(
        { quota, improvements, images, subscriptionUntil: license.subscriptionUntil },
        200,
        response,
      );
    }

    case "get": {
      const plan = await deps.store.load(licenseId, planId(body));
      if (plan === null) return jsonResponse(NOT_FOUND, 404, response);
      return jsonResponse({ plan }, 200, response);
    }

    case "update-post": {
      const validation = validateEditedPost(body.post);
      if (!validation.ok) {
        throw new GenerationError("INVALID_REQUEST", "правка не прошла проверку", validation.errors);
      }
      const updated = await deps.store.updatePost(
        licenseId,
        planId(body),
        body.post as GeneratedPost,
      );
      if (!updated) return jsonResponse(NOT_FOUND, 404, response);
      return jsonResponse({ ok: true }, 200, response);
    }

    case "delete": {
      const removed = await deps.store.remove(licenseId, planId(body));
      if (!removed) return jsonResponse(NOT_FOUND, 404, response);
      return jsonResponse({ ok: true }, 200, response);
    }
  }
}
