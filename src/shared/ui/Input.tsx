/**
 * Текстовое поле и многострочное поле.
 *
 * Высота не меньше 44 пикселей и размер текста не меньше 16 на телефоне: при
 * меньшем размере мобильный браузер сам увеличивает страницу при фокусе, и
 * вёрстка «прыгает». В предыдущей версии так и было.
 */
import { forwardRef } from "react";
import { cn } from "@/shared/lib/cn";

const base = cn(
  "w-full rounded-lg border bg-input/40 px-3 py-2.5 text-base md:text-sm",
  "placeholder:text-muted/70 transition-colors",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
  "focus-visible:ring-offset-background disabled:opacity-50",
);

function borderClass(invalid: boolean | undefined): string {
  return invalid === true ? "border-destructive" : "border-border/70";
}

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  readonly invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      aria-invalid={invalid === true ? true : undefined}
      className={cn(base, borderClass(invalid), "min-h-touch", className)}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid === true ? true : undefined}
      className={cn(base, borderClass(invalid), "resize-y leading-relaxed", className)}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

/** Счётчик символов у длинных полей: предел должен быть виден до отправки. */
export function CharacterCount({ value, limit }: { value: string; limit: number }) {
  const over = value.length > limit;
  return (
    <p className={cn("text-right text-xs", over ? "text-destructive" : "text-muted")}>
      {value.length} / {limit}
    </p>
  );
}
