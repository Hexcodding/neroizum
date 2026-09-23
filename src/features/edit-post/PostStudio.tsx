/**
 * Студия поста: длина под площадку и предпросмотр ленты.
 *
 * Оба ответа нужны в момент правки, а не после сохранения, поэтому студия
 * живёт внутри редактора и смотрит на черновик: цифра пересчитывается по мере
 * набора. Предпросмотр по умолчанию свёрнут — в списке из тридцати постов
 * развёрнутый по умолчанию блок превращает страницу в бесконечную ленту.
 */
import { useState } from "react";
import type { GeneratedPost } from "@contracts";
import { lengthHint } from "@/entities/post/length";
import { Button } from "@/shared/ui/Button";
import { cn } from "@/shared/lib/cn";
import { PostPreview } from "./PostPreview";

export interface PostStudioProps {
  readonly draft: GeneratedPost;
}

export function PostStudio({ draft }: PostStudioProps) {
  const [preview, setPreview] = useState(false);
  const hint = lengthHint(draft.postContent, draft.platform);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Ориентир — редакционный, поэтому «длинновато» подсвечивается
            вниманием, а не тревогой: это не ошибка и публикации не мешает. */}
        <p
          className={cn(
            "text-xs",
            hint.verdict === "good" ? "text-muted" : "font-medium text-foreground",
          )}
          aria-live="polite"
        >
          {hint.text}
        </p>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={preview}
          onClick={() => {
            setPreview(!preview);
          }}
        >
          {preview ? "Скрыть предпросмотр" : "Показать в ленте"}
        </Button>
      </div>

      {preview && <PostPreview post={draft} />}
    </div>
  );
}
