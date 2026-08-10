/**
 * Сообщения состояния: ошибка, подсказка, пустой экран, полоса прогресса,
 * скелет загрузки.
 *
 * Собраны в одном файле не по лени, а потому что это один язык разговора с
 * пользователем в момент, когда что-то не так. Разложенные по разным файлам,
 * они начинают говорить по-разному.
 */
import { cn } from "@/shared/lib/cn";
import { Button } from "./Button";

export interface NoticeProps {
  readonly tone: "error" | "info" | "success";
  readonly title: string;
  readonly children?: React.ReactNode;
  /** Кнопка повтора: показывается только если повторять действительно есть смысл. */
  readonly onRetry?: () => void;
  readonly retryLabel?: string;
}

const TONE = {
  error: "border-destructive/40 bg-destructive/10",
  info: "border-border/70 bg-secondary/40",
  success: "border-primary/40 bg-primary/10",
} as const;

export function Notice({ tone, title, children, onRetry, retryLabel = "Попробовать снова" }: NoticeProps) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex flex-col gap-2 rounded-lg border p-4", TONE[tone])}
    >
      <p className="text-sm font-semibold">{title}</p>
      {children !== undefined && <div className="text-sm leading-relaxed text-muted">{children}</div>}
      {onRetry !== undefined && (
        <div>
          <Button variant="outline" size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

export interface EmptyStateProps {
  readonly title: string;
  readonly description: string;
  readonly action?: React.ReactNode;
}

/**
 * Пустой экран показывает, что будет, а не сообщает об отсутствии данных.
 * «Нет данных» — это тупик; здесь всегда есть следующее действие.
 */
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 px-6 py-12 text-center">
      <p className="text-base font-semibold">{title}</p>
      <p className="max-w-md text-sm leading-relaxed text-muted">{description}</p>
      {action}
    </div>
  );
}

export interface ProgressProps {
  readonly done: number;
  readonly total: number;
  readonly label: string;
}

export function Progress({ done, total, label }: ProgressProps) {
  const percent = total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">{label}</span>
        {/* Счёт объявляется вслух по мере роста: генерация идёт минуту, и без
            этого незрячий пользователь не знает, движется ли дело. */}
        <span className="text-muted" aria-live="polite">
          {done} из {total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={label}
        className="h-2 w-full overflow-hidden rounded-full bg-secondary"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${String(percent)}%` }}
        />
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-secondary/70", className)} />;
}

/** Скелет карточки поста: показывается, пока пост ещё не пришёл. */
export function PostSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 p-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}
