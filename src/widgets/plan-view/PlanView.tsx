/**
 * План на экране: список по дням или календарь, выгрузка, правка поста.
 *
 * По умолчанию открыт список с полными текстами. Календарь — второй режим, а не
 * первый: человек пришёл за готовыми постами, а не за сеткой дат. Сетка отвечает
 * на другой вопрос — «нет ли провалов в расписании» — и нужна позже.
 */
import { useState } from "react";
import type { GeneratedPost } from "@contracts";
import { groupByDay } from "@/entities/post/view";
import { safeFileName, toCsv, toPlainText } from "@/entities/plan/export";
import { downloadFile } from "@/shared/lib/download";
import { Button } from "@/shared/ui/Button";
import { cn } from "@/shared/lib/cn";
import { PostCard } from "@/features/edit-post/PostCard";
import { PostEditor } from "@/features/edit-post/PostEditor";
import { PlanCalendar } from "./PlanCalendar";

export interface PlanViewProps {
  readonly title: string;
  readonly posts: readonly GeneratedPost[];
  /** Правка доступна только у сохранённого плана: править нечего, пока идёт генерация. */
  readonly onSavePost?: (post: GeneratedPost) => Promise<void>;
  readonly children?: React.ReactNode;
}

type Mode = "list" | "calendar";

export function PlanView({ title, posts, onSavePost, children }: PlanViewProps) {
  const [mode, setMode] = useState<Mode>("list");
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const days = groupByDay(posts);

  const save = async (post: GeneratedPost): Promise<void> => {
    if (onSavePost === undefined) return;
    setSaving(true);
    try {
      await onSavePost(post);
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const pickDay = (date: string): void => {
    setMode("list");
    // Переход к дню после смены режима: элемента ещё нет в разметке, поэтому
    // прокрутка откладывается до следующей отрисовки.
    window.setTimeout(() => {
      document.getElementById(`day-${date}`)?.scrollIntoView({ behavior: "smooth" });
    }, 0);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {/* Две кнопки-переключателя, а не вкладки: полноценная разметка вкладок
            требует связанных панелей и обхода стрелками, а половинчатая мешает
            экранному диктору сильнее, чем её отсутствие. */}
        <div className="flex rounded-lg border border-border/70 p-0.5" role="group" aria-label="Как показать план">
          {(["list", "calendar"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
              }}
              className={cn(
                "min-h-touch rounded-md px-4 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mode === value ? "bg-secondary" : "text-muted hover:text-foreground",
              )}
            >
              {value === "list" ? "Посты" : "Календарь"}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              downloadFile(toPlainText(title, posts), safeFileName(title, "txt"), "text/plain");
            }}
          >
            Скачать текстом
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              downloadFile(toCsv(posts), safeFileName(title, "csv"), "text/csv");
            }}
          >
            Скачать таблицей
          </Button>
        </div>
      </div>

      {children}

      {mode === "calendar" ? (
        <PlanCalendar posts={posts} onPickDay={pickDay} />
      ) : (
        <div className="flex flex-col gap-6">
          {days.map((day) => (
            <section key={day.date} id={`day-${day.date}`} className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                {day.label}
              </h2>
              {day.posts.map((post) =>
                editing === post.number ? (
                  <PostEditor
                    key={post.number}
                    post={post}
                    saving={saving}
                    onSave={(edited) => {
                      void save(edited);
                    }}
                    onCancel={() => {
                      setEditing(null);
                    }}
                  />
                ) : (
                  <PostCard
                    key={post.number}
                    post={post}
                    onEdit={
                      onSavePost === undefined
                        ? undefined
                        : () => {
                            setEditing(post.number);
                          }
                    }
                  />
                ),
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
