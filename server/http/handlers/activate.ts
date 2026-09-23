/**
 * Точка входа «войти по ключу».
 *
 * Наружу уходит ровно один вид отказа для неизвестного и отключённого ключа:
 * по ответу нельзя понять, существует ключ или нет. Отдельный ответ есть только
 * у истёкшей подписки — его можно получить, лишь предъявив верный ключ.
 */
import { activateLicense } from "../../access/activation.ts";
import type { ActivationContext } from "../../access/activation.ts";
import { hashSecret } from "../../access/keys.ts";
import { GenerationError } from "../../generation/errors.ts";
import { clientAddress, errorResponse, jsonResponse, readJson, tooManyAttempts } from "../respond.ts";
import type { ResponseContext } from "../respond.ts";

export interface ActivateDeps {
  readonly context: Omit<ActivationContext, "clientAddress">;
}

const DENIED_MESSAGE =
  "Ключ не подошёл. Проверьте, что он введён целиком и без лишних символов, или напишите нам.";

export async function handleActivate(
  request: Request,
  deps: ActivateDeps,
  response: ResponseContext,
): Promise<Response> {
  try {
    const body = await readJson(request);
    const key = typeof body.key === "string" ? body.key : "";

    const result = await activateLicense(key, {
      ...deps.context,
      clientAddress: clientAddress(request),
    });

    if (result.ok) {
      return jsonResponse(
        {
          sessionToken: result.sessionToken,
          clientId: result.clientId,
          monthlyLimit: result.monthlyLimit,
          subscriptionUntil: result.subscriptionUntil,
          expiresAtMs: result.expiresAtMs,
        },
        200,
        response,
      );
    }

    if (result.reason === "too-many-attempts") {
      return tooManyAttempts(result.retryAfterMs, response);
    }

    if (result.reason === "subscription-ended") {
      return jsonResponse(
        {
          error: {
            code: "SUBSCRIPTION_ENDED",
            message: `Подписка закончилась ${result.endedOn}. Продлите её, и доступ вернётся вместе с сохранёнными планами.`,
            retryable: false,
            fields: [],
          },
        },
        402,
        response,
      );
    }

    return jsonResponse(
      { error: { code: "DENIED", message: DENIED_MESSAGE, retryable: false, fields: [] } },
      401,
      response,
    );
  } catch (error) {
    return errorResponse(error, response);
  }
}

/** Выход: сессия удаляется сразу, а не ждёт истечения срока. */
export async function handleLogout(
  sessionToken: string | null,
  deps: ActivateDeps,
  response: ResponseContext,
): Promise<Response> {
  try {
    if (sessionToken === null) {
      throw new GenerationError("INVALID_REQUEST", "выход без токена сессии");
    }
    await deps.context.licenses.deleteSession(await hashSecret(sessionToken, deps.context.pepper));
    return jsonResponse({ ok: true }, 200, response);
  } catch (error) {
    return errorResponse(error, response);
  }
}
