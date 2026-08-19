/**
 * Карточка поста: то, ради чего продукт существует.
 *
 * Главное на карточке — готовый текст, и он виден сразу, без раскрытия. В
 * предыдущей версии пост был свёрнут до заголовка, и пользователь думал, что
 * получил список тем, а не готовые посты.
 *
 * Кнопка «Скопировать» копирует текст с призывом и хештегами — то есть ровно
 * то, что человек вставит в редактор публикации.
 */
import { useState } from "react";
import type { GeneratedPost } from "@contracts";
import { platformName, postToClipboard, separateCta, typeTone } from "@/entities/post/view";
import { copyText } from "@/shared/lib/download";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/Button";

export interface PostCardProps {
  readonly post: GeneratedPost;
  readonly onEdit?: () => void;
}

export function PostCard({ post, onEdit }: PostCardProps) {
  const [copied, setCopied] = useState(false);
  const cta = separateCta(post);

  const copy = async (): Promise<void> => {
    const done = await copyText(postToClipboard(post));
    setCopied(done);
    window.setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-4">
      <header className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-muted">
          №{post.number} · {post.time}
        </span>
        <span className="rounded-full bg-secondary px-2 py-0.5 font-medium">
          {platformName(post.platform)}
        </span>
        <span className={cn("rounded-full px-2 py-0.5 font-medium", typeTone(post.type))}>
          {post.type}
        </span>
        <span className="text-muted">{post.rubric}</span>
        <span className="ml-auto text-muted">{post.format}</span>
      </header>

      <h3 className="text-base font-semibold leading-snug">{post.title}</h3>

      <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.postContent}</p>

      {post.script.trim().length > 0 && (
        <div className="rounded-lg border border-border/50 bg-secondary/30 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Сценарий</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.script}</p>
        </div>
      )}

      {cta.length > 0 && <p className="text-sm font-medium">{cta}</p>}

      {post.hashtags.length > 0 && (
        <p className="text-xs text-muted">{post.hashtags.join(" ")}</p>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-muted">
          Изображение к посту
        </summary>
        <p className="mt-2 leading-relaxed">{post.visual}</p>
        <p className="mt-2 rounded-lg bg-secondary/40 p-2 font-mono text-xs leading-relaxed text-muted">
          {post.imagePrompt}
        </p>
      </details>

      <footer className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void copy();
          }}
        >
          {copied ? "Скопировано" : "Скопировать"}
        </Button>
        {onEdit !== undefined && (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Редактировать пост
          </Button>
        )}
      </footer>
    </article>
  );
}
