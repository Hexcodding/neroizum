/**
 * Один сохранённый план: посты, календарь, правка, выгрузка.
 *
 * Правка сохраняется сразу на сервере, без кнопки «сохранить план целиком»:
 * человек правит один пост и уходит, а не редактирует документ.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { GeneratedPost } from "@contracts";
import { fetchPlan, savePostEdit, type StoredPlan } from "@/shared/api/endpoints";
import { toApiError } from "@/shared/api/errors";
import type { ApiError } from "@/shared/api/errors";
import { useAccess } from "@/features/access/useAccess";
import { PlanView } from "@/widgets/plan-view/PlanView";
import { Button } from "@/shared/ui/Button";
import { Notice, PostSkeleton } from "@/shared/ui/Feedback";

export default function PlanPage() {
  const { planId = "" } = useParams();
  const { session } = useAccess();
  const token = session?.token ?? null;

  const [plan, setPlan] = useState<StoredPlan | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [saveError, setSaveError] = useState<ApiError | null>(null);

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

  if (error !== null) {
    return (
      <div className="flex flex-col gap-4">
        <Notice
          tone="error"
          title="План не открылся"
          onRetry={
            error.retryable
              ? () => {
                  void load();
                }
              : undefined
          }
        >
          {error.message}
        </Notice>
        <Button variant="ghost" asChild>
          <Link to="/plans">Ко всем планам</Link>
        </Button>
      </div>
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
    </div>
  );
}
