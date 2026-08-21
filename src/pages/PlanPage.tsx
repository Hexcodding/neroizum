/**
 * Один сохранённый план: посты, календарь, правка, выгрузка, продолжение.
 *
 * Правка сохраняется сразу на сервере, без кнопки «сохранить план целиком»:
 * человек правит один пост и уходит, а не редактирует документ.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { GeneratedPost, PeriodDays } from "@contracts";
import { fetchPlan, savePostEdit, type StoredPlan } from "@/shared/api/endpoints";
import { toApiError } from "@/shared/api/errors";
import type { ApiError } from "@/shared/api/errors";
import { useAccess } from "@/features/access/useAccess";
import { useGeneration } from "@/features/generate-plan/useGeneration";
import { ContinuePlan } from "@/features/generate-plan/ContinuePlan";
import { PlanView } from "@/widgets/plan-view/PlanView";
import { GenerationScreen } from "@/widgets/generation/GenerationScreen";
import { CONTINUED_PLAN_LABELS } from "@/widgets/generation/labels";
import { Button } from "@/shared/ui/Button";
import { Notice, PostSkeleton } from "@/shared/ui/Feedback";

export default function PlanPage() {
  const { planId = "" } = useParams();
  const { session, refreshQuota } = useAccess();
  const token = session?.token ?? null;

  const [plan, setPlan] = useState<StoredPlan | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  /** Не null, пока идёт или показывается продолжение на столько-то дней. */
  const [extraDays, setExtraDays] = useState<PeriodDays | null>(null);
  const generation = useGeneration();

  const load = useCallback(async (): Promise<void> => {
    if (token === null || planId.length === 0) return;
    setError(null);
    try {
      setPlan(await fetchPlan(token, planId));
    } catch (cause) {
      setError(toApiError(cause));
    }
  }, [token, planId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Продолжение тратит генерацию, поэтому остаток перечитывается, когда работа
  // закончилась — и после успеха, и после сбоя: при сбое квота возвращается.
  useEffect(() => {
    if (!generation.running && extraDays !== null) void refreshQuota();
  }, [generation.running, extraDays, refreshQuota]);

  const savePost = async (post: GeneratedPost): Promise<void> => {
    if (token === null || plan === null) return;
    setSaveError(null);
    try {
      await savePostEdit(token, plan.id, post);
      // Локальная копия обновляется сразу: перезагружать весь план ради одного
      // поста — значит мигать экраном на каждую правку.
      setPlan({
        ...plan,
        posts: plan.posts.map((item) => (item.number === post.number ? post : item)),
      });
    } catch (cause) {
      setSaveError(toApiError(cause));
      throw cause;
    }
  };

  const continuePlan = (days: PeriodDays): void => {
    if (token === null || plan === null) return;
    setExtraDays(days);
    void generation.continuePlan(token, plan.id, days);
  };

  if (error !== null) {
    return (
      <LoadFailure
        error={error}
        onRetry={() => {
          void load();
        }}
      />
    );
  }

  if (plan === null) {
    return (
      <div className="flex flex-col gap-3">
        <PostSkeleton />
        <PostSkeleton />
      </div>
    );
  }

  if (extraDays !== null) {
    return (
      <GenerationScreen
        title={plan.title}
        labels={CONTINUED_PLAN_LABELS}
        running={generation.running}
        posts={generation.posts}
        ready={generation.ready}
        total={generation.total}
        warnings={generation.warnings}
        error={generation.error}
        onStop={generation.stop}
        onRetry={() => {
          continuePlan(extraDays);
        }}
        onOpenPlan={
          generation.running
            ? null
            : () => {
                // План перечитывается целиком: человек ждёт продлённый план, а
                // не только что дописанный кусок.
                void load();
                setExtraDays(null);
              }
        }
        onBackToForm={() => {
          setExtraDays(null);
        }}
      />
    );
  }

  const lastDate = plan.posts.reduce((latest, post) => (post.date > latest ? post.date : latest), "");

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">
          {plan.title.length > 0 ? plan.title : "Контент-план"}
        </h1>
        <p className="text-xs text-muted">
          {plan.posts.length} постов · создан {plan.createdAt.slice(0, 10)}
        </p>
      </header>

      <PlanView title={plan.title} posts={plan.posts} onSavePost={savePost}>
        {saveError !== null && (
          <Notice tone="error" title="Правка не сохранилась">
            {saveError.message}
          </Notice>
        )}
      </PlanView>

      {lastDate.length > 0 && (
        <ContinuePlan lastDate={lastDate} busy={generation.running} onContinue={continuePlan} />
      )}
    </div>
  );
}

function LoadFailure({ error, onRetry }: { readonly error: ApiError; readonly onRetry: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <Notice tone="error" title="План не открылся" onRetry={error.retryable ? onRetry : undefined}>
        {error.message}
      </Notice>
      <Button variant="ghost" asChild>
        <Link to="/plans">Ко всем планам</Link>
      </Button>
    </div>
  );
}
