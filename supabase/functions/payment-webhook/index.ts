// Вебхук платёжной системы. Вызывается не браузером, поэтому CORS ему не нужен,
// а вот подпись и защита от повторов — обязательны.
import { handleWebhook } from "../../../server/http/handlers/webhook.ts";
import {
  extendSubscription,
  findLicenseIdByClientId,
} from "../../../server/db/access-stores.ts";
import { wire } from "../_shared/wire.ts";

Deno.serve(async (request: Request): Promise<Response> => {
  const context = wire();
  if (request.method !== "POST") return new Response(null, { status: 405 });

  return await handleWebhook(
    request,
    {
      payments: context.payments,
      attempts: context.attempts,
      secret: context.config.webhookSecret,
      nowMs: context.nowMs,
      findLicenseIdByClientId: (clientId: string) =>
        findLicenseIdByClientId(context.config.db, clientId),
      extendSubscription: (licenseId: string, paidUntil: string) =>
        extendSubscription(context.config.db, licenseId, paidUntil),
      logEvent: (action: string, details: Record<string, unknown>) =>
        context.adminLog.record(action, "payment-system", details),
    },
    { cors: {} },
  );
});
