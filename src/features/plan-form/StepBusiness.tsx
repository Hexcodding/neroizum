/**
 * Шаг «о бизнесе». Два поля, от которых зависит всё остальное.
 *
 * Подсказки написаны примерами, а не требованиями: «расскажите о бизнесе» даёт
 * ответ «продаём мебель», а пример даёт четыре строки, из которых получается
 * план.
 */
import { INPUT_LIMITS } from "@contracts";
import { CharacterCount, Textarea } from "@/shared/ui/Input";
import { Field } from "@/shared/ui/Field";
import type { PlanDraftState } from "./usePlanDraft";

export function StepBusiness({ state }: { state: PlanDraftState }) {
  const { draft, errors, set, clearError } = state;

  return (
    <div className="flex flex-col gap-5">
      <Field
        label="Чем вы занимаетесь"
        hint="Своими словами: что продаёте, где находитесь, чем отличаетесь. Например: «Домашняя пекарня в Химках, хлеб на закваске, печём под заказ, доставка по району»."
        error={errors.niche}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            value={draft.niche}
            rows={4}
            maxLength={INPUT_LIMITS.niche}
            onChange={(event) => {
              clearError("niche");
              set("niche", event.target.value);
            }}
            placeholder="Домашняя пекарня в Химках. Хлеб на закваске, печём под заказ…"
          />
        )}
      </Field>
      <CharacterCount value={draft.niche} limit={INPUT_LIMITS.niche} />

      <Field
        label="Для кого вы пишете"
        hint="Кто эти люди и что их волнует. Например: «Семьи с детьми из соседних домов, следят за составом, некогда готовить»."
        error={errors.audience}
      >
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            value={draft.audience}
            rows={3}
            maxLength={INPUT_LIMITS.audience}
            onChange={(event) => {
              clearError("audience");
              set("audience", event.target.value);
            }}
            placeholder="Семьи с детьми из соседних домов, читают состав…"
          />
        )}
      </Field>
      <CharacterCount value={draft.audience} limit={INPUT_LIMITS.audience} />
    </div>
  );
}
