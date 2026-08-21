/**
 * Точка входа «сделай картинку к этому посту». Живёт внутри функции
 * generate-plan под путём /image по той же причине, что и улучшение поста:
 * отдельная функция означала бы свой CORS, свой лимит попыток и свою
 * возможность забыть проверку доступа.
 *
 * Картинки делаются по одной, по нажатию, а не ко всему плану сразу. Причин
 * две, и обе жёсткие: тридцать картинок стоят дороже самого плана в семь-десять
 * раз, и тридцать последовательных обращений к модели не уложатся в отведённое
 * функции время.
 *
 * Счётчик у картинок свой, третий. Списывать их вместе с планами нельзя: цена
 * различается на порядок.
 */
import type { GeneratedPost } from "../../../contracts/index.ts";
import { resolveSession } from "../../access/activation.ts";
import type { ActivationContext } from "../../access/activation.ts";
import { checkLimits, generationLimits, recordAttempt } from "../../access/rate-limit.ts";
import type { AttemptStore } from "../../access/rate-limit.ts";
import { createQuotaGuard, readQuotaStatus } from "../../access/quota.ts";
import type { QuotaContext } from "../../access/quota.ts";
import { GenerationError } from "../../generation/errors.ts";
import { createPostImage } from "../../generation/image.ts";
import type { ImageProvider, ImageResult } from "../../generation/provider/types.ts";
import { errorResponse, jsonResponse, readJson, tooManyAttempts } from "../respond.ts";
import type { ResponseContext } from "../respond.ts";
import type { PlanToContinue } from "./generate.ts";

export interface ImageDeps {
  readonly session: Omit<ActivationContext, "clientAddress">;
  readonly attempts: AttemptStore;
  readonly provider: ImageProvider;
  /** Счётчик картинок — не тот же, что у планов и улучшений. */
  readonly quota: Omit<QuotaContext, "licenseId" | "exceeded">;
  /** Чужой план не находится: условие владельца входит в запрос к базе. */
  loadPlan(licenseId: string, planId: string): Promise<PlanToContinue | null>;
  /**
   * Сохранить картинку и вернуть ссылку, по которой её покажет браузер.
   * `null` — план исчез, пока модель рисовала.
   */
  saveImage(
    licenseId: string,
    planId: string,
    post: GeneratedPost,
    image: ImageResult,
  ): Promise<string | null>;
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
}

function readCommand(body: Record<string, unknown>): Command {
  const planId = body.planId;
  const number = body.number;

  if (typeof planId !== "string" || planId.length === 0) {
    throw new GenerationError("INVALID_REQUEST", "не указан план");
  }
  if (typeof number !== "number" || !Number.isInteger(number)) {
    throw new GenerationError("INVALID_REQUEST", "не указан пост");
  }
  return { planId, number };
}

export async function handleImage(
  request: Request,
  sessionToken: string | null,
  deps: ImageDeps,
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
    const imageUrl = await runImage(command, session.license.id, deps);
    const images = await readQuotaStatus(
      { ...deps.quota, licenseId: session.license.id },
      session.license.imageLimit,
    );
    return jsonResponse({ imageUrl, images }, 200, response);
  } catch (error) {
    return errorResponse(error, response);
  }
}

async function runImage(command: Command, licenseId: string, deps: ImageDeps): Promise<string> {
  const plan = await deps.loadPlan(licenseId, command.planId);
  if (plan === null) {
    throw new GenerationError("PLAN_NOT_FOUND", "план не найден у этого клиента");
  }

  const post = plan.posts.find((item) => item.number === command.number);
  if (post === undefined) {
    throw new GenerationError("POST_NOT_FOUND", "поста с таким номером в плане нет");
  }

  // Порядок тот же, что у планов и улучшений: резерв до модели, подтверждение
  // после сохранения. Сбой модели не должен стоить человеку картинки — она
  // здесь самая дорогая единица расхода.
  const guard = createQuotaGuard({ ...deps.quota, licenseId, exceeded: "IMAGES_EXCEEDED" });
  await guard.reserve();

  try {
    const image = await createPostImage(post, { provider: deps.provider });
    const url = await deps.saveImage(licenseId, command.planId, post, image);
    if (url === null) {
      throw new GenerationError("PLAN_NOT_FOUND", "план исчез, пока рисовалась картинка");
    }

    await guard.commit();
    return url;
  } catch (error) {
    await guard.release();
    throw error;
  }
}
