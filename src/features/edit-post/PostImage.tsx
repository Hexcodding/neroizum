/**
 * Картинка к посту: одна кнопка, один запрос, одна картинка.
 *
 * Здесь же показан остаток картинок — там, где он тратится. Это самый дорогой
 * расход продукта, и узнать о нуле человек должен до нажатия, а не после
 * отказа. Кончились — сказано словами, а не погашенной кнопкой.
 *
 * Рисуется картинка по сохранённому посту: промпт для генератора лежит в самом
 * посте и обновляется только вместе с ним. Поэтому правки, ещё не сохранённые,
 * в кадр не попадут — об этом сказано прямо, чтобы человек не гадал, почему
 * картинка «не про то».
 */
import { useState } from "react";
import { toApiError } from "@/shared/api/errors";
import type { ApiError } from "@/shared/api/errors";
import { Button } from "@/shared/ui/Button";
import { Notice } from "@/shared/ui/Feedback";

/** Что предложить в редакторе: остаток картинок, готовая картинка и сам вызов. */
export interface ImageOffer {
  /** `null` — сервер не ответил про остаток; выдумывать число нельзя. */
  readonly left: number | null;
  readonly limit: number | null;
  /** Ссылка на уже нарисованную картинку, если она есть. */
  readonly url: string | null;
  run(): Promise<string>;
}

export interface PostImageProps {
  readonly offer: ImageOffer;
  /** Описание кадра по-русски: его писала модель вместе с постом. */
  readonly visual: string;
  readonly disabled: boolean;
}

export function PostImage({ offer, visual, disabled }: PostImageProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const draw = (): void => {
    if (busy) return;
    setBusy(true);
    setError(null);

    void offer
      .run()
      .catch((cause: unknown) => {
        setError(toApiError(cause));
      })
      .finally(() => {
        setBusy(false);
      });
  };

  const empty = offer.left === 0 && offer.url === null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border/70 bg-secondary/30 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Картинка к посту</h3>
        <span className="text-xs text-muted">{leftLabel(offer)}</span>
      </div>

      {offer.url !== null && (
        <a href={offer.url} target="_blank" rel="noreferrer" className="block">
          <img
            src={offer.url}
            alt={visual.length > 0 ? visual : "Картинка к посту"}
            className="w-full rounded-lg border border-border/60"
          />
        </a>
      )}

      {empty ? (
        <p className="text-sm leading-relaxed text-muted">
          Картинки на этот месяц закончились — счётчик обновится первого числа. Описание кадра ниже
          можно отдать дизайнеру или любому генератору картинок, это ничего не стоит.
        </p>
      ) : (
        <DrawRow
          busy={busy}
          disabled={disabled || offer.left === 0}
          again={offer.url !== null}
          onDraw={draw}
        />
      )}

      {visual.length > 0 && <p className="text-xs leading-relaxed text-muted">{visual}</p>}

      {error !== null && (
        <Notice tone="error" title="Картинка не нарисовалась">
          {error.message}
        </Notice>
      )}
    </section>
  );
}

interface DrawRowProps {
  readonly busy: boolean;
  readonly disabled: boolean;
  /** Картинка уже есть: кнопка предлагает нарисовать другую. */
  readonly again: boolean;
  readonly onDraw: () => void;
}

function DrawRow({ busy, disabled, again, onDraw }: DrawRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={busy || disabled} onClick={onDraw}>
        {drawLabel(busy, again)}
      </Button>
      <span className="text-xs text-muted">
        {busy ? "Обычно занимает несколько секунд." : "Рисуем по сохранённому тексту поста."}
      </span>
    </div>
  );
}

function drawLabel(busy: boolean, again: boolean): string {
  if (busy) return "Рисуем…";
  return again ? "Нарисовать заново" : "Нарисовать картинку";
}

function leftLabel(offer: ImageOffer): string {
  if (offer.left === null || offer.limit === null) return "";
  if (offer.left === 0) return "Картинок не осталось";
  return `Осталось ${String(offer.left)} из ${String(offer.limit)}`;
}
