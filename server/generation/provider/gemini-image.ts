/**
 * Вызов модели картинок Google.
 *
 * Модель выбрана самая дешёвая в семействе: 1K стоит примерно три с половиной
 * цента против семи у обычной и тринадцати у Pro. Тридцать картинок к плану —
 * это доллар против четырёх, а весь текст плана стоит десять-пятнадцать
 * центов; на этой границе цена продукта и держится.
 *
 * Пакетный режим Google вдвое дешевле, но он асинхронный: человек нажал кнопку
 * и ждёт картинку сейчас, а не «когда-нибудь». Поэтому обычный режим.
 */
import { GenerationError } from "../errors.ts";
import {
  failByStatus,
  GOOGLE_API_BASE,
  SAFETY_SETTINGS,
  toProviderError,
  withTimeout,
} from "./google.ts";
import type { ImageProvider, ImageRequest, ImageResult } from "./types.ts";

/**
 * Nano Banana 2 Lite. Единственное разрешение — 1K, и для ленты его достаточно:
 * 2K и 4K нужны печати, а не посту в Telegram.
 */
export const GEMINI_IMAGE_MODEL = "gemini-3.1-flash-lite-image";

/** Что модель понимает. Всё остальное подменяется квадратом, а не отказом. */
const ASPECT_RATIOS = new Set([
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
]);

const FALLBACK_ASPECT_RATIO = "1:1";

interface InlineData {
  readonly mimeType?: string;
  readonly data?: string;
}

interface ImagePayload {
  readonly candidates?: readonly {
    readonly finishReason?: string;
    readonly content?: { readonly parts?: readonly { readonly inlineData?: InlineData }[] };
  }[];
  readonly promptFeedback?: { readonly blockReason?: string };
}

function readImage(payload: ImagePayload): InlineData | null {
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data !== undefined) return part.inlineData;
  }
  return null;
}

/** Base64 в байты. Своя реализация не нужна: atob есть и в Deno, и в браузере. */
function decodeBase64(data: string): Uint8Array {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function buildBody(request: ImageRequest): string {
  const aspectRatio = ASPECT_RATIOS.has(request.aspectRatio)
    ? request.aspectRatio
    : FALLBACK_ASPECT_RATIO;

  return JSON.stringify({
    contents: [{ role: "user", parts: [{ text: request.prompt }] }],
    generationConfig: {
      // Только картинка: с добавленным TEXT модель начинает пояснять словами и,
      // по наблюдениям разработчиков Google, игнорировать заданный размер.
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio, imageSize: "1K" },
    },
    safetySettings: SAFETY_SETTINGS,
  });
}

export function createGeminiImageProvider(apiKey: string): ImageProvider {
  return {
    model: GEMINI_IMAGE_MODEL,

    async create(request: ImageRequest): Promise<ImageResult> {
      const { signal, done } = withTimeout(request);

      try {
        const response = await fetch(
          `${GOOGLE_API_BASE}/${GEMINI_IMAGE_MODEL}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: buildBody(request),
            signal,
          },
        );

        if (!response.ok) {
          throw failByStatus(response.status, await response.text());
        }

        const payload = (await response.json()) as ImagePayload;
        const blockReason = payload.promptFeedback?.blockReason;
        if (blockReason !== undefined) {
          throw new GenerationError("BAD_RESPONSE", `Картинка отклонена фильтрами: ${blockReason}`);
        }

        const image = readImage(payload);
        if (image?.data === undefined) {
          throw new GenerationError("BAD_RESPONSE", "Модель вернула ответ без картинки");
        }

        return {
          bytes: decodeBase64(image.data),
          mimeType: image.mimeType ?? "image/png",
          model: GEMINI_IMAGE_MODEL,
        };
      } catch (error) {
        throw toProviderError(error, signal);
      } finally {
        done();
      }
    },
  };
}
