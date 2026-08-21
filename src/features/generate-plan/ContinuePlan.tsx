/**
 * Продлить готовый план ещё на один период.
 *
 * По умолчанию две недели: месяц вдвое-втрое дороже и собирается заметно
 * дольше, а неделя заканчивается раньше, чем по плану становится видно
 * результат.
 */
import { useState } from "react";
import { formatHumanDate, type PeriodDays } from "@contracts";
import { toPeriodDays } from "@/entities/plan/options";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { SingleChoice } from "@/shared/ui/Choice";

const OPTIONS = [
  { id: "7", label: "+7 дней" },
  { id: "14", label: "+14 дней" },
  { id: "30", label: "+30 дней" },
];

const DEFAULT_PERIOD = "14";

export interface ContinuePlanProps {
  /** Дата последнего поста: с неё видно, с какого дня пойдёт продолжение. */
  readonly lastDate: string;
  readonly busy: boolean;
  readonly onContinue: (periodDays: PeriodDays) => void;
}

export function ContinuePlan({ lastDate, busy, onContinue }: ContinuePlanProps) {
  const [period, setPeriod] = useState(DEFAULT_PERIOD);
  const days = toPeriodDays(period);

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Продолжить план</h2>
        <p className="section-hint">
          Новые посты допишутся в этот же план, следом за {formatHumanDate(lastDate)}. Темы, о
          которых вы уже написали, не повторятся. Тратится одна генерация из месячного лимита.
        </p>
      </div>

      <SingleChoice
        label="На сколько продлить план"
        options={OPTIONS}
        value={period}
        onChange={setPeriod}
        columns={3}
      />

      <Button
        className="self-start"
        disabled={busy}
        onClick={() => {
          onContinue(days);
        }}
      >
        Продолжить · +{String(days)} дней
      </Button>
    </Card>
  );
}
