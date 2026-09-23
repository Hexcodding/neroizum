/**
 * Общая обвязка экранов: заголовок, переходы, номер клиента, выход.
 *
 * Номер клиента показан специально: когда человек пишет в поддержку, первый
 * вопрос — «кто вы». Лицензионный ключ для этого не годится, он секрет, а номер
 * клиента для этого и придуман.
 */
import { NavLink } from "react-router-dom";
import { Button } from "@/shared/ui/Button";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";
import { cn } from "@/shared/lib/cn";
import { useAccess } from "@/features/access/useAccess";
import { QuotaBadge } from "@/features/access/QuotaBadge";

const LINKS = [
  { to: "/", label: "Новый план" },
  { to: "/plans", label: "Мои планы" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, leave } = useAccess();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border/60">
        <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">НЕЙРОИЗЮМ</span>
            <span className="text-[11px] text-muted">генератор контент-плана</span>
          </div>

          <nav className="flex gap-1" aria-label="Разделы">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end
                className={({ isActive }) =>
                  cn(
                    "flex min-h-touch items-center rounded-lg px-3 text-sm transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isActive ? "bg-secondary font-medium" : "text-muted hover:text-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <QuotaBadge className="hidden sm:inline" />
            {session !== null && (
              <span className="hidden font-mono text-xs text-muted md:inline">
                {session.clientId}
              </span>
            )}
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void leave();
              }}
            >
              Выйти
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>

      <footer className="flex flex-col items-center gap-1 border-t border-border/60 px-4 py-4 text-center text-xs text-muted">
        {/* На узком экране остатка в заголовке не видно — здесь он есть всегда. */}
        <QuotaBadge className="sm:hidden" />
        <span>
          {session !== null && <>Доступ до {session.subscriptionUntil}. Ваш номер {session.clientId}. </>}
          Вопрос или пожелание — напишите нам, отвечаем сами.
        </span>
      </footer>
    </div>
  );
}
