/**
 * Остаток генераций месяца.
 *
 * Формулировка «осталось 17 из 20» вместо «использовано 3 из 20»: человек
 * планирует по остатку, а не по расходу. Когда остаток кончился, надпись
 * перестаёт быть надписью и говорит, что делать дальше — иначе кнопка
 * «Создать план» отказывает без объяснения.
 */
import { cn } from "@/shared/lib/cn";
import { useAccess } from "./useAccess";

export function QuotaBadge({ className }: { className?: string }) {
  const { quota } = useAccess();
  if (quota === null) return null;

  const empty = quota.left === 0;
  const nearlyEmpty = !empty && quota.left <= 2;

  return (
    <span
      className={cn(
        "text-xs",
        empty || nearlyEmpty ? "font-medium text-foreground" : "text-muted",
        className,
      )}
    >
      {empty
        ? "Планы на этот месяц закончились"
        : `Осталось ${String(quota.left)} из ${String(quota.limit)}`}
    </span>
  );
}
