/**
 * Шаг «ваш голос» — профиль бренда.
 *
 * Единственный необязательный шаг, и это сказано прямо: заставлять заполнять
 * шесть полей до первого результата — верный способ потерять человека. Но
 * заполнить его стоит один раз, потому что дальше он применяется ко всем планам
 * автоматически — именно это отличает продукт от переписки с ChatGPT.
 */
import { INPUT_LIMITS } from "@contracts";
import { Field } from "@/shared/ui/Field";
import { Textarea } from "@/shared/ui/Input";
import type { PlanDraftState } from "./usePlanDraft";

/** Список вводится строками: так проще, чем добавлять по одному в интерфейсе. */
function toList(value: string, limit: number): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, limit);
}

export function StepBrand({ state }: { state: PlanDraftState }) {
  const { draft, setBrand } = state;

  return (
    <div className="flex flex-col gap-5">
      <p className="rounded-lg border border-border/60 bg-secondary/30 p-3 text-sm leading-relaxed text-muted">
        Можно пропустить и вернуться позже — план получится и без этого. Но если заполнить один раз,
        все следующие планы будут написаны вашим голосом, а не «как у всех».
      </p>

      <Field
        label="Как вы звучите"
        optional
        hint="Например: «просто, без пафоса, с юмором, обращаемся на ты»."
      >
        {({ id }) => (
          <Textarea
            id={id}
            rows={2}
            value={draft.brand.tone}
            maxLength={INPUT_LIMITS.tone}
            onChange={(event) => {
              setBrand("tone", event.target.value);
            }}
          />
        )}
      </Field>

      <Field
        label="Что вы продаёте"
        optional
        hint="Перечислите продукты и цены. Того, чего здесь нет, в постах не появится — модель не станет придумывать акции за вас."
      >
        {({ id }) => (
          <Textarea
            id={id}
            rows={3}
            value={draft.brand.products}
            maxLength={INPUT_LIMITS.products}
            onChange={(event) => {
              setBrand("products", event.target.value);
            }}
          />
        )}
      </Field>

      <Field
        label="Чем докажете"
        optional
        hint="Опыт, цифры, отзывы, кейсы. Это попадёт в посты как основание, а не как хвастовство."
      >
        {({ id }) => (
          <Textarea
            id={id}
            rows={3}
            value={draft.brand.proof}
            maxLength={INPUT_LIMITS.proof}
            onChange={(event) => {
              setBrand("proof", event.target.value);
            }}
          />
        )}
      </Field>

      <Field
        label="Слова, которых быть не должно"
        optional
        hint="Через запятую. Например: «уникальный, инновационный, лучший в мире»."
      >
        {({ id }) => (
          <Textarea
            id={id}
            rows={2}
            value={draft.brand.stopWords.join(", ")}
            onChange={(event) => {
              setBrand("stopWords", toList(event.target.value, INPUT_LIMITS.stopWordsCount));
            }}
          />
        )}
      </Field>

      <Field
        label="Образец вашего текста"
        optional
        hint="Один-два ваших поста целиком. Копируется ритм и манера, а не темы."
      >
        {({ id }) => (
          <Textarea
            id={id}
            rows={5}
            value={draft.brand.styleSamples.join("\n\n")}
            onChange={(event) => {
              // Образцы разделяются пустой строкой: внутри одного поста
              // переводы строк осмысленны и терять их нельзя.
              setBrand(
                "styleSamples",
                event.target.value
                  .split(/\n{2,}/)
                  .map((sample) => sample.trim())
                  .filter((sample) => sample.length > 0)
                  .slice(0, INPUT_LIMITS.styleSamplesCount),
              );
            }}
          />
        )}
      </Field>
    </div>
  );
}
