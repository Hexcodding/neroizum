/**
 * Обёртка поля: подпись, подсказка, ошибка.
 *
 * Сделана отдельным элементом, потому что связь подписи с полем и объявление
 * ошибки для чтения с экрана — это то, что забывают в первую очередь. Здесь
 * забыть нельзя: идентификаторы проставляются сами.
 */
import { useId } from "react";
import { cn } from "@/shared/lib/cn";

export interface FieldProps {
  readonly label: string;
  /** Пояснение под подписью: зачем это поле и что писать. */
  readonly hint?: string;
  readonly error?: string;
  readonly optional?: boolean;
  readonly className?: string;
  /** Поле получает идентификаторы для подписи, подсказки и ошибки. */
  readonly children: (ids: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => React.ReactNode;
}

export function Field({ label, hint, error, optional, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy =
    [hint === undefined ? null : hintId, error === undefined ? null : errorId]
      .filter((value): value is string => value !== null)
      .join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {optional === true && <span className="ml-1.5 text-xs text-muted">необязательно</span>}
      </label>

      {hint !== undefined && (
        <p id={hintId} className="text-xs leading-relaxed text-muted">
          {hint}
        </p>
      )}

      {children({ id, describedBy, invalid: error !== undefined })}

      {error !== undefined && (
        // role="alert" нужен, чтобы ошибка прозвучала сразу, а не при следующем
        // переходе по полям.
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
