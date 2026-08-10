// Точка входа «мои планы». Владелец проверяется условием запроса к базе, а не
// отдельной проверкой в коде — см. server/db/plans.ts.
import type { GeneratedPost } from "../../../contracts/index.ts";
import { handlePlans } from "../../../server/http/handlers/plans.ts";
import { deletePlan, listPlans, loadPlan, updatePost } from "../../../server/db/plans.ts";
import { begin, bearer, wire } from "../_shared/wire.ts";

Deno.serve(async (request: Request): Promise<Response> => {
  const context = wire();
  const { response, early } = begin(request, context.policy);
  if (early !== null) return early;

  return await handlePlans(
    request,
    bearer(request),
    {
      session: {
        licenses: context.licenses,
        attempts: context.attempts,
        pepper: context.config.pepper,
        nowMs: context.nowMs,
        today: context.today,
      },
      store: {
        list: (licenseId: string) => listPlans(context.config.db, licenseId),
        load: (licenseId: string, planId: string) =>
          loadPlan(context.config.db, licenseId, planId),
        updatePost: (licenseId: string, planId: string, post: GeneratedPost) =>
          updatePost(context.config.db, licenseId, planId, post),
        remove: (licenseId: string, planId: string) =>
          deletePlan(context.config.db, licenseId, planId),
      },
    },
    response,
  );
});
