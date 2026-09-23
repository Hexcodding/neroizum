/**
 * Календарь плана.
 *
 * Нужен для одного вопроса, на который список отвечает плохо: «а не пусто ли у
 * меня три дня подряд». Поэтому здесь не тексты, а плотность: день, площадки,
 * тип. Нажатие на день ведёт к постам этого дня в списке.
 */
import { groupByDay, platformName } from "@/entities/post/view";
import type { GeneratedPost } from "@contracts";
import { cn } from "@/shared/lib/cn";

export interface PlanCalendarProps {
  readonly posts: readonly GeneratedPost[];
  readonly onPickDay: (date: string) => void;
}

export function PlanCalendar({ posts, onPickDay }: PlanCalendarProps) {
  const days = groupByDay(posts);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {days.map((day) => (
        <button
          key={day.date}
          type="button"
          onClick={() => {
            onPickDay(day.date);
          }}
          className={cn(
            "flex min-h-touch flex-col gap-1 rounded-lg border border-border/60 p-3 text-left",
            "transition-colors hover:bg-secondary/50 focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "focus-visible:ring-offset-background",
          )}
        >
          <span className="text-xs font-semibold">{day.label}</span>
          {day.posts.map((post) => (
            <span key={post.number} className="truncate text-xs text-muted">
              {post.time} {platformName(post.platform)} · {post.type}
            </span>
          ))}
        </button>
      ))}
    </div>
  );
}
