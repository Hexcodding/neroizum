/**
 * Правка поста.
 *
 * Правятся только те поля, которые человек действительно переписывает: текст,
 * заголовок, призыв, время, хештеги. Тип, рубрику и площадку менять нельзя —
 * они держат структуру плана: пропорции типов и распределение по площадкам
 * рассчитаны заранее, и ручная правка тихо ломала бы их.
 */
import { useState } from "react";
import { validateEditedPost, type GeneratedPost } from "@contracts";
import { Button } from "@/shared/ui/Button";
import { Field } from "@/shared/ui/Field";
import { Input, Textarea } from "@/shared/ui/Input";
import { Notice } from "@/shared/ui/Feedback";
import { platformName } from "@/entities/post/view";
import type { ImproveOffer } from "./ImprovePost";
import type { ImageOffer } from "./PostImage";
import { PostStudio } from "./PostStudio";
import { PostTools } from "./PostTools";

export interface PostEditorProps {
  readonly post: GeneratedPost;
  readonly saving: boolean;
  readonly onSave: (post: GeneratedPost) => void;
  readonly onCancel: () => void;
  /**
   * Переделать пост через модель. Не передано — блок просьб не показывается:
   * пока идёт генерация плана, улучшать ещё нечего.
   */
  readonly improve?: ImproveOffer;
  /** Нарисовать картинку. Не передано — блока нет, как и у переделки. */
  readonly image?: ImageOffer;
}

export function PostEditor({ post, saving, onSave, onCancel, improve, image }: PostEditorProps) {
  const [draft, setDraft] = useState<GeneratedPost>(post);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const change = <K extends keyof GeneratedPost>(field: K, value: GeneratedPost[K]): void => {
    setDraft({ ...draft, [field]: value });
  };

  const save = (): void => {
    const result = validateEditedPost(draft);
    if (result.ok) {
      setErrors({});
      onSave(draft);
      return;
    }

    const byField: Record<string, string> = {};
    for (const error of result.errors) {
      byField[error.field] = error.message;
    }
    setErrors(byField);
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-primary/40 bg-card p-4">
      <p className="text-xs text-muted">
        Пост №{post.number} · {platformName(post.platform)} · {post.type}
      </p>

      <Field label="Заголовок" error={errors.title}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            value={draft.title}
            onChange={(event) => {
              change("title", event.target.value);
            }}
          />
        )}
      </Field>

      <Field label="Текст поста" error={errors.postContent}>
        {({ id, describedBy, invalid }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            rows={12}
            value={draft.postContent}
            onChange={(event) => {
              change("postContent", event.target.value);
            }}
          />
        )}
      </Field>

      <PostStudio draft={draft} />

      <Field label="Призыв к действию" error={errors.cta}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            value={draft.cta}
            onChange={(event) => {
              change("cta", event.target.value);
            }}
          />
        )}
      </Field>

      <WhenFields draft={draft} errors={errors} onChange={change} />

      <Field label="Хештеги" hint="Через пробел." error={errors.hashtags}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            invalid={invalid}
            value={draft.hashtags.join(" ")}
            onChange={(event) => {
              change(
                "hashtags",
                event.target.value.split(/\s+/).filter((tag) => tag.length > 0),
              );
            }}
          />
        )}
      </Field>

      <PostTools
        draft={draft}
        saving={saving}
        improve={improve}
        image={image}
        onApply={setDraft}
      />

      {Object.keys(errors).length > 0 && (
        <Notice tone="error" title="Правка не сохранена">
          Проверьте подсвеченные поля.
        </Notice>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={saving}>
          Отменить
        </Button>
      </div>
    </div>
  );
}

interface WhenFieldsProps {
  readonly draft: GeneratedPost;
  readonly errors: Record<string, string>;
  readonly onChange: (field: "date" | "time", value: string) => void;
}

/** Дата и время в одну строку: на телефоне они всё равно встают друг под друга. */
function WhenFields({ draft, errors, onChange }: WhenFieldsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Дата" error={errors.date}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="date"
            aria-describedby={describedBy}
            invalid={invalid}
            value={draft.date}
            onChange={(event) => {
              onChange("date", event.target.value);
            }}
          />
        )}
      </Field>

      <Field label="Время" error={errors.time}>
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            type="time"
            aria-describedby={describedBy}
            invalid={invalid}
            value={draft.time}
            onChange={(event) => {
              onChange("time", event.target.value);
            }}
          />
        )}
      </Field>
    </div>
  );
}
