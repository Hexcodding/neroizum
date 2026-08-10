/**
 * Маршруты. Страницы подключаются через ленивую загрузку: каждая уезжает
 * в отдельный кусок сборки, и первый экран не тянет за собой всё приложение.
 */
import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const HomePage = lazy(() => import("@/pages/HomePage"));

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
