// Точка входа «сделать план». Ключ модели и текст промпта остаются здесь: в
// ответ уходят только посты.
import { createGeminiProvider } from "../../../server/generation/provider/gemini.ts";
import { handleGenerate } from "../../../server/http/handlers/generate.ts";
import type { PlanToContinue } from "../../../server/http/handlers/generate.ts";
import { appendPosts, loadPlan, savePlan } from "../../../server/db/plans.ts";
import { GenerationError } from "../../../server/generation/errors.ts";
import type { GenerationResult } from "../../../server/generation/orchestrate.ts";
import { begin, bearer, wire } from "../_shared/wire.ts";

/** Заголовок плана для списка: ниша и период понятнее даты создания. */
function planTitle(request: unknown): string {
  const value = request as { niche?: unknown; periodDays?: unknown };
  const niche = typeof value.niche === "string" ? value.niche : "План";
  const days = typeof value.periodDays === "number" ? value.periodDays : 0;
  return days > 0 ? `${niche} — ${String(days)} дней` : niche;
}

Deno.serve(async (request: Request): Promise<Response> => {
  const context = wire();
  const { response, early } = begin(request, context.policy);
  if (early !== null) return early;

  return await handleGenerate(request, bearer(request), {
    session: {
      licenses: context.licenses,
      attempts: context.attempts,
      pepper: context.config.pepper,
      nowMs: context.nowMs,
      today: context.today,
    },
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
    loadPlan: async (licenseId: string, planId: string): Promise<PlanToContinue | null> => {
      const plan = await loadPlan(context.config.db, licenseId, planId);
      return plan === null ? null : { request: plan.request, posts: plan.posts };
    },
    appendPosts: async (licenseId: string, planId: string, result: unknown): Promise<void> => {
      const plan = result as GenerationResult;
      const appended = await appendPosts(context.config.db, licenseId, planId, plan.posts);
      // План удалили, пока шла генерация: писать посты некуда, и молчать об
      // этом нельзя — человек ждёт, что план стал длиннее.
      if (!appended) {
        throw new GenerationError("PLAN_NOT_FOUND", "план исчез во время продолжения");
      }
    },
  }, response);
});
