// Точка входа «сделать план». Ключ модели и текст промпта остаются здесь: в
// ответ уходят только посты.
//
// Той же функцией живут переделка одного поста (/improve) и картинка к посту
// (/image): каждая новая публичная точка входа — это свой CORS, свой лимит
// попыток и своя возможность забыть проверку доступа.
import type { GeneratedPost } from "../../../contracts/index.ts";
import { createGeminiProvider } from "../../../server/generation/provider/gemini.ts";
import { createGeminiImageProvider } from "../../../server/generation/provider/gemini-image.ts";
import type { ImageResult } from "../../../server/generation/provider/types.ts";
import { handleGenerate } from "../../../server/http/handlers/generate.ts";
import type { GenerateDeps, PlanToContinue } from "../../../server/http/handlers/generate.ts";
import { handleImprove } from "../../../server/http/handlers/improve.ts";
import type { ImproveDeps } from "../../../server/http/handlers/improve.ts";
import { handleImage } from "../../../server/http/handlers/image.ts";
import type { ImageDeps } from "../../../server/http/handlers/image.ts";
import { appendPosts, loadPlan, savePlan, updatePost, setPostImage } from "../../../server/db/plans.ts";
import { imagePath, signImageUrls, uploadImage } from "../../../server/db/storage.ts";
import { GenerationError } from "../../../server/generation/errors.ts";
import type { GenerationResult } from "../../../server/generation/orchestrate.ts";
import { begin, bearer, wire } from "../_shared/wire.ts";
import type { Wiring } from "../_shared/wire.ts";

/** Заголовок плана для списка: ниша и период понятнее даты создания. */
function planTitle(request: unknown): string {
  const value = request as { niche?: unknown; periodDays?: unknown };
  const niche = typeof value.niche === "string" ? value.niche : "План";
  const days = typeof value.periodDays === "number" ? value.periodDays : 0;
  return days > 0 ? `${niche} — ${String(days)} дней` : niche;
}

/** Кто перед нами. Одинаково для всех трёх путей этой функции. */
function sessionOf(context: Wiring): GenerateDeps["session"] {
  return {
    licenses: context.licenses,
    attempts: context.attempts,
    pepper: context.config.pepper,
    nowMs: context.nowMs,
    today: context.today,
  };
}

function planForClient(context: Wiring) {
  return async (licenseId: string, planId: string): Promise<PlanToContinue | null> => {
    const plan = await loadPlan(context.config.db, licenseId, planId);
    return plan === null ? null : { request: plan.request, posts: plan.posts };
  };
}

function generateDeps(context: Wiring): GenerateDeps {
  return {
    session: sessionOf(context),
    attempts: context.attempts,
    cascade: { provider: createGeminiProvider(context.config.geminiApiKey) },
    quota: { store: context.quotaStore, today: context.today },
    savePlan: async (licenseId: string, planRequest: unknown, result: unknown): Promise<string> => {
      const plan = result as GenerationResult;
      return await savePlan(context.config.db, {
        licenseId,
        request: planRequest,
        promptVersion: plan.promptVersion,
        posts: plan.posts,
        title: planTitle(planRequest),
      });
    },
    loadPlan: planForClient(context),
    appendPosts: async (licenseId: string, planId: string, result: unknown): Promise<void> => {
      const plan = result as GenerationResult;
      const appended = await appendPosts(context.config.db, licenseId, planId, plan.posts);
      // План удалили, пока шла генерация: писать посты некуда, и молчать об
      // этом нельзя — человек ждёт, что план стал длиннее.
      if (!appended) {
        throw new GenerationError("PLAN_NOT_FOUND", "план исчез во время продолжения");
      }
    },
  };
}

function improveDeps(context: Wiring): ImproveDeps {
  return {
    session: sessionOf(context),
    attempts: context.attempts,
    cascade: { provider: createGeminiProvider(context.config.geminiApiKey) },
    quota: { store: context.improvementStore, today: context.today },
    loadPlan: planForClient(context),
    savePost: async (licenseId: string, planId: string, post: GeneratedPost): Promise<boolean> =>
      await updatePost(context.config.db, licenseId, planId, post),
  };
}

function imageDeps(context: Wiring): ImageDeps {
  return {
    session: sessionOf(context),
    attempts: context.attempts,
    provider: createGeminiImageProvider(context.config.geminiApiKey),
    quota: { store: context.imageStore, today: context.today },
    loadPlan: planForClient(context),
    saveImage: async (
      licenseId: string,
      planId: string,
      post: GeneratedPost,
      image: ImageResult,
    ): Promise<string | null> => {
      const path = imagePath(licenseId, planId, post.number);
      await uploadImage(context.config.db, path, image.bytes, image.mimeType);

      const saved = await setPostImage(context.config.db, licenseId, planId, post.number, path);
      if (!saved) return null;

      // Бакет закрытый, поэтому наружу уходит подписанная ссылка на час, а не
      // постоянный адрес: картинки неопубликованного плана не должны лежать в
      // интернете по угадываемому пути.
      const signed = await signImageUrls(context.config.db, [path]);
      const url = signed[path];
      if (url === undefined) {
        throw new GenerationError("INTERNAL", "хранилище не подписало ссылку на картинку");
      }
      return url;
    },
  };
}

/** Свои пути той же функции: переделка поста и картинка к нему. */
const IMPROVE_PATH = "/improve";
const IMAGE_PATH = "/image";

Deno.serve(async (request: Request): Promise<Response> => {
  const context = wire();
  const { response, early } = begin(request, context.policy);
  if (early !== null) return early;

  const path = new URL(request.url).pathname;
  const token = bearer(request);

  if (path.endsWith(IMPROVE_PATH)) {
    return await handleImprove(request, token, improveDeps(context), response);
  }
  if (path.endsWith(IMAGE_PATH)) {
    return await handleImage(request, token, imageDeps(context), response);
  }
  return await handleGenerate(request, token, generateDeps(context), response);
});
