/**
 * Карточка — базовая поверхность интерфейса. Тень берётся из переменной
 * --shadow-strength, поэтому одинаково выглядит в светлой и тёмной теме.
 */
import { forwardRef } from "react";
import { cn } from "@/shared/lib/cn";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export const Card = forwardRef<HTMLDivElement, DivProps>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("premium-card p-5 sm:p-6", className)} {...props} />
));
Card.displayName = "Card";
