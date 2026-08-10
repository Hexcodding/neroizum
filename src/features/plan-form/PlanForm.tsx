/**
 * Форма заявки: четыре шага вместо одной длинной анкеты.
 *
 * Причина не в красоте. Анкета из двенадцати полей выглядит как работа, и её
 * закрывают. Четыре шага по два-три вопроса выглядят как разговор, и на каждом
 * видно, сколько осталось.
 *
 * Проверка происходит при переходе к следующему шагу, а не только на отправке:
 * узнать об ошибке в первом поле на последнем шаге — обидно.
 */
import { useState } from "react";
import type { GenerationRequest } from "@contracts";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Notice } from "@/shared/ui/Feedback";
import { cn } from "@/shared/lib/cn";
import { usePlanDraft } from "./usePlanDraft";
import { StepBusiness } from "./StepBusiness";
import { StepGoal } from "./StepGoal";
import { StepSchedule } from "./StepSchedule";
import { StepBrand } from "./StepBrand";

const STEPS = [
  { title: "О бизнесе", fields: ["niche", "audience"] },
  { title: "Цель", fields: ["platforms", "goal"] },
  { title: "Расписание", fields: ["startDate", "periodDays"] },
  { title: "Ваш голос", fields: [] },
] as const;

export interface PlanFormProps {
  readonly onSubmit: (request: GenerationRequest) => void;
  readonly busy: boolean;
}

export function PlanForm({ onSubmit, busy }: PlanFormProps) {
  const state = usePlanDraft();
  const [step, setStep] = useState(0);

  const current = STEPS[step];
  const last = step === STEPS.length - 1;
  const filled = state.draft.niche.length > 0 || state.draft.audience.length > 0;

  /** Ошибки текущего шага. Чужие не показываем: они относятся к другим экранам. */
  const stepFields = (current?.fields ?? []) as readonly string[];
  const stepErrors = Object.keys(state.errors).filter((field) => stepFields.includes(field));

  const goNext = (): void => {
    const { request, errors } = state.validate();

    if (last) {
      if (request !== null) onSubmit(request);
      return;
    }

    // Проверка общая, поэтому на первом шаге она находит и ошибки последних.
    // Двигаться дальше мешают только ошибки текущего шага.
    const blocked = Object.keys(errors).some((field) => stepFields.includes(field));
    if (!blocked) setStep(step + 1);
  };

  return (
    <div className="flex flex-col gap-5">
      <ol className="flex items-center gap-2" aria-label="Шаги заявки">
        {STEPS.map((item, index) => (
          <li key={item.title} className="flex flex-1 flex-col gap-1.5">
            <span
              className={cn(
                "h-1 rounded-full transition-colors",
                index <= step ? "bg-primary" : "bg-secondary",
              )}
            />
            <span
              className={cn(
                "text-xs",
                index === step ? "font-semibold text-foreground" : "text-muted",
              )}
            >
              {item.title}
            </span>
          </li>
        ))}
      </ol>

      <Card className="p-5">
        {step === 0 && <StepBusiness state={state} />}
        {step === 1 && <StepGoal state={state} />}
        {step === 2 && <StepSchedule state={state} />}
        {step === 3 && <StepBrand state={state} />}
      </Card>

      {stepErrors.length > 0 && (
        <Notice tone="error" title="Не хватает данных">
          Поправьте подсвеченные поля — без них план получится общим и бесполезным.
        </Notice>
      )}

      <div className="flex items-center justify-between gap-3">
        {step === 0 ? (
          // На первом шаге кнопке «Назад» некуда вести, зато нужен выход из
          // сохранённого черновика: заявка от прошлого плана здесь уже подставлена.
          <Button
            variant="ghost"
            onClick={() => {
              state.reset();
            }}
            disabled={busy || !filled}
          >
            Начать заново
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={() => {
              setStep(step - 1);
            }}
            disabled={busy}
          >
            Назад
          </Button>
        )}

        <Button size="lg" onClick={goNext} disabled={busy}>
          {last ? "Создать план" : "Дальше"}
        </Button>
      </div>
    </div>
  );
}
