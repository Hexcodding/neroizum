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
import { ADMIN_ENABLED } from "./admin-enabled";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const CreatePlanPage = lazy(() => import("@/pages/CreatePlanPage"));
const PlansPage = lazy(() => import("@/pages/PlansPage"));
const PlanPage = lazy(() => import("@/pages/PlanPage"));
// Ветка недостижима в клиентской сборке, поэтому её код в бандл не попадает.
const AdminPage = ADMIN_ENABLED ? lazy(() => import("@/pages/AdminPage")) : null;

export function AppRoutes() {
  const { session } = useAccess();

  // Панель управления живёт вне клиентского доступа: у неё свой пароль и свой
  // токен, и клиентская сессия для входа в неё ничего не значит.
  if (AdminPage !== null && window.location.pathname.startsWith("/admin")) {
    return (
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    );
  }

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
