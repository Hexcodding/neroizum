/**
 * Названные вызовы сервера. Компоненты не собирают тела запросов руками:
 * иначе имя действия вроде "update-post" разъедется между экранами.
 */
import type { GeneratedPost, PeriodDays } from "@contracts";
import { callFunction, openStream } from "./client";
import type { Session } from "./session";

export interface ActivationResponse {
  readonly sessionToken: string;
  readonly clientId: string;
  readonly monthlyLimit: number;
  readonly subscriptionUntil: string;
  readonly expiresAtMs: number;
}

export async function activate(key: string): Promise<Session> {
  const result = await callFunction<ActivationResponse>("activate", { key });
  return {
    token: result.sessionToken,
    clientId: result.clientId,
    monthlyLimit: result.monthlyLimit,
    subscriptionUntil: result.subscriptionUntil,
    expiresAtMs: result.expiresAtMs,
  };
}

export async function logout(token: string): Promise<void> {
  await callFunction<{ ok: boolean }>("activate", {}, { token, path: "/logout" });
}

export interface QuotaStatus {
  readonly used: number;
  readonly limit: number;
  readonly left: number;
}

/**
 * Остаток генераций. Спрашивается у сервера, а не считается в браузере:
 * генерации расходуются и с другого устройства, а месяц заканчивается по
 * календарю сервера, а не по часовому поясу телефона.
 */
export async function fetchQuota(
  token: string,
): Promise<{ readonly quota: QuotaStatus; readonly subscriptionUntil: string }> {
  return await callFunction<{ quota: QuotaStatus; subscriptionUntil: string }>(
    "plans",
    { action: "quota" },
    { token },
  );
}

export interface PlanSummary {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly postCount: number;
  readonly firstDate: string;
  readonly lastDate: string;
}

export interface StoredPlan {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly promptVersion: string;
  readonly request: unknown;
  readonly posts: readonly GeneratedPost[];
}

export async function fetchPlans(token: string): Promise<readonly PlanSummary[]> {
  const result = await callFunction<{ plans: readonly PlanSummary[] }>(
    "plans",
    { action: "list" },
    { token },
  );
  return result.plans;
}

export async function fetchPlan(token: string, planId: string): Promise<StoredPlan> {
  const result = await callFunction<{ plan: StoredPlan }>(
    "plans",
    { action: "get", planId },
    { token },
  );
  return result.plan;
}

export async function savePostEdit(
  token: string,
  planId: string,
  post: GeneratedPost,
): Promise<void> {
  await callFunction<{ ok: boolean }>("plans", { action: "update-post", planId, post }, { token });
}

export async function deletePlan(token: string, planId: string): Promise<void> {
  await callFunction<{ ok: boolean }>("plans", { action: "delete", planId }, { token });
}

/** Генерация отвечает потоком, поэтому здесь возвращается сам поток. */
export async function openPlanStream(
  token: string,
  request: unknown,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  return await openStream("generate-plan", request, { token, signal });
}

/**
 * Продолжение плана идёт тем же потоком и той же точкой входа. Заявка не
 * отправляется: сервер берёт её из сохранённого плана, иначе номера постов и
 * дата старта считались бы от присланного, а не от того, что уже в базе.
 */
export async function openContinuationStream(
  token: string,
  planId: string,
  periodDays: PeriodDays,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  return await openStream(
    "generate-plan",
    { continuePlanId: planId, periodDays },
    { token, signal },
  );
}
