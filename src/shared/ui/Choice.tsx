/**
 * Выбор из вариантов: одиночный карточками и множественный отметками.
 *
 * Списки-выпадашки здесь не используются намеренно. Человек, который впервые
 * заводит контент-план, не знает, что скрыто внутри списка; варианты с коротким
 * пояснением на виду отвечают на вопрос «а что выбрать» без чтения справки.
 *
 * Под оформлением — настоящие radio и checkbox, спрятанные визуально, но не от
 * браузера. Кнопки с role="radio" выглядели бы так же, но потеряли бы то, что
 * человек не заказывает словами и замечает только когда этого нет: переход
 * стрелками внутри группы, объявление «выбрано 2 из 5» экранным диктором и
 * подпись, связанную с полем.
 */
import { useId } from "react";
import { cn } from "@/shared/lib/cn";

export interface ChoiceOption<T extends string> {
  readonly id: T;
  readonly label: string;
  /** Одна строка о том, кому это подходит. */
  readonly note?: string;
}

/** Поле скрыто от глаз, но остаётся в порядке обхода и получает фокус. */
const hiddenInput = "absolute h-0 w-0 opacity-0";

const focusRing = cn(
  "peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
  "peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
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
  const name = useId();
  const grid = { 1: "grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" }[columns];

  return (
    <fieldset className={cn("grid grid-cols-1 gap-2", grid)}>
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <label key={option.id} className="relative">
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={selected}
              onChange={() => {
                onChange(option.id);
              }}
              className={cn(hiddenInput, "peer")}
            />
            <span
              className={cn(
                "flex min-h-touch cursor-pointer flex-col items-start gap-0.5 rounded-lg border p-3",
                "text-left transition-colors",
                focusRing,
                selected
                  ? "border-primary bg-primary/10 shadow-glow-sm"
                  : "border-border/70 hover:bg-secondary/50",
              )}
            >
              <span className="text-sm font-medium">{option.label}</span>
              {option.note !== undefined && (
                <span className="text-xs leading-snug text-muted">{option.note}</span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export interface CheckboxCardProps {
  readonly label: string;
  readonly description: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

/**
 * Одиночная отметка с пояснением. Нажимается вся строка, а не квадратик 20×20:
 * на телефоне попасть в квадратик пальцем — отдельное упражнение.
 */
export function CheckboxCard({ label, description, checked, onChange }: CheckboxCardProps) {
  return (
    <label
      className={cn(
        "flex min-h-touch cursor-pointer items-start gap-3 rounded-lg border p-3",
        "transition-colors",
        focusRing,
        checked ? "border-primary bg-primary/10" : "border-border/70 hover:bg-secondary/40",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="peer mt-0.5 h-5 w-5 shrink-0 rounded border-border accent-primary"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs leading-relaxed text-muted">{description}</span>
      </span>
    </label>
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
    <fieldset className="flex flex-wrap gap-2">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => {
        const selected = values.includes(option.id);
        return (
          <label key={option.id} className="relative">
            <input
              type="checkbox"
              value={option.id}
              checked={selected}
              onChange={() => {
                onChange(
                  selected ? values.filter((item) => item !== option.id) : [...values, option.id],
                );
              }}
              className={cn(hiddenInput, "peer")}
            />
            <span
              className={cn(
                "flex min-h-touch cursor-pointer items-center rounded-full border px-4 text-sm",
                "font-medium transition-colors",
                focusRing,
                selected
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border/70 text-muted hover:bg-secondary/50",
              )}
            >
              {option.label}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
