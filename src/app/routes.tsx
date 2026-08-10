/**
 * Маршруты. Страницы подключаются через ленивую загрузку: каждая уезжает
 * в отдельный кусок сборки, и первый экран не тянет за собой всё приложение.
 *
 * Проверка доступа стоит одна на все внутренние экраны. Ставить её на каждой
 * странице по отдельности значит однажды забыть — и открыть страницу без входа.
 */
import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAccess } from "@/features/access/useAccess";
import { AppShell } from "@/widgets/app-shell/AppShell";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const CreatePlanPage = lazy(() => import("@/pages/CreatePlanPage"));
const PlansPage = lazy(() => import("@/pages/PlansPage"));
const PlanPage = lazy(() => import("@/pages/PlanPage"));

export function AppRoutes() {
  const { session } = useAccess();

  if (session === null) {
    return (
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<CreatePlanPage />} />
        <Route path="/plans" element={<PlansPage />} />
        <Route path="/plans/:planId" element={<PlanPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
