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
import { NEW_PLAN_LABELS } from "@/widgets/generation/labels";
import { Intro } from "@/features/onboarding/Intro";
import { markIntroSeen, wasIntroSeen } from "@/features/onboarding/intro-state";
import { Notice } from "@/shared/ui/Feedback";

export default function CreatePlanPage() {
  const { session, expire, quota, refreshQuota } = useAccess();
  const generation = useGeneration();
  const navigate = useNavigate();
  const [request, setRequest] = useState<GenerationRequest | null>(null);
  const [intro, setIntro] = useState(() => !wasIntroSeen());

  // Сессия закончилась во время работы — возвращаем на вход. Только по этой
  // причине: остальные ошибки лечатся повтором, а не выходом.
  useEffect(() => {
    if (generation.error?.code === "NO_SESSION") expire();
  }, [generation.error, expire]);

  // Остаток перечитывается, когда работа закончилась — и после успеха, и после
  // сбоя: при сбое квота возвращается клиенту, и он должен это увидеть.
  useEffect(() => {
    if (!generation.running && request !== null) void refreshQuota();
  }, [generation.running, request, refreshQuota]);

  const run = (next: GenerationRequest): void => {
    if (session === null) return;
    setRequest(next);
    void generation.start(session.token, next);
  };

  if (intro && request === null) {
    return (
      <Intro
        onStart={() => {
          markIntroSeen();
          setIntro(false);
        }}
      />
    );
  }

  if (request === null) {
    const empty = quota !== null && quota.left === 0;

    return (
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold tracking-tight">Новый контент-план</h1>
          <p className="text-sm text-muted">
            Ответьте на несколько вопросов — получите готовые посты с датами публикации.
          </p>
        </header>

        {empty && (
          <Notice tone="info" title="Планы на этот месяц закончились">
            Вы использовали все {String(quota.limit)} планов. Первого числа счётчик обнулится, а
            сохранённые планы останутся на месте. Нужно раньше — напишите нам, поднимем лимит.
          </Notice>
        )}

        <PlanForm onSubmit={run} busy={generation.running || empty} />
      </div>
    );
  }

  const planId = generation.planId;

  return (
    <GenerationScreen
      title={request.niche}
      labels={NEW_PLAN_LABELS}
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
