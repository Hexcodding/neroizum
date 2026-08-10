/**
 * Шаг «цель и площадки». Цель меняет пропорции типов контента в плане, стадия
 * проекта — тон постов, площадки — длину и формат текста. Всё это объясняется
 * прямо на экране: иначе выбор делается наугад.
 */
import { Field } from "@/shared/ui/Field";
import { MultiChoice, SingleChoice } from "@/shared/ui/Choice";
import { GOAL_OPTIONS, PLATFORM_OPTIONS, ROLE_OPTIONS, STAGE_OPTIONS } from "@/entities/plan/options";
import type { PlanDraftState } from "./usePlanDraft";

export function StepGoal({ state }: { state: PlanDraftState }) {
  const { draft, errors, set, clearError } = state;

  return (
    <div className="flex flex-col gap-6">
      <Field label="Чего хотите добиться" hint="От этого зависит, каких постов в плане будет больше.">
        {() => (
          <SingleChoice
            label="Цель плана"
            options={GOAL_OPTIONS}
            value={draft.goal}
            onChange={(value) => {
              set("goal", value);
            }}
            columns={3}
          />
        )}
      </Field>

      <Field
        label="Где публикуете"
        hint="Для каждой площадки текст пишется по своим правилам: длина, формат, подача."
        error={errors.platforms}
      >
        {() => (
          <MultiChoice
            label="Площадки"
            options={PLATFORM_OPTIONS}
            values={draft.platforms}
            onChange={(values) => {
              clearError("platforms");
              // Пустой список — почти наверняка промах по кнопке: последнюю
              // площадку не снимаем, иначе форма молча становится нерабочей.
              if (values.length > 0) set("platforms", values);
            }}
          />
        )}
      </Field>

      <Field label="Сейчас у вас" hint="Начинающему каналу нужны другие посты, чем каналу с десятью тысячами.">
        {() => (
          <SingleChoice
            label="Стадия проекта"
            options={STAGE_OPTIONS}
            value={draft.channelStage}
            onChange={(value) => {
              set("channelStage", value);
            }}
            columns={3}
          />
        )}
      </Field>

      <Field label="От чьего имени говорим">
        {() => (
          <SingleChoice
            label="Роль автора"
            options={ROLE_OPTIONS}
            value={draft.authorRole}
            onChange={(value) => {
              set("authorRole", value);
            }}
            columns={3}
          />
        )}
      </Field>
    </div>
  );
}
