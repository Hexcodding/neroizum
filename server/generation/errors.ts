/**
 * Ошибки генерации: техническая причина отдельно, текст для человека отдельно.
 *
 * В третьей версии наружу уходили строки вида MAX_TOKENS, RATE_LIMIT_EXCEEDED
 * и «Edge Function returned a non-2xx status code». Пользователь по такому
 * сообщению не понимает ни что случилось, ни что делать, и идёт в поддержку.
 *
 * Каждое сообщение здесь отвечает на два вопроса: что произошло и какое
 * следующее действие. Технические подробности остаются в логах сервера.
 */

export type GenerationErrorCode =
  | "INVALID_REQUEST"
  | "PROVIDER_UNAVAILABLE"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "BAD_RESPONSE"
  | "STOPPED_BY_USER"
  | "QUOTA_EXCEEDED"
  | "INTERNAL";

interface ErrorPresentation {
  readonly userMessage: string;
  /** Есть ли смысл предлагать повтор кнопкой. */
  readonly retryable: boolean;
  readonly httpStatus: number;
}

const PRESENTATION: Readonly<Record<GenerationErrorCode, ErrorPresentation>> = {
  INVALID_REQUEST: {
    userMessage: "Не хватает данных для плана. Проверьте подсвеченные поля и попробуйте снова.",
    retryable: false,
    httpStatus: 400,
  },
  PROVIDER_UNAVAILABLE: {
    userMessage:
      "Сервис генерации сейчас не отвечает. Мы уже знаем об этом. Попробуйте через несколько минут — данные из формы сохранены.",
    retryable: true,
    httpStatus: 503,
  },
  RATE_LIMITED: {
    userMessage:
      "Сейчас слишком много запросов подряд. Подождите минуту и нажмите «Сгенерировать» ещё раз — попытка не потрачена.",
    retryable: true,
    httpStatus: 429,
  },
  TIMEOUT: {
    userMessage:
      "План собирался слишком долго и мы прервали ожидание. Попробуйте период поменьше: например, 7 дней вместо 30.",
    retryable: true,
    httpStatus: 504,
  },
  BAD_RESPONSE: {
    userMessage:
      "Ответ получился испорченным, публиковать такое нельзя. Нажмите «Сгенерировать» ещё раз — попытка не потрачена.",
    retryable: true,
    httpStatus: 502,
  },
  STOPPED_BY_USER: {
    userMessage: "Генерация остановлена. Посты, которые успели получиться, сохранены.",
    retryable: true,
    httpStatus: 200,
  },
  QUOTA_EXCEEDED: {
    userMessage:
      "На этот месяц генерации закончились. Лимит обновится в начале следующего месяца — или напишите нам, чтобы увеличить его.",
    retryable: false,
    httpStatus: 403,
  },
  INTERNAL: {
    userMessage:
      "Что-то сломалось на нашей стороне. Мы уже разбираемся. Попробуйте повторить через несколько минут.",
    retryable: true,
    httpStatus: 500,
  },
};

export class GenerationError extends Error {
  readonly code: GenerationErrorCode;
  /** Что показать пользователю. */
  readonly userMessage: string;
  readonly retryable: boolean;
  readonly httpStatus: number;
  /** Ошибки полей, если запрос не прошёл проверку. */
  readonly fields: readonly { field: string; message: string }[];

  constructor(
    code: GenerationErrorCode,
    technicalMessage: string,
    fields: readonly { field: string; message: string }[] = [],
  ) {
    super(technicalMessage);
    this.name = "GenerationError";
    this.code = code;
    const presentation = PRESENTATION[code];
    this.userMessage = presentation.userMessage;
    this.retryable = presentation.retryable;
    this.httpStatus = presentation.httpStatus;
    this.fields = fields;
  }
}

export function isGenerationError(value: unknown): value is GenerationError {
  return value instanceof GenerationError;
}

/**
 * Любая неожиданная ошибка превращается в понятную. Наружу не должно уходить
 * ничего, чего мы не сформулировали сами.
 */
export function toGenerationError(value: unknown): GenerationError {
  if (isGenerationError(value)) return value;
  const message = value instanceof Error ? value.message : String(value);
  return new GenerationError("INTERNAL", message);
}
