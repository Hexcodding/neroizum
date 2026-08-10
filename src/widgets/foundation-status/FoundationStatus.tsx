/**
 * Экран состояния фундамента. Временный: живёт до этапа 4, когда на «/»
 * встанет мастер первого запуска. Существует для того, чтобы проверять
 * дизайн-токены в обеих темах на живой странице, а не в воображении.
 */
import { Card, CardDescription, CardTitle } from "@/shared/ui/Card";
import { Button } from "@/shared/ui/Button";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";

const CHECKS: ReadonlyArray<{ title: string; description: string }> = [
  {
    title: "Границы слоёв держит линтер",
    description:
      "Компонент не может обратиться к серверу напрямую, а server/ и entities/ не видят React.",
  },
  {
    title: "Промпт не может попасть в браузер",
    description: "После каждой сборки бандл проверяется на характерные фразы промпта.",
  },
  {
    title: "Токены темы вместо цветов в коде",
    description: "Хардкод цвета — ошибка линтера. Светлая и тёмная тема проверяются вместе.",
  },
  {
    title: "Одна команда на все проверки",
    description: "npm run verify: типы, линтер, тесты, сборка и защита промпта.",
  },
];

const SWATCHES: ReadonlyArray<{ label: string; className: string }> = [
  { label: "Акцент", className: "bg-primary" },
  { label: "Поверхность", className: "bg-card" },
  { label: "Второй план", className: "bg-secondary" },
  { label: "Успех", className: "bg-success" },
  { label: "Внимание", className: "bg-warning" },
  { label: "Ошибка", className: "bg-destructive" },
];

export function FoundationStatus() {
  return (
    <div className="ambient-bg min-h-screen">
      <div className="container max-w-4xl py-10 sm:py-16">
        <header className="mb-10 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-primary">
              Этап 0 · Фундамент
            </p>
            <h1 className="page-title mt-2">НЕЙРОИЗЮМ v2</h1>
            <p className="section-hint mt-3 max-w-xl">
              Каркас проекта готов. Продуктовых функций здесь пока нет — эта страница показывает,
              что дизайн-система и проверки качества работают.
            </p>
          </div>
          <ThemeToggle />
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          {CHECKS.map((check) => (
            <Card key={check.title}>
              <CardTitle>{check.title}</CardTitle>
              <CardDescription>{check.description}</CardDescription>
            </Card>
          ))}
        </div>

        <Card className="mt-4">
          <CardTitle>Фирменная гамма</CardTitle>
          <CardDescription>Переключите тему — оттенки и тени пересчитываются сами.</CardDescription>
          <ul className="mt-4 flex flex-wrap gap-3">
            {SWATCHES.map((swatch) => (
              <li key={swatch.label} className="flex items-center gap-2 text-xs">
                <span
                  className={`size-8 rounded-md border border-border/70 ${swatch.className}`}
                  aria-hidden
                />
                {swatch.label}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button>Основное действие</Button>
            <Button variant="outline">Второстепенное</Button>
            <Button variant="ghost">Тихое</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
