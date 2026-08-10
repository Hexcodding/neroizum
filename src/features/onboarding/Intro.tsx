/**
 * Вступление при первом запуске.
 *
 * Оно отвечает на три вопроса, которые человек задаёт молча и, не получив
 * ответа, уходит: что я получу, сколько это займёт и что от меня нужно. Критерий
 * готовности продукта сформулирован как «ни одного вопроса „а что дальше“» —
 * этот экран и есть ответ на первый из них.
 *
 * Показывается один раз и закрывается любым действием: обучение, которое нельзя
 * пропустить, раздражает больше, чем его отсутствие.
 */
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";

const STEPS = [
  {
    title: "Расскажете о себе своими словами",
    text: "Чем занимаетесь и для кого. Без терминов — так, как объяснили бы знакомому.",
  },
  {
    title: "Выберете площадки и срок",
    text: "Telegram, ВКонтакте, MAX, TikTok, Одноклассники. План на неделю, две или месяц.",
  },
  {
    title: "Получите готовые посты",
    text: "С датами, текстами, призывами и хештегами. Скопировать и опубликовать — без переписывания.",
  },
] as const;

export function Intro({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold tracking-tight">
          Контент-план на месяц — за одну заявку
        </h1>
        <p className="text-sm leading-relaxed text-muted">
          Заполнение занимает пару минут, сборка плана — около минуты. Посты появляются по мере
          готовности, любой можно поправить, а план сохраняется и никуда не денется.
        </p>
      </header>

      <Card className="flex flex-col gap-4 p-5">
        <ol className="flex flex-col gap-4">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold"
              >
                {index + 1}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{step.title}</span>
                <span className="text-sm leading-relaxed text-muted">{step.text}</span>
              </span>
            </li>
          ))}
        </ol>

        <div>
          <Button size="lg" onClick={onStart}>
            Составить первый план
          </Button>
        </div>
      </Card>

      <p className="text-xs leading-relaxed text-muted">
        Про голос вашего бренда спросим на последнем шаге — это необязательно, но именно из-за него
        посты перестают звучать как текст робота.
      </p>
    </div>
  );
}
