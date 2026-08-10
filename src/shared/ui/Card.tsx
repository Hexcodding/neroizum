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

export const CardTitle = forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("font-display text-base font-semibold", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<HTMLParagraphElement, DivProps>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("section-hint mt-1", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";
