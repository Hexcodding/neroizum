/**
 * Панель управления доступами.
 *
 * Этот экран не попадает в сборку для клиентов: маршрут регистрируется только
 * при включённом признаке сборки, и код страницы тогда просто не входит в бандл.
 * Проверка есть в тестах сборки — на честное слово такие вещи не оставляют.
 */
import { useState } from "react";
import { useAdminAccess } from "@/features/admin/useAdminAccess";
import { useLicenses } from "@/features/admin/useLicenses";
import { IssueLicense } from "@/features/admin/IssueLicense";
import { LicenseCard } from "@/features/admin/LicenseCard";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { Field } from "@/shared/ui/Field";
import { Input } from "@/shared/ui/Input";
import { EmptyState, Notice, Skeleton } from "@/shared/ui/Feedback";
import { ThemeToggle } from "@/shared/ui/ThemeToggle";

export default function AdminPage() {
  const access = useAdminAccess();

  if (access.token === null) {
    return <AdminLogin access={access} />;
  }
  return <AdminConsole token={access.token} onLeave={access.leave} />;
}

function AdminLogin({ access }: { access: ReturnType<typeof useAdminAccess> }) {
  const [password, setPassword] = useState("");

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-5 px-4">
      <h1 className="text-lg font-semibold tracking-tight">Панель управления</h1>

      <Card className="p-5">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void access.enter(password);
          }}
        >
          <Field label="Пароль">
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                }}
              />
            )}
          </Field>

          {access.error !== null && (
            <Notice tone="error" title="Не удалось войти">
              {access.error.message}
            </Notice>
          )}

          <Button type="submit" disabled={access.checking || password.length === 0}>
            {access.checking ? "Проверяем…" : "Войти"}
          </Button>
        </form>
      </Card>
    </main>
  );
}

function AdminConsole({ token, onLeave }: { token: string; onLeave: () => void }) {
  const state = useLicenses(token);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Доступы</h1>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" size="sm" onClick={onLeave}>
            Выйти
          </Button>
        </div>
      </header>

      <IssueLicense
        token={token}
        onIssued={() => {
          void state.reload();
        }}
      />

      {state.error !== null && (
        <Notice
          tone="error"
          title="Ошибка панели"
          onRetry={() => {
            void state.reload();
          }}
        >
          {state.error.message}
        </Notice>
      )}

      {state.licenses === null && state.error === null && <Skeleton className="h-24 w-full" />}

      {state.licenses !== null && state.licenses.length === 0 && (
        <EmptyState
          title="Выданных доступов пока нет"
          description="Выдайте первый ключ формой выше. Ключ показывается один раз — сразу отправьте его клиенту."
        />
      )}

      {state.licenses !== null && state.licenses.length > 0 && (
        <ul className="flex flex-col gap-3">
          {state.licenses.map((license) => (
            <li key={license.id}>
              <LicenseCard
                license={license}
                busy={state.busyId === license.id}
                onSetDisabled={(disabled) => {
                  void state.setDisabled(license.id, disabled);
                }}
                onSetLimit={(limit) => {
                  void state.setLimit(license.id, limit);
                }}
                onSetImprovementLimit={(limit) => {
                  void state.setImprovementLimit(license.id, limit);
                }}
                onSetImageLimit={(limit) => {
                  void state.setImageLimit(license.id, limit);
                }}
                onSetSubscription={(until) => {
                  void state.setSubscription(license.id, until);
                }}
                onResetSession={() => {
                  void state.resetSession(license.id);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
