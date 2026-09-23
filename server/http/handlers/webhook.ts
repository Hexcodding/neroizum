/**
 * Вебхук платёжной системы.
 *
 * Три вещи, которых не было в предыдущей версии: проверка подписи до любого
 * действия, защита от повторной обработки одного платежа и работа по видимому
 * номеру клиента вместо части лицензионного ключа. Последнее важно: раньше в
 * вебхук уходил префикс ключа, то есть секрет пересекал границу нашей системы.
 *
 * Ответ всегда короткий и всегда 200 при верной подписи, даже на повтор:
 * платёжные системы считают любой другой ответ поводом повторять запрос ещё
 * долго.
 */
import { applyPayment, verifySignature } from "../../access/payments.ts";
import type { PaymentStore } from "../../access/store.ts";
import { checkLimits, LIMITS, recordAttempt } from "../../access/rate-limit.ts";
import type { AttemptStore } from "../../access/rate-limit.ts";
import { jsonResponse } from "../respond.ts";
import type { ResponseContext } from "../respond.ts";

export interface WebhookDeps {
  readonly payments: PaymentStore;
  readonly attempts: AttemptStore;
  readonly secret: string;
  readonly nowMs: number;
  /** Видимый номер клиента в идентификатор лицензии. */
  findLicenseIdByClientId(clientId: string): Promise<string | null>;
  extendSubscription(licenseId: string, paidUntil: string): Promise<void>;
  logEvent(action: string, details: Record<string, unknown>): Promise<void>;
}

const SIGNATURE_HEADER = "x-neuroizium-signature";
const LIMIT = [{ bucket: "webhook:global", ...LIMITS.webhook }];

interface Payload {
  readonly eventId: string;
  readonly clientId: string;
  readonly paidUntil: string;
}

function readPayload(raw: string): Payload | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const value = parsed as Record<string, unknown>;
    const eventId = value.eventId;
    const clientId = value.clientId;
    const paidUntil = value.paidUntil;

    const shapeOk =
      typeof eventId === "string" &&
      typeof clientId === "string" &&
      typeof paidUntil === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(paidUntil);

    return shapeOk ? { eventId, clientId, paidUntil } : null;
  } catch {
    return null;
  }
}

export async function handleWebhook(
  request: Request,
  deps: WebhookDeps,
  response: ResponseContext,
): Promise<Response> {
  const decision = await checkLimits(deps.attempts, LIMIT, deps.nowMs);
  if (!decision.allowed) {
    return jsonResponse({ status: "rate-limited" }, 429, response);
  }
  await recordAttempt(deps.attempts, LIMIT, deps.nowMs);

  // Тело читается как есть: подпись считается по неизменённой строке, любая
  // перестановка полей после разбора и обратной сборки её ломает.
  const raw = await request.text();
  const signature = request.headers.get(SIGNATURE_HEADER) ?? "";

  if (!(await verifySignature(raw, signature, deps.secret))) {
    console.error("[webhook] подпись не совпала");
    return jsonResponse({ status: "bad-signature" }, 401, response);
  }

  const payload = readPayload(raw);
  if (payload === null) {
    console.error("[webhook] тело не разобралось");
    return jsonResponse({ status: "bad-payload" }, 400, response);
  }

  const licenseId = await deps.findLicenseIdByClientId(payload.clientId);
  if (licenseId === null) {
    // Подпись верна, но клиента нет: это наша рассинхронизация, а не подделка.
    console.error(`[webhook] неизвестный номер клиента ${payload.clientId}`);
    await deps.logEvent("payment.unknown-client", { clientId: payload.clientId });
    return jsonResponse({ status: "unknown-client" }, 200, response);
  }

  const applied = await applyPayment(
    { eventId: payload.eventId, licenseId, paidUntil: payload.paidUntil },
    deps.payments,
  );

  if (applied.status === "duplicate") {
    return jsonResponse({ status: "duplicate" }, 200, response);
  }

  await deps.extendSubscription(licenseId, payload.paidUntil);
  await deps.logEvent("payment.applied", {
    licenseId,
    eventId: payload.eventId,
    paidUntil: payload.paidUntil,
  });

  return jsonResponse({ status: "applied" }, 200, response);
}
