// Точка входа «мои планы». Владелец проверяется условием запроса к базе, а не
// отдельной проверкой в коде — см. server/db/plans.ts.
import type { GeneratedPost } from "../../../contracts/index.ts";
import { handlePlans } from "../../../server/http/handlers/plans.ts";
import { deletePlan, listPlans, loadPlan, updatePost } from "../../../server/db/plans.ts";
import { signImageUrls } from "../../../server/db/storage.ts";
import type { DbConfig } from "../../../server/db/rest.ts";
import { begin, bearer, wire } from "../_shared/wire.ts";

/**
 * План с готовыми ссылками на картинки. В базе лежат пути в закрытом бакете,
 * поэтому ссылки подписываются на время просмотра — и все сразу, одним
 * запросом: план на тридцать постов иначе открывался бы тридцатью обращениями
 * к хранилищу.
 */
async function planWithImages(
  db: DbConfig,
  licenseId: string,
  planId: string,
): Promise<unknown | null> {
  const plan = await loadPlan(db, licenseId, planId);
  if (plan === null) return null;

  const paths = Object.values(plan.imagePaths);
  const signed = await signImageUrls(db, paths);

  const imageUrls: Record<number, string> = {};
  for (const [number, path] of Object.entries(plan.imagePaths)) {
    const url = signed[path];
    if (url !== undefined) imageUrls[Number(number)] = url;
  }

  // Пути наружу не уходят: клиенту нужна ссылка, а не устройство хранилища.
  return {
    id: plan.id,
    title: plan.title,
    createdAt: plan.createdAt,
    promptVersion: plan.promptVersion,
    request: plan.request,
    posts: plan.posts,
    imageUrls,
  };
}

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
          planWithImages(context.config.db, licenseId, planId),
        updatePost: (licenseId: string, planId: string, post: GeneratedPost) =>
          updatePost(context.config.db, licenseId, planId, post),
        remove: (licenseId: string, planId: string) =>
          deletePlan(context.config.db, licenseId, planId),
      },
      quota: { store: context.quotaStore, today: context.today },
      improvements: { store: context.improvementStore, today: context.today },
      images: { store: context.imageStore, today: context.today },
    },
    response,
  );
});
