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
import { insert, insertMany, remove, select, selectOne, update, type DbConfig } from "./rest.ts";

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

export interface PlanSummary {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly postCount: number;
  /** Первая и последняя даты плана: по ним видно, какой период он покрывает. */
  readonly firstDate: string;
  readonly lastDate: string;
}

interface PlanRow {
  readonly id: string;
  readonly title: string;
  readonly created_at: string;
  readonly posts: { readonly publish_date: string }[];
}

/**
 * Список планов клиента. Даты и число постов берутся вложенной выборкой, чтобы
 * не делать отдельный запрос на каждый план.
 */
export async function listPlans(
  config: DbConfig,
  licenseId: string,
): Promise<readonly PlanSummary[]> {
  const rows = await select<PlanRow>(
    config,
    "content_plans",
    `license_id=eq.${licenseId}&select=id,title,created_at,posts(publish_date)&order=created_at.desc`,
  );

  return rows.map((row) => {
    const dates = row.posts.map((post) => post.publish_date).sort();
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      postCount: row.posts.length,
      firstDate: dates[0] ?? "",
      lastDate: dates.at(-1) ?? "",
    };
  });
}

export interface StoredPlan {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly promptVersion: string;
  readonly request: unknown;
  readonly posts: readonly GeneratedPost[];
}

interface FullPlanRow {
  readonly id: string;
  readonly title: string;
  readonly created_at: string;
  readonly prompt_version: string;
  readonly request: unknown;
  readonly posts: { readonly number: number; readonly payload: GeneratedPost }[];
}

/**
 * План целиком. Проверка владельца входит в условие запроса, а не делается
 * отдельно после выборки: план чужого клиента просто не найдётся.
 */
export async function loadPlan(
  config: DbConfig,
  licenseId: string,
  planId: string,
): Promise<StoredPlan | null> {
  const row = await selectOne<FullPlanRow>(
    config,
    "content_plans",
    `id=eq.${planId}&license_id=eq.${licenseId}&select=id,title,created_at,prompt_version,request,posts(number,payload)`,
  );
  if (row === null) return null;

  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    promptVersion: row.prompt_version,
    request: row.request,
    posts: [...row.posts].sort((left, right) => left.number - right.number).map((post) => post.payload),
  };
}

/** Правка поста человеком. Возвращает false, если план принадлежит другому. */
export async function updatePost(
  config: DbConfig,
  licenseId: string,
  planId: string,
  post: GeneratedPost,
): Promise<boolean> {
  const owned = await selectOne<{ id: string }>(
    config,
    "content_plans",
    `id=eq.${planId}&license_id=eq.${licenseId}&select=id`,
  );
  if (owned === null) return false;

  await update(config, "posts", `plan_id=eq.${planId}&number=eq.${String(post.number)}`, {
    payload: post,
    publish_date: post.date,
    platform: post.platform,
    updated_at: new Date().toISOString(),
  });
  return true;
}

export async function deletePlan(
  config: DbConfig,
  licenseId: string,
  planId: string,
): Promise<boolean> {
  const owned = await selectOne<{ id: string }>(
    config,
    "content_plans",
    `id=eq.${planId}&license_id=eq.${licenseId}&select=id`,
  );
  if (owned === null) return false;

  // Посты уходят вместе с планом: связь объявлена с каскадным удалением.
  await remove(config, "content_plans", `id=eq.${planId}&license_id=eq.${licenseId}`);
  return true;
}
