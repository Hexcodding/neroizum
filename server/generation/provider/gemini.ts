/**
 * Вызов Google Gemini.
 *
 * Что здесь есть и чего не было в третьей версии:
 * — схема ответа передаётся провайдеру, а не описывается только словами;
 * — настройки безопасности заданы явно. По умолчанию модель может отклонить
 *   безобидный текст про, например, медицинские услуги или алкоголь в меню
 *   ресторана, и клиент получит пустой ответ без объяснений;
 * — таймаут: запрос не может висеть бесконечно;
 * — остановка пользователем доводится до самого сетевого запроса.
 *
 * Общее с вызовом модели картинок — адрес, пороги фильтров, перевод отказа в
 * нашу ошибку — лежит в google.ts.
 */
import { GenerationError } from "../errors.ts";
import {
  failByStatus,
  GOOGLE_API_BASE,
  SAFETY_SETTINGS,
  toProviderError,
  withTimeout,
} from "./google.ts";
import type { AiProvider, AiRequest, AiResponse } from "./types.ts";

/**
 * Работаем одной моделью. Каскад из трёх подменял причину отказа: перебор
 * заканчивался на самой старой модели, и наружу уходила её ошибка, а не та,
 * из-за которой всё началось. Исчерпанная суточная норма 2.5 Flash выглядела
 * для пользователя как «сервис не отвечает», и совет в сообщении был неверным.
 */
export const GEMINI_MODELS = ["gemini-2.5-flash"] as const;

interface GeminiCandidate {
  readonly finishReason?: string;
  readonly content?: { readonly parts?: readonly { readonly text?: string }[] };
}

interface GeminiPayload {
  readonly candidates?: readonly GeminiCandidate[];
  readonly promptFeedback?: { readonly blockReason?: string };
}

function readText(payload: GeminiPayload): string {
  const parts = payload.candidates?.[0]?.content?.parts;
  if (parts === undefined) return "";
  return parts.map((part) => part.text ?? "").join("");
}

/**
 * Бюджет размышления для моделей 2.5. Раньше здесь стоял ноль — «размышления
 * съедают бюджет вывода, а нам нужен объём ответа». Экономия вышла дороже
 * покупки: без размышления модель пишет первое, что пришло, и посты получаются
 * гладкими и пустыми. Текст — это и есть продукт, а не побочный результат.
 *
 * Значение конечное, а не «сколько хочешь»: мысли считаются в тот же бюджет
 * вывода, и без потолка модель способна израсходовать его до первого поста.
 */
const THINKING_BUDGET = 2048;

function buildBody(model: string, request: AiRequest): string {
  const generationConfig: Record<string, unknown> = {
    temperature: request.temperature,
    maxOutputTokens: request.maxOutputTokens,
    responseMimeType: "application/json",
    responseSchema: request.schema,
  };
  // Только у 2.5: у моделей 2.0 размышления нет вовсе, и настройка их ломает.
  if (model.includes("2.5")) {
    generationConfig.thinkingConfig = { thinkingBudget: THINKING_BUDGET };
  }

  return JSON.stringify({
    contents: [{ role: "user", parts: [{ text: request.prompt }] }],
    generationConfig,
    safetySettings: SAFETY_SETTINGS,
  });
}

export function createGeminiProvider(apiKey: string): AiProvider {
  return {
    name: "gemini",
    models: GEMINI_MODELS,

    async call(model: string, request: AiRequest): Promise<AiResponse> {
      const { signal, done } = withTimeout(request);

      try {
        const response = await fetch(`${GOOGLE_API_BASE}/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: buildBody(model, request),
          signal,
        });

        if (!response.ok) {
          throw failByStatus(response.status, await response.text());
        }

        const payload = (await response.json()) as GeminiPayload;
        const blockReason = payload.promptFeedback?.blockReason;
        if (blockReason !== undefined) {
          throw new GenerationError("BAD_RESPONSE", `Запрос отклонён фильтрами: ${blockReason}`);
        }

        return {
          text: readText(payload),
          truncated: payload.candidates?.[0]?.finishReason === "MAX_TOKENS",
          model,
        };
      } catch (error) {
        throw toProviderError(error, signal);
      } finally {
        done();
      }
    },
  };
}
