/**
 * Точка входа «переделай этот пост». Живёт внутри функции generate-plan под
 * путём /improve: отдельная функция означала бы свой CORS, свой лимит попыток
 * и свою возможность забыть проверку доступа.
 *
 * Поток здесь не нужен: один пост собирается за одно обращение к модели, и
 * показывать по частям нечего. Ответ — обычный JSON с готовым постом.
 *
 * Счётчик у улучшений свой. План стоит четыре-пять обращений к модели,
 * улучшение — одно; если списывать за них одинаково, кнопкой не пользуются.
 */
import { INPUT_LIMITS, type GeneratedPost } from "../../../contracts/index.ts";
import { resolveSession } from "../../access/activation.ts";
import type { ActivationContext } from "../../access/activation.ts";
import { checkLimits, generationLimits, recordAttempt } from "../../access/rate-limit.ts";
import type { AttemptStore } from "../../access/rate-limit.ts";
import { createQuotaGuard, readQuotaStatus } from "../../access/quota.ts";
import type { QuotaContext } from "../../access/quota.ts";
import { GenerationError } from "../../generation/errors.ts";
import { improvePost } from "../../generation/improve.ts";
import type { CascadeOptions } from "../../generation/provider/cascade.ts";
import { errorResponse, jsonResponse, readJson, tooManyAttempts } from "../respond.ts";
import type { ResponseContext } from "../respond.ts";
import type { PlanToContinue } from "./generate.ts";

export interface ImproveDeps {
  readonly session: Omit<ActivationContext, "clientAddress">;
  readonly attempts: AttemptStore;
  readonly cascade: CascadeOptions;
  /** Счётчик улучшений — не тот же, что у планов. */
  readonly quota: Omit<QuotaContext, "licenseId" | "exceeded">;
  /** Чужой план не находится: условие владельца входит в запрос к базе. */
  loadPlan(licenseId: string, planId: string): Promise<PlanToContinue | null>;
  /** Тот же путь записи, что и у правки руками: второго способа не заводим. */
  savePost(licenseId: string, planId: string, post: GeneratedPost): Promise<boolean>;
}

const NO_SESSION = {
  code: "NO_SESSION",
  message: "Сессия закончилась. Введите ключ доступа ещё раз — сохранённые планы на месте.",
  retryable: false,
  fields: [],
} as const;

interface Command {
  readonly planId: string;
  readonly number: number;
  readonly instruction: string;
}

function readCommand(body: Record<string, unknown>): Command {
  const planId = body.planId;
  const number = body.number;
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";

  if (typeof planId !== "string" || planId.length === 0) {
    throw new GenerationError("INVALID_REQUEST", "не указан план");
  }
  if (typeof number !== "number" || !Number.isInteger(number)) {
    throw new GenerationError("INVALID_REQUEST", "не указан пост");
  }
  if (instruction.length === 0) {
    throw new GenerationError("INVALID_REQUEST", "не сказано, что менять в посте", [
      { field: "instruction", message: "Напишите, что поправить в посте" },
    ]);
  }

  // Длинную просьбу не отклоняем, а укорачиваем: человек написал абзац вместо
  // фразы — это не ошибка ввода, и терять из-за неё готовый текст незачем.
  return { planId, number, instruction: instruction.slice(0, INPUT_LIMITS.instruction) };
}

export async function handleImprove(
  request: Request,
  sessionToken: string | null,
  deps: ImproveDeps,
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

  try {
    const command = readCommand(await readJson(request));
    await recordAttempt(deps.attempts, limits, deps.session.nowMs);
    const post = await runImprove(command, session.license.id, deps);
    const quota = await readQuotaStatus(
      { ...deps.quota, licenseId: session.license.id },
      session.license.improvementLimit,
    );
    return jsonResponse({ post, improvements: quota }, 200, response);
  } catch (error) {
    return errorResponse(error, response);
  }
}

async function runImprove(
  command: Command,
  licenseId: string,
  deps: ImproveDeps,
): Promise<GeneratedPost> {
  const plan = await deps.loadPlan(licenseId, command.planId);
  if (plan === null) {
    throw new GenerationError("PLAN_NOT_FOUND", "план не найден у этого клиента");
  }

  const current = plan.posts.find((post) => post.number === command.number);
  if (current === undefined) {
    throw new GenerationError("POST_NOT_FOUND", "поста с таким номером в плане нет");
  }

  // Порядок тот же, что у генерации плана: резерв до модели, подтверждение
  // после сохранения. Сбой модели не должен стоить человеку улучшения.
  const guard = createQuotaGuard({ ...deps.quota, licenseId, exceeded: "IMPROVEMENTS_EXCEEDED" });
  await guard.reserve();

  try {
    const improved = await improvePost(
      { request: plan.request, post: current, instruction: command.instruction },
      { cascade: deps.cascade },
    );

    const saved = await deps.savePost(licenseId, command.planId, improved);
    if (!saved) {
      throw new GenerationError("PLAN_NOT_FOUND", "план исчез во время улучшения");
    }

    await guard.commit();
    return improved;
  } catch (error) {
    await guard.release();
    throw error;
  }
}
