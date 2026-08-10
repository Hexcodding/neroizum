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
import { GenerationError } from "../../generation/errors.ts";
import { errorResponse, jsonResponse, readJson } from "../respond.ts";
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
}

const ACTIONS = ["list", "get", "update-post", "delete"] as const;
type Action = (typeof ACTIONS)[number];

function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

const NOT_FOUND = {
  code: "PLAN_NOT_FOUND",
  message: "Такого плана нет. Возможно, он удалён — откройте список планов заново.",
  retryable: false,
  fields: [],
} as const;

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

  const licenseId = session.license.id;

  try {
    const body = await readJson(request);
    if (!isAction(body.action)) {
      throw new GenerationError("INVALID_REQUEST", "неизвестное действие");
    }

    switch (body.action) {
      case "list":
        return jsonResponse({ plans: await deps.store.list(licenseId) }, 200, response);

      case "get": {
        const plan = await deps.store.load(licenseId, planId(body));
        if (plan === null) return jsonResponse({ error: NOT_FOUND }, 404, response);
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
        if (!updated) return jsonResponse({ error: NOT_FOUND }, 404, response);
        return jsonResponse({ ok: true }, 200, response);
      }

      case "delete": {
        const removed = await deps.store.remove(licenseId, planId(body));
        if (!removed) return jsonResponse({ error: NOT_FOUND }, 404, response);
        return jsonResponse({ ok: true }, 200, response);
      }
    }
  } catch (error) {
    return errorResponse(error, response);
  }
}
