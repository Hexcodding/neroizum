/**
 * Вебхук оплаты: подпись и защита от повторной обработки.
 *
 * Платёжные системы штатно повторяют запрос, если не получили ответ вовремя —
 * это не сбой, а норма. В предыдущей версии защиты от повторов не было, и один
 * платёж мог продлить подписку дважды.
 *
 * Оговорка. Точная схема подписи зависит от платёжной системы: у одних это
 * HMAC от тела запроса, у других сверка суммы через отдельный запрос к их API.
 * Реализация ниже — HMAC-SHA256 от неизменённого тела. Перед подключением
 * настоящего провайдера схему нужно сверить с его документацией.
 */
import { hmacHex } from "./hmac.ts";
import { secureCompare } from "./keys.ts";
import type { PaymentStore } from "./store.ts";

export interface WebhookEvent {
  /** Идентификатор события у платёжной системы. По нему ловится повтор. */
  readonly eventId: string;
  readonly licenseId: string;
  /** До какой даты продлена подписка, ГГГГ-ММ-ДД. */
  readonly paidUntil: string;
}

export type WebhookResult =
  | { readonly status: "applied" }
  | { readonly status: "duplicate" }
  | { readonly status: "bad-signature" };

export async function verifySignature(
  rawBody: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (secret.length === 0 || signature.length === 0) return false;

  const expected = await hmacHex(rawBody, secret);
  return secureCompare(expected, signature.trim().toLowerCase());
}

export async function applyPayment(
  event: WebhookEvent,
  store: PaymentStore,
): Promise<WebhookResult> {
  if (await store.wasProcessed(event.eventId)) {
    return { status: "duplicate" };
  }

  await store.markProcessed(event.eventId, event.licenseId, event.paidUntil);
  return { status: "applied" };
}
