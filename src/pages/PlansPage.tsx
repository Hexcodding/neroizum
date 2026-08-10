/**
 * Список сохранённых планов.
 *
 * Пустой экран здесь не сообщает «планов нет», а показывает, что будет, и ведёт
 * к первому действию. Это тот экран, который человек увидит сразу после входа,
 * и он определяет, поймёт ли он, зачем всё это.
 */
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deletePlan, fetchPlans, type PlanSummary } from "@/shared/api/endpoints";
import { toApiError } from "@/shared/api/errors";
import type { ApiError } from "@/shared/api/errors";
import { useAccess } from "@/features/access/useAccess";
import { Button } from "@/shared/ui/Button";
import { Card } from "@/shared/ui/Card";
import { EmptyState, Notice, Skeleton } from "@/shared/ui/Feedback";

export default function PlansPage() {
  const { session } = useAccess();
  const token = session?.token ?? null;

  const [plans, setPlans] = useState<readonly PlanSummary[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    if (token === null) return;
    setError(null);
    try {
      setPlans(await fetchPlans(token));
    } catch (cause) {
      setError(toApiError(cause));
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (planId: string): Promise<void> => {
    if (token === null) return;
    // Удаление необратимо, поэтому спрашиваем. Без подтверждения один промах по
    // кнопке стоит месяца работы.
    const confirmed = window.confirm("Удалить план вместе со всеми постами? Отменить будет нельзя.");
    if (!confirmed) return;

    setRemoving(planId);
    try {
      await deletePlan(token, planId);
      await load();
    } catch (cause) {
      setError(toApiError(cause));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Мои планы</h1>
        <p className="text-sm text-muted">Всё, что вы создали. Планы хранятся у нас, ничего не теряется.</p>
      </header>

      {error !== null && (
        <Notice
          tone="error"
          title="Не удалось загрузить планы"
          onRetry={() => {
            void load();
          }}
        >
          {error.message}
        </Notice>
      )}

      {plans === null && error === null && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      )}

      {plans !== null && plans.length === 0 && (
        <EmptyState
          title="Здесь появятся ваши контент-планы"
          description="Один план — это готовые посты на неделю, две или месяц: с датами, текстами и картинками к ним. Заполнение заявки занимает пару минут."
          action={
            <Button asChild>
              <Link to="/">Создать первый план</Link>
            </Button>
          }
        />
      )}

      {plans !== null && plans.length > 0 && (
        <ul className="flex flex-col gap-3">
          {plans.map((plan) => (
            <li key={plan.id}>
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Link
                    to={`/plans/${plan.id}`}
                    className="truncate text-sm font-semibold hover:underline"
                  >
                    {plan.title.length > 0 ? plan.title : "Контент-план"}
                  </Link>
                  <span className="text-xs text-muted">
                    {plan.postCount} постов
                    {plan.firstDate.length > 0 && ` · ${plan.firstDate} — ${plan.lastDate}`}
                  </span>
                </div>

                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/plans/${plan.id}`}>Открыть</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={removing === plan.id}
                    onClick={() => {
                      void remove(plan.id);
                    }}
                  >
                    {removing === plan.id ? "Удаляем…" : "Удалить"}
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
