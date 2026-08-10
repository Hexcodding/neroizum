/**
 * Шаг «расписание». Здесь же юридический режим: он меняет формулировки во всех
 * постах, и решение о нём принимает владелец бизнеса, а не мы за него.
 */
import { formatHumanDate, parseIsoDate, postCount, todayIso } from "@contracts";
import { Field } from "@/shared/ui/Field";
import { Input } from "@/shared/ui/Input";
import { SingleChoice } from "@/shared/ui/Choice";
import { FREQUENCY_OPTIONS, PERIOD_OPTIONS, toPeriodDays, toPostsPerWeek } from "@/entities/plan/options";
import type { PlanDraftState } from "./usePlanDraft";

export function StepSchedule({ state }: { state: PlanDraftState }) {
  const { draft, errors, set } = state;
  const total = postCount(draft.periodDays, draft.postsPerWeek);

  return (
    <div className="flex flex-col gap-6">
      <Field label="На какой срок">
        {() => (
          <SingleChoice
            label="Период плана"
            options={PERIOD_OPTIONS}
            value={String(draft.periodDays)}
            onChange={(value) => {
              set("periodDays", toPeriodDays(value));
            }}
            columns={3}
          />
        )}
      </Field>

      <Field label="Как часто готовы публиковать" hint="Лучше меньше, но регулярно: невыполненный план хуже короткого.">
        {() => (
          <SingleChoice
            label="Частота публикаций"
            options={FREQUENCY_OPTIONS}
            value={String(draft.postsPerWeek)}
            onChange={(value) => {
              set("postsPerWeek", toPostsPerWeek(value));
            }}
            columns={2}
          />
        )}
      </Field>

      <Field label="Начинаем с" error={errors.startDate}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="date"
            aria-describedby={describedBy}
            invalid={invalid}
            value={draft.startDate}
            min={todayIso()}
            onChange={(event) => {
              set("startDate", event.target.value);
            }}
            className="max-w-[220px]"
          />
        )}
      </Field>

      <p className="rounded-lg border border-border/60 bg-secondary/30 p-3 text-sm">
        Получится <span className="font-semibold">{total} постов</span>
        {/* Дату можно очистить прямо в поле — тогда о ней просто молчим. */}
        {parseIsoDate(draft.startDate) !== null && <> — с {formatHumanDate(draft.startDate)}</>}.
      </p>

      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/70 p-3">
        <input
          type="checkbox"
          checked={draft.infoPlanMode}
          onChange={(event) => {
            set("infoPlanMode", event.target.checked);
          }}
          className="mt-0.5 h-5 w-5 rounded border-border accent-primary"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">Информационный режим</span>
          <span className="text-xs leading-relaxed text-muted">
            Посты пишутся как рассказ о деятельности, без рекламных призывов и обещаний результата.
            Нужен там, где реклама ограничена законом: медицина, финансы, образование.
          </span>
        </span>
      </label>
    </div>
  );
}
