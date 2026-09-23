/**
 * Граница с AI-провайдером. Всё, что выше — оркестрация, разбор, проверка
 * качества — работает через этот интерфейс и не знает, чей это API.
 *
 * Так каскад «не ответила основная модель, идём к запасной» пишется один раз,
 * а тесты обходятся поддельным провайдером без единого сетевого запроса.
 */
import type { SchemaNode } from "../../prompt/core/output-contract.ts";

export interface AiRequest {
  readonly prompt: string;
  /** Схема ответа: требование к структуре, а не просьба в тексте. */
  readonly schema: SchemaNode;
  readonly maxOutputTokens: number;
  readonly temperature: number;
  readonly timeoutMs: number;
  /** Остановка пользователем. */
  readonly signal?: AbortSignal;
}

export interface AiResponse {
  readonly text: string;
  /** Ответ оборвался по лимиту длины: нужен повтор в компактном режиме. */
  readonly truncated: boolean;
  readonly model: string;
}

export interface AiProvider {
  readonly name: string;
  /** Модели по убыванию предпочтения. */
  readonly models: readonly string[];
  call(model: string, request: AiRequest): Promise<AiResponse>;
}

export interface ImageRequest {
  /** Промпт на английском: его пишет модель текста в поле imagePrompt. */
  readonly prompt: string;
  /** Пропорции кадра под площадку, например 16:9. */
  readonly aspectRatio: string;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

export interface ImageResult {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly model: string;
}

/**
 * Картинки живут отдельным интерфейсом, а не ещё одним методом текстового
 * провайдера: у них нет ни схемы ответа, ни температуры, ни повторов каскадом,
 * зато есть пропорции кадра и байты вместо строки.
 */
export interface ImageProvider {
  readonly model: string;
  create(request: ImageRequest): Promise<ImageResult>;
}
