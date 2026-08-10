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
 */
import { GenerationError } from "../errors.ts";
import type { AiProvider, AiRequest, AiResponse } from "./types.ts";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

/** Порядок каскада: сначала быстрая и дешёвая, потом умнее и дороже. */
export const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-pro"] as const;

const SAFETY_CATEGORIES = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
] as const;

/**
 * Блокируем только явно опасное. Планы контента для малого бизнеса регулярно
 * задевают темы, которые срабатывают на средних порогах: медицина, юридические
 * услуги, бары. Ложная блокировка выглядит для клиента как поломка продукта.
 */
const SAFETY_SETTINGS = SAFETY_CATEGORIES.map((category) => ({
  category,
  threshold: "BLOCK_ONLY_HIGH",
}));

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

function failByStatus(status: number, body: string): GenerationError {
  if (status === 429) {
    return new GenerationError("RATE_LIMITED", `Gemini 429: ${body.slice(0, 300)}`);
  }
  if (status === 400 && body.includes("API_KEY_INVALID")) {
    // Ключ настраиваем мы, а не клиент: для него это наша внутренняя поломка.
    return new GenerationError("INTERNAL", "Ключ Gemini недействителен");
  }
  if (status >= 500 || status === 408) {
    return new GenerationError("PROVIDER_UNAVAILABLE", `Gemini ${String(status)}`);
  }
  return new GenerationError("PROVIDER_UNAVAILABLE", `Gemini ${String(status)}: ${body.slice(0, 300)}`);
}

/** Таймаут и остановка пользователем — один сигнал для fetch. */
function withTimeout(request: AiRequest): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new GenerationError("TIMEOUT", "Провайдер не ответил за отведённое время"));
  }, request.timeoutMs);

  const onExternalAbort = () => {
    controller.abort(new GenerationError("STOPPED_BY_USER", "Генерация остановлена"));
  };
  request.signal?.addEventListener("abort", onExternalAbort, { once: true });

  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onExternalAbort);
    },
  };
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
        const response = await fetch(`${API_BASE}/${model}:generateContent`, {
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
        // Причина прерывания — уже готовая ошибка: таймаут или остановка.
        if (signal.aborted && signal.reason instanceof GenerationError) {
          throw signal.reason;
        }
        if (error instanceof GenerationError) throw error;
        throw new GenerationError("PROVIDER_UNAVAILABLE", `Сеть недоступна: ${String(error)}`);
      } finally {
        done();
      }
    },
  };
}
