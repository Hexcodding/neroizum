/**
 * Как пост будет выглядеть в ленте.
 *
 * Показывается ровно то, что человек вставит в редактор публикации: текст с
 * переносами, призыв отдельной строкой, если его нет в тексте, и хештеги. Это
 * тот же состав, что уходит в буфер обмена, — иначе предпросмотр показывал бы
 * не то, что копируется.
 *
 * Цвета взяты из темы, а не из фирменной палитры площадки, и это осознанно.
 * Нарисовать телеграмный синий значит пообещать точность, которой у нас нет:
 * настоящая лента отличается ещё и шрифтом, шириной колонки и вложениями.
 * Предпросмотр отвечает на другой вопрос — «сколько это места и не стена ли
 * текста», — а на него форма отвечает лучше цвета.
 */
import type { GeneratedPost } from "@contracts";
import { PLATFORMS } from "@contracts";
import { separateCta } from "@/entities/post/view";

export interface PostPreviewProps {
  readonly post: GeneratedPost;
  /** Чьё имя стоит над постом. Пусто — подставляется нейтральное. */
  readonly channel?: string;
}

export function PostPreview({ post, channel = "Ваш канал" }: PostPreviewProps) {
  const profile = PLATFORMS[post.platform];
  const cta = separateCta(post);
  const body = profile.isVideoFirst && post.script.trim().length > 0 ? post.script : post.postContent;

  return (
    <div
      role="group"
      aria-label="Предпросмотр в ленте"
      className="rounded-xl border border-border/70 bg-background p-3"
    >
      <div className="mx-auto flex max-w-prose flex-col gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold"
          >
            {channel.slice(0, 1).toUpperCase()}
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-semibold leading-tight">{channel}</span>
            <span className="text-xs text-muted">
              {profile.name} · {post.time}
            </span>
          </div>
        </div>

        {profile.isVideoFirst && (
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Сценарий ролика
          </p>
        )}

        <p className="whitespace-pre-wrap text-sm leading-relaxed">{body}</p>

        {cta.length > 0 && <p className="text-sm font-medium">{cta}</p>}

        {post.hashtags.length > 0 && (
          <p className="text-sm text-muted">{post.hashtags.join(" ")}</p>
        )}
      </div>
    </div>
  );
}
