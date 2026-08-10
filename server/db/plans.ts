/**
 * Сохранение готового плана.
 *
 * План пишется вместе с версией промпта: без неё через месяц не ответить,
 * каким заданием сделан результат и стало ли лучше после правки промпта.
 *
 * Посты сохраняются одной пачкой. Если план оборвался и постов меньше
 * задуманного — сохраняются те, что есть: терять готовую работу нельзя.
 */
import type { GeneratedPost } from "../../contracts/index.ts";
import { insert, insertMany, type DbConfig } from "./rest.ts";

export interface SavePlanInput {
  readonly licenseId: string;
  readonly request: unknown;
  readonly promptVersion: string;
  readonly posts: readonly GeneratedPost[];
  /** Заголовок для списка планов. Составляется на стороне вызова. */
  readonly title: string;
}

export async function savePlan(config: DbConfig, input: SavePlanInput): Promise<string> {
  const plan = await insert<{ id: string }>(
    config,
    "content_plans",
    {
      license_id: input.licenseId,
      title: input.title.slice(0, 120),
      prompt_version: input.promptVersion,
      request: input.request,
    },
    { returning: true },
  );

  if (plan === null) {
    throw new Error("План не сохранился: база не вернула строку");
  }

  await insertMany(
    config,
    "posts",
    input.posts.map((post) => ({
      plan_id: plan.id,
      number: post.number,
      publish_date: post.date,
      platform: post.platform,
      payload: post,
    })),
  );

  return plan.id;
}
