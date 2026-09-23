/**
 * Работа с черновиком заявки: правка полей, сохранение, проверка перед отправкой.
 *
 * Проверка берётся из общего словаря — той же функцией, которой проверяет
 * сервер. Двух наборов правил быть не должно: разъехавшись, они дают худший
 * вариант — форма разрешает, а сервер отказывает.
 */
import { useCallback, useMemo, useState } from "react";
import { validateGenerationRequest } from "@contracts";
import { emptyDraft, readDraft, saveDraft, toGenerationRequest, type PlanDraft } from "./draft";

export interface PlanDraftState {
  readonly draft: PlanDraft;
  readonly errors: Record<string, string>;
  set<K extends keyof PlanDraft>(field: K, value: PlanDraft[K]): void;
  setBrand<K extends keyof PlanDraft["brand"]>(field: K, value: PlanDraft["brand"][K]): void;
  /** Сбрасывает заявку, но оставляет профиль бренда: он заполняется один раз. */
  reset(): void;
  /**
   * Проверяет черновик. Ошибки возвращаются, а не только записываются в
   * состояние: решение «пускать ли на следующий шаг» принимается сразу, а
   * состояние обновится позже.
   */
  validate(): ValidationOutcome;
  clearError(field: string): void;
}

export interface ValidationOutcome {
  readonly request: ReturnType<typeof toGenerationRequest> | null;
  readonly errors: Record<string, string>;
}

export function usePlanDraft(): PlanDraftState {
  const [draft, setDraft] = useState<PlanDraft>(() => readDraft());
  const [errors, setErrors] = useState<Record<string, string>>({});

  const store = useCallback((next: PlanDraft): void => {
    setDraft(next);
    saveDraft(next);
  }, []);

  const set = useCallback(
    <K extends keyof PlanDraft>(field: K, value: PlanDraft[K]): void => {
      store({ ...draft, [field]: value });
    },
    [draft, store],
  );

  const setBrand = useCallback(
    <K extends keyof PlanDraft["brand"]>(field: K, value: PlanDraft["brand"][K]): void => {
      store({ ...draft, brand: { ...draft.brand, [field]: value } });
    },
    [draft, store],
  );

  const clearError = useCallback((field: string): void => {
    setErrors((current) => {
      if (!(field in current)) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }, []);

  const validate = useCallback((): ValidationOutcome => {
    const request = toGenerationRequest(draft);
    const result = validateGenerationRequest(request);

    if (result.ok) {
      setErrors({});
      return { request, errors: {} };
    }

    const byField: Record<string, string> = {};
    for (const error of result.errors) {
      byField[error.field] = error.message;
    }
    setErrors(byField);
    return { request: null, errors: byField };
  }, [draft]);

  const reset = useCallback((): void => {
    store({ ...emptyDraft(), brand: draft.brand });
    setErrors({});
  }, [store, draft.brand]);

  return useMemo(
    () => ({ draft, errors, set, setBrand, reset, validate, clearError }),
    [draft, errors, set, setBrand, reset, validate, clearError],
  );
}
