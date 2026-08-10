/**
 * Одна лицензия: состояние и четыре действия над ней.
 *
 * Карточки, а не таблица: строк немного, а действий у каждой четыре — в таблице
 * они не помещаются на телефоне, а панелью управления приходится пользоваться и
 * с телефона, когда клиент просит доступ вечером.
 */
import { useState } from "react";
import type { LicenseSummary } from "@/shared/api/admin";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Input } from "@/shared/ui/Input";
import { cn } from "@/shared/lib/cn";

export interface LicenseCardProps {
  readonly license: LicenseSummary;
  readonly busy: boolean;
  readonly onSetDisabled: (disabled: boolean) => void;
  readonly onSetLimit: (limit: number) => void;
  readonly onSetSubscription: (until: string) => void;
  readonly onResetSession: () => void;
}

export function LicenseCard(props: LicenseCardProps) {
  const { license, busy } = props;
  const [editing, setEditing] = useState(false);
  const [until, setUntil] = useState(license.subscriptionUntil);
  const [limit, setLimit] = useState(String(license.monthlyLimit));

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-sm font-semibold">{license.clientId}</span>
        <span
          className={cn(
            "rounded-md px-2 py-0.5 text-xs",
            license.disabled ? "bg-destructive/15 text-foreground" : "bg-secondary text-muted",
          )}
        >
          {license.disabled ? "Отключён" : "Работает"}
        </span>
        {license.note.length > 0 && (
          <span className="text-xs text-muted">{license.note}</span>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted sm:grid-cols-3">
        <div>
          <dt className="inline">Подписка до </dt>
          <dd className="inline text-foreground">{license.subscriptionUntil}</dd>
        </div>
        <div>
          <dt className="inline">В этом месяце </dt>
          <dd className="inline text-foreground">
            {license.usedThisMonth} из {license.monthlyLimit}
          </dd>
        </div>
        <div>
          <dt className="inline">Выдан </dt>
          <dd className="inline text-foreground">{license.createdAt.slice(0, 10)}</dd>
        </div>
      </dl>

      {editing ? (
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
              Новый лимит планов
              <Input
                type="number"
                min={1}
                max={500}
                value={limit}
                onChange={(event) => {
                  setLimit(event.target.value);
                }}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                if (until !== license.subscriptionUntil) props.onSetSubscription(until);
                if (Number(limit) !== license.monthlyLimit) props.onSetLimit(Number(limit));
                setEditing(false);
              }}
            >
              Сохранить
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setUntil(license.subscriptionUntil);
                setLimit(String(license.monthlyLimit));
                setEditing(false);
              }}
            >
              Отмена
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              setEditing(true);
            }}
          >
            Изменить срок и лимит
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={props.onResetSession}
            title="Клиент сможет войти на другом устройстве"
          >
            Сбросить вход
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              // Отключение обрывает активную сессию, поэтому спрашиваем: клиент
              // потеряет доступ в этот же момент, а не когда-нибудь потом.
              const message = license.disabled
                ? "Включить доступ обратно?"
                : "Отключить доступ? Клиент сразу перестанет работать, планы останутся.";
              if (window.confirm(message)) props.onSetDisabled(!license.disabled);
            }}
          >
            {license.disabled ? "Включить" : "Отключить"}
          </Button>
        </div>
      )}
    </Card>
  );
}
