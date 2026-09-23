/**
 * Выдача нового ключа.
 *
 * Ключ показывается один раз и больше не восстанавливается — ни клиенту, ни нам.
 * Поэтому экран не просто выводит строку, а настойчиво предлагает её скопировать
 * и не исчезает сам: закрыть карточку с ключом можно только вручную.
 */
import { useState } from "react";
import { addDays, todayIso } from "@contracts";
import { adminIssue } from "@/shared/api/admin";
import type { IssuedLicense } from "@/shared/api/admin";
import { toApiError } from "@/shared/api/errors";
import type { ApiError } from "@/shared/api/errors";
import { copyText } from "@/shared/lib/download";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Field } from "@/shared/ui/Field";
import { Input } from "@/shared/ui/Input";
import { Notice } from "@/shared/ui/Feedback";

const DEFAULT_LIMIT = 20;
const DEFAULT_DAYS = 30;

export interface IssueLicenseProps {
  readonly token: string;
  readonly onIssued: () => void;
}

export function IssueLicense({ token, onIssued }: IssueLicenseProps) {
  const [until, setUntil] = useState(() => addDays(todayIso(), DEFAULT_DAYS));
  const [limit, setLimit] = useState(String(DEFAULT_LIMIT));
  const [note, setNote] = useState("");
  const [issued, setIssued] = useState<IssuedLicense | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await adminIssue(token, {
        subscriptionUntil: until,
        monthlyLimit: Number(limit),
        note,
      });
      setIssued(result);
      setNote("");
      onIssued();
    } catch (cause) {
      setError(toApiError(cause));
    } finally {
      setBusy(false);
    }
  };

  if (issued !== null) {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <Notice tone="success" title="Ключ выдан. Скопируйте его сейчас">
          Второй раз этот ключ не покажет никто — в базе он хранится только в виде хеша. Если
          потеряется, придётся выдавать новый.
        </Notice>

        <p className="break-all rounded-lg bg-secondary p-3 font-mono text-base tracking-wider">
          {issued.key}
        </p>
        <p className="text-xs text-muted">Номер клиента для поддержки: {issued.clientId}</p>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              void copyText(issued.key).then(() => {
                setCopied(true);
              });
            }}
          >
            {copied ? "Скопировано" : "Скопировать ключ"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setIssued(null);
              setCopied(false);
            }}
          >
            Готово
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <h2 className="text-sm font-semibold">Выдать доступ</h2>

      {error !== null && (
        <Notice tone="error" title="Ключ не выдан">
          {error.message}
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Подписка до" hint="Последний день, когда доступ работает.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="date"
              value={until}
              onChange={(event) => {
                setUntil(event.target.value);
              }}
            />
          )}
        </Field>

        <Field label="Планов в месяц" hint="Обычный тариф — 20.">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(event) => {
                setLimit(event.target.value);
              }}
            />
          )}
        </Field>
      </div>

      <Field label="Пометка для себя" hint="Кому выдан ключ. Клиент этого не видит.">
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={note}
            maxLength={200}
            placeholder="Пекарня в Химках, оплата 10.08"
            onChange={(event) => {
              setNote(event.target.value);
            }}
          />
        )}
      </Field>

      <div>
        <Button
          onClick={() => {
            void submit();
          }}
          disabled={busy || until.length === 0 || limit.length === 0}
        >
          {busy ? "Выдаём…" : "Выдать ключ"}
        </Button>
      </div>
    </Card>
  );
}
