/**
 * Граница с AI-провайдером. Всё, что выше — оркестрация, разбор, проверка
 * качества — работает через этот интерфейс и не знает, чей это API.
 *
 * Так каскад «не ответила основная модель, идём к запасной» пишется один раз,
 * а тесты обходятся поддельным провайдером без единого сетевого запроса.
 */
import type { SchemaNode } from "../../prompt/core/output-contract";

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
