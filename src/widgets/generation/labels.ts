/**
 * Подписи экрана работы. Вынесены из компонента: продолжение плана — та же
 * работа, но человеку про неё нельзя писать «План готов». План у него был и до
 * нажатия кнопки, и такое сообщение выглядит как потеря прежних постов.
 */
export interface GenerationLabels {
  readonly running: string;
  readonly finished: string;
  readonly openPlan: string;
  /** Куда вернуться, если работа так и не началась. */
  readonly back: string;
}

export const NEW_PLAN_LABELS: GenerationLabels = {
  running: "Собираем план",
  finished: "План готов",
  openPlan: "Открыть и править",
  back: "Вернуться к заявке",
};

export const CONTINUED_PLAN_LABELS: GenerationLabels = {
  running: "Продлеваем план",
  finished: "План продлён",
  openPlan: "Вернуться к плану",
  back: "Вернуться к плану",
};
