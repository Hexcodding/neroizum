/**
 * Ошибка от сервера в том виде, в котором её можно показать человеку.
 *
 * Сервер присылает готовый текст «что случилось и что делать» — интерфейс его
 * не переписывает и не дополняет. Здесь только разбор конверта и один запасной
 * текст на случай, когда до сервера вообще не дошло: сеть, оборванный ответ,
 * закрытый ноутбук.
 */

export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly fields: readonly FieldError[];

  constructor(code: string, message: string, retryable: boolean, fields: readonly FieldError[]) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.retryable = retryable;
    this.fields = fields;
  }
}

const OFFLINE = new ApiError(
  "NETWORK",
  "Не получилось связаться с сервером. Проверьте интернет и попробуйте снова — введённые данные сохранены.",
  true,
  [],
);

/** Ошибки полей, разложенные по именам: форме так удобнее подсвечивать. */
export function fieldMessages(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};

  const result: Record<string, string> = {};
  for (const field of error.fields) {
    result[field.field] = field.message;
  }
  return result;
}

interface ErrorEnvelope {
  readonly error?: {
    readonly code?: unknown;
    readonly message?: unknown;
    readonly retryable?: unknown;
    readonly fields?: unknown;
  };
}

/** Разбор конверта ошибки. Всё, что не разобралось, становится сетевой ошибкой. */
export function toApiError(payload: unknown): ApiError {
  if (payload instanceof ApiError) return payload;
  if (typeof payload !== "object" || payload === null) return OFFLINE;

  const envelope = payload as ErrorEnvelope;
  const error = envelope.error;
  if (error === undefined || typeof error.message !== "string") return OFFLINE;

  return new ApiError(
    typeof error.code === "string" ? error.code : "INTERNAL",
    error.message,
    error.retryable === true,
    Array.isArray(error.fields) ? (error.fields as FieldError[]) : [],
  );
}

export const networkError = (): ApiError => OFFLINE;
