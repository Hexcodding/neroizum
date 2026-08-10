/**
 * Выбор из вариантов: одиночный карточками и множественный отметками.
 *
 * Списки-выпадашки здесь не используются намеренно. Человек, который впервые
 * заводит контент-план, не знает, что скрыто внутри списка; варианты с коротким
 * пояснением на виду отвечают на вопрос «а что выбрать» без чтения справки.
 */
import { cn } from "@/shared/lib/cn";

export interface ChoiceOption<T extends string> {
  readonly id: T;
  readonly label: string;
  /** Одна строка о том, кому это подходит. */
  readonly note?: string;
}

const cardBase = cn(
  "flex min-h-touch flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  "focus-visible:ring-offset-background",
);

export interface SingleChoiceProps<T extends string> {
  readonly options: readonly ChoiceOption<T>[];
  readonly value: T | null;
  readonly onChange: (value: T) => void;
  readonly label: string;
  readonly columns?: 1 | 2 | 3;
}

export function SingleChoice<T extends string>({
  options,
  value,
  onChange,
  label,
  columns = 2,
}: SingleChoiceProps<T>) {
  const grid = { 1: "grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" }[columns];

  return (
    <div role="radiogroup" aria-label={label} className={cn("grid grid-cols-1 gap-2", grid)}>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => {
              onChange(option.id);
            }}
            className={cn(
              cardBase,
              selected
                ? "border-primary bg-primary/10 shadow-glow-sm"
                : "border-border/70 hover:bg-secondary/50",
            )}
          >
            <span className="text-sm font-medium">{option.label}</span>
            {option.note !== undefined && (
              <span className="text-xs leading-snug text-muted">{option.note}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface MultiChoiceProps<T extends string> {
  readonly options: readonly ChoiceOption<T>[];
  readonly values: readonly T[];
  readonly onChange: (values: readonly T[]) => void;
  readonly label: string;
}

export function MultiChoice<T extends string>({
  options,
  values,
  onChange,
  label,
}: MultiChoiceProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) => {
        const selected = values.includes(option.id);
        return (
          <button
            key={option.id}
            type="button"
            role="checkbox"
            aria-checked={selected}
            onClick={() => {
              onChange(
                selected ? values.filter((item) => item !== option.id) : [...values, option.id],
              );
            }}
            className={cn(
              "min-h-touch rounded-full border px-4 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border/70 text-muted hover:bg-secondary/50",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
