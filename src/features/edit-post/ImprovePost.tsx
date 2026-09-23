/**
 * Просьба к модели переделать открытый пост.
 *
 * Остаток улучшений показан здесь, а не в шапке приложения: он тратится этой
 * кнопкой, и узнать о нуле человек должен до нажатия, а не после отказа.
 * Кончились улучшения — так и сказано словами, включая когда они вернутся;
 * молча погашенная кнопка выглядит как поломка.
 *
 * Прежний текст держится тут же, пока открыт редактор. Замена без возврата —
 * самый быстрый способ потерять хороший текст: человек просит «покороче»,
 * получает короче и хуже, а возвращать уже нечего.
 */
import { useState } from "react";
import { INPUT_LIMITS, type GeneratedPost } from "@contracts";
import { IMPROVE_PRESETS } from "@/entities/post/improve-presets";
import { toApiError } from "@/shared/api/errors";
import type { ApiError } from "@/shared/api/errors";
import { Button } from "@/shared/ui/Button";
import { Notice } from "@/shared/ui/Feedback";
import { Textarea } from "@/shared/ui/Input";

/** Что предложить в редакторе: остаток улучшений и сам вызов модели. */
export interface ImproveOffer {
  /** `null` — сервер не ответил про остаток; выдумывать число нельзя. */
  readonly left: number | null;
  readonly limit: number | null;
  run(instruction: string): Promise<GeneratedPost>;
}

export interface ImprovePostProps {
  readonly offer: ImproveOffer;
  /** Текущий вариант поста в редакторе. */
  readonly draft: GeneratedPost;
  readonly disabled: boolean;
  readonly onApply: (post: GeneratedPost) => void;
}

export function ImprovePost({ offer, draft, disabled, onApply }: ImprovePostProps) {
  const [own, setOwn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [previous, setPrevious] = useState<GeneratedPost | null>(null);

  const ask = (instruction: string): void => {
    if (busy) return;
    setBusy(true);
    setError(null);
    // Прежний вариант запоминается до запроса: улучшив пост дважды, человек
    // захочет вернуться к тому, с чего начал, а не к промежуточному.
    const before = previous ?? draft;

    void offer
      .run(instruction)
      .then((improved) => {
        setPrevious(before);
        onApply(improved);
      })
      .catch((cause: unknown) => {
        setError(toApiError(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const busyNow = busy || disabled;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border/70 bg-secondary/30 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Переделать через нейросеть</h3>
        <span className="text-xs text-muted">{leftLabel(offer)}</span>
      </div>

      {offer.left === 0 ? (
        <p className="text-sm leading-relaxed text-muted">
          Улучшения на этот месяц закончились — счётчик обновится первого числа. Поправить пост
          руками можно прямо здесь, это ничего не стоит.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {IMPROVE_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant="outline"
                size="sm"
                disabled={busyNow}
                onClick={() => {
                  ask(preset.instruction);
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <Textarea
            rows={2}
            maxLength={INPUT_LIMITS.instruction}
            placeholder="Или своими словами: что поправить в этом посте"
            value={own}
            onChange={(event) => {
              setOwn(event.target.value);
            }}
          />

          <div>
            <Button
              size="sm"
              disabled={busyNow || own.trim().length === 0}
              onClick={() => {
                ask(own.trim());
                setOwn("");
              }}
            >
              {busy ? "Переделываем…" : "Переделать"}
            </Button>
          </div>
        </>
      )}

      {error !== null && (
        <Notice tone="error" title="Пост не переделался">
          {error.message}
        </Notice>
      )}

      {previous !== null && (
        <Notice
          tone="info"
          title="Готов новый вариант"
          retryLabel="Вернуть прежний текст"
          onRetry={() => {
            onApply(previous);
            setPrevious(null);
          }}
        >
          Новый вариант уже сохранён. Прежний текст цел, пока открыт редактор: верните его и
          нажмите «Сохранить».
        </Notice>
      )}
    </section>
  );
}

function leftLabel(offer: ImproveOffer): string {
  if (offer.left === null || offer.limit === null) return "";
  if (offer.left === 0) return "Улучшений не осталось";
  return `Осталось ${String(offer.left)} из ${String(offer.limit)}`;
}
