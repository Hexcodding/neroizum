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

export interface QuotaResponse {
  readonly quota: QuotaStatus;
  /** Улучшения постов считаются отдельно от планов: обращение к модели дешевле. */
  readonly improvements: QuotaStatus;
  /** Картинки — третий счётчик: одна картинка дороже всего плана текстом. */
  readonly images: QuotaStatus;
  readonly subscriptionUntil: string;
}

/**
 * Остаток генераций. Спрашивается у сервера, а не считается в браузере:
 * генерации расходуются и с другого устройства, а месяц заканчивается по
 * календарю сервера, а не по часовому поясу телефона.
 */
export async function fetchQuota(token: string): Promise<QuotaResponse> {
  return await callFunction<QuotaResponse>("plans", { action: "quota" }, { token });
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
  /**
   * Готовые картинки: номер поста → ссылка. Ссылки подписаны на час, поэтому
   * сохранять их дольше открытой страницы бессмысленно.
   */
  readonly imageUrls?: Readonly<Record<number, string>>;
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

export interface ImprovedPost {
  readonly post: GeneratedPost;
  /** Остаток улучшений после этого: считать его в браузере нельзя. */
  readonly improvements: QuotaStatus;
}

/**
 * Переделать один пост по просьбе человека. Отвечает обычным JSON, а не
 * потоком: один пост собирается за одно обращение к модели, показывать по
 * частям нечего. Сервер сохраняет результат сам — прежний текст остаётся
 * только в браузере, поэтому вернуть его можно, пока открыт редактор.
 */
export async function improvePost(
  token: string,
  planId: string,
  number: number,
  instruction: string,
): Promise<ImprovedPost> {
  return await callFunction<ImprovedPost>(
    "generate-plan",
    { planId, number, instruction },
    { token, path: "/improve" },
  );
}

export interface GeneratedImage {
  readonly imageUrl: string;
  /** Остаток картинок после этой: считать его в браузере нельзя. */
  readonly images: QuotaStatus;
}

/**
 * Нарисовать картинку к одному посту. По кнопке и по одной: тридцать картинок
 * к плану стоят дороже самого плана в разы, а половина из них не нужна.
 *
 * Промпт для картинки сервер берёт из самого поста, поэтому здесь только адрес
 * поста в плане.
 */
export async function generatePostImage(
  token: string,
  planId: string,
  number: number,
): Promise<GeneratedImage> {
  return await callFunction<GeneratedImage>(
    "generate-plan",
    { planId, number },
    { token, path: "/image" },
  );
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
