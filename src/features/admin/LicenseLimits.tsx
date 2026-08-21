/**
 * Правка срока и лимитов одной лицензии.
 *
 * Отправляется только то, что действительно изменили: каждое действие пишется
 * в журнал, и три записи «лимит изменён на прежний» вместо одной осмысленной
 * делают журнал бесполезным ровно тогда, когда он нужен.
 */
import { useState } from "react";
import type { LicenseSummary } from "@/shared/api/admin";
import { Button } from "@/shared/ui/Button";
import { Input } from "@/shared/ui/Input";

export interface LicenseLimitsProps {
  readonly license: LicenseSummary;
  readonly busy: boolean;
  readonly onSetLimit: (limit: number) => void;
  readonly onSetImprovementLimit: (limit: number) => void;
  readonly onSetImageLimit: (limit: number) => void;
  readonly onSetSubscription: (until: string) => void;
  readonly onClose: () => void;
}

export function LicenseLimits({
  license,
  busy,
  onSetLimit,
  onSetImprovementLimit,
  onSetImageLimit,
  onSetSubscription,
  onClose,
}: LicenseLimitsProps) {
  const [until, setUntil] = useState(license.subscriptionUntil);
  const [plans, setPlans] = useState(String(license.monthlyLimit));
  const [improvements, setImprovements] = useState(String(license.improvementLimit));
  const [pictures, setPictures] = useState(String(license.imageLimit));

  const apply = (): void => {
    if (until !== license.subscriptionUntil) onSetSubscription(until);
    if (Number(plans) !== license.monthlyLimit) onSetLimit(Number(plans));
    if (Number(improvements) !== license.improvementLimit) {
      onSetImprovementLimit(Number(improvements));
    }
    if (Number(pictures) !== license.imageLimit) onSetImageLimit(Number(pictures));
    onClose();
  };

  return (
    <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted">
          Продлить до
          <Input
            type="date"
            value={until}
            onChange={(event) => {
              setUntil(event.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Планов в месяц
          <Input
            type="number"
            min={1}
            max={500}
            value={plans}
            onChange={(event) => {
              setPlans(event.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Улучшений постов в месяц
          <Input
            type="number"
            min={1}
            max={500}
            value={improvements}
            onChange={(event) => {
              setImprovements(event.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          Картинок в месяц
          <Input
            type="number"
            min={1}
            max={500}
            value={pictures}
            onChange={(event) => {
              setPictures(event.target.value);
            }}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={apply}>
          Сохранить
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Отмена
        </Button>
      </div>
    </div>
  );
}
