/**
 * Точка входа «сделать план».
 *
 * Порядок проверок здесь и есть безопасность этой точки: сначала кто перед нами
 * (по токену сессии, а не по тому, что клиент сообщил о себе), потом лимит
 * частоты, только потом квота и модель. Промпт при этом не покидает сервер: в
 * ответ уходят посты, но не текст задания для модели.
 *
 * Ответ отдаётся потоком. Пользователь видит посты по мере готовности, а не
 * пустой экран на минуту, и может остановить генерацию, закрыв соединение.
 */
import { resolveSession } from "../../access/activation.ts";
import type { ActivationContext } from "../../access/activation.ts";
import { checkLimits, generationLimits, recordAttempt } from "../../access/rate-limit.ts";
import type { AttemptStore } from "../../access/rate-limit.ts";
import { createQuotaGuard } from "../../access/quota.ts";
import type { QuotaContext } from "../../access/quota.ts";
import { generatePlan } from "../../generation/orchestrate.ts";
import type { OrchestrateOptions } from "../../generation/orchestrate.ts";
import { toGenerationError } from "../../generation/errors.ts";
import { errorResponse, jsonResponse, readJson, tooManyAttempts } from "../respond.ts";
import type { ResponseContext } from "../respond.ts";
import { createEventStream, streamHeaders } from "../stream.ts";

export interface GenerateDeps {
  readonly session: Omit<ActivationContext, "clientAddress">;
  readonly attempts: AttemptStore;
  readonly cascade: OrchestrateOptions["cascade"];
  /** Хранилище квоты и сегодняшняя дата: месяц считается по календарю. */
  readonly quota: Omit<QuotaContext, "licenseId">;
  /** Куда сохранить готовый план. Возвращает его идентификатор. */
  savePlan(licenseId: string, request: unknown, result: unknown): Promise<string>;
}

const NO_SESSION = {
  code: "NO_SESSION",
  message: "Сессия закончилась. Введите ключ доступа ещё раз — сохранённые планы на месте.",
  retryable: false,
  fields: [],
} as const;

export async function handleGenerate(
  request: Request,
  sessionToken: string | null,
  deps: GenerateDeps,
  response: ResponseContext,
): Promise<Response> {
  const session = await resolveSession(sessionToken, deps.session);
  if (!session.ok) {
    return jsonResponse({ error: NO_SESSION }, 401, response);
  }

  const limits = generationLimits(session.license.id);
  const decision = await checkLimits(deps.attempts, limits, deps.session.nowMs);
  if (!decision.allowed) {
    return tooManyAttempts(decision.retryAfterMs, response);
  }

  let body: Record<string, unknown>;
  try {
    body = await readJson(request);
    await recordAttempt(deps.attempts, limits, deps.session.nowMs);
  } catch (error) {
    return errorResponse(error, response);
  }

  const { body: stream, handle } = createEventStream();
  const abort = new AbortController();
  // Закрытая вкладка обязана останавливать работу: иначе мы платим за посты,
  // которые никто не получит.
  request.signal.addEventListener("abort", () => {
    abort.abort();
  });

  void runGeneration(body, session.license.id, deps, { handle, signal: abort.signal });

  return new Response(stream, { status: 200, headers: streamHeaders(response.cors) });
}

interface RunSink {
  readonly handle: ReturnType<typeof createEventStream>["handle"];
  readonly signal: AbortSignal;
}

async function runGeneration(
  body: Record<string, unknown>,
  licenseId: string,
  deps: GenerateDeps,
  sink: RunSink,
): Promise<void> {
  try {
    const result = await generatePlan(body, {
      cascade: deps.cascade,
      signal: sink.signal,
      quota: createQuotaGuard({ ...deps.quota, licenseId }),
      onProgress: (event) => {
        sink.handle.send({
          type: "progress",
          readyPosts: event.readyPosts,
          totalPosts: event.totalPosts,
        });
        sink.handle.send({ type: "posts", posts: event.posts });
      },
    });

    const planId = await deps.savePlan(licenseId, body, result);
    sink.handle.send({ type: "done", result: { ...result, planId } });
  } catch (error) {
    const failure = toGenerationError(error);
    console.error(`[${failure.code}] ${failure.message}`);
    sink.handle.send({
      type: "error",
      error: {
        code: failure.code,
        message: failure.userMessage,
        retryable: failure.retryable,
        fields: failure.fields,
      },
    });
  } finally {
    sink.handle.close();
  }
}
