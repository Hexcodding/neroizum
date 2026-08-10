/**
 * Создание плана: заявка, затем генерация на этом же экране.
 *
 * Адрес при переходе к генерации не меняется намеренно: работа живёт в открытом
 * соединении, и любой переход её оборвал бы. Черновик заявки при этом остаётся в
 * памяти браузера — если генерация сломается, заполнять заново не придётся.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { GenerationRequest } from "@contracts";
import { PlanForm } from "@/features/plan-form/PlanForm";
import { useGeneration } from "@/features/generate-plan/useGeneration";
import { useAccess } from "@/features/access/useAccess";
import { GenerationScreen } from "@/widgets/generation/GenerationScreen";

export default function CreatePlanPage() {
  const { session, expire } = useAccess();
  const generation = useGeneration();
  const navigate = useNavigate();
  const [request, setRequest] = useState<GenerationRequest | null>(null);

  // Сессия закончилась во время работы — возвращаем на вход. Только по этой
  // причине: остальные ошибки лечатся повтором, а не выходом.
  useEffect(() => {
    if (generation.error?.code === "NO_SESSION") expire();
  }, [generation.error, expire]);

  const run = (next: GenerationRequest): void => {
    if (session === null) return;
    setRequest(next);
    void generation.start(session.token, next);
  };

  if (request === null) {
    return (
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Новый контент-план</h1>
          <p className="text-sm text-muted">
            Ответьте на несколько вопросов — получите готовые посты с датами публикации.
          </p>
        </header>
        <PlanForm onSubmit={run} busy={generation.running} />
      </div>
    );
  }

  const planId = generation.planId;

  return (
    <GenerationScreen
      title={request.niche}
      running={generation.running}
      posts={generation.posts}
      ready={generation.ready}
      total={generation.total}
      warnings={generation.warnings}
      error={generation.error}
      onStop={generation.stop}
      onRetry={() => {
        run(request);
      }}
      onOpenPlan={
        planId === null
          ? null
          : () => {
              void navigate(`/plans/${planId}`);
            }
      }
      onBackToForm={() => {
        setRequest(null);
      }}
    />
  );
}
