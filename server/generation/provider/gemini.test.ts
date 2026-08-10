/**
 * Настройки вызова модели. Проверяются механически, потому что забыть их
 * последствия невозможно увидеть в интерфейсе: план сгенерируется, ошибки не
 * будет, просто текст станет скучным. Такая поломка живёт месяцами.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { PLAN_RESPONSE_SCHEMA } from "../../prompt/core/output-contract.ts";
import { createGeminiProvider, GEMINI_MODELS } from "./gemini.ts";
import type { AiRequest } from "./types.ts";

interface SentConfig {
  readonly generationConfig: {
    readonly temperature: number;
    readonly maxOutputTokens: number;
    readonly thinkingConfig?: { readonly thinkingBudget: number };
  };
}

const REQUEST: AiRequest = {
  prompt: "1 | 2026-03-02 (понедельник) | telegram",
  schema: PLAN_RESPONSE_SCHEMA,
  temperature: 0.85,
  maxOutputTokens: 16_384,
  timeoutMs: 5000,
};

/** Возвращает тело запроса, ушедшее провайдеру для указанной модели. */
async function sentBody(model: string): Promise<SentConfig> {
  const fetchMock = vi.fn(
    (): Promise<Response> =>
      Promise.resolve(
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "[]" }] } }] })),
      ),
  );
  vi.stubGlobal("fetch", fetchMock);

  await createGeminiProvider("ключ").call(model, REQUEST);

  const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return JSON.parse(init.body as string) as SentConfig;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("настройки вызова Gemini", () => {
  it("у модели 2.5 размышление включено и ограничено", async () => {
    const body = await sentBody("gemini-2.5-flash");

    expect(body.generationConfig.thinkingConfig?.thinkingBudget).toBeGreaterThan(0);
  });

  it("модели без размышления настройку не получают: она их ломает", async () => {
    const body = await sentBody("gemini-2.0-flash");

    expect(body.generationConfig.thinkingConfig).toBeUndefined();
  });

  it("бюджет вывода оставляет место и мыслям, и постам", async () => {
    const body = await sentBody(GEMINI_MODELS[0]);

    const { maxOutputTokens, thinkingConfig } = body.generationConfig;
    expect(maxOutputTokens - (thinkingConfig?.thinkingBudget ?? 0)).toBeGreaterThan(8000);
  });
});
