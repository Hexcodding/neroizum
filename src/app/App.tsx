import { Suspense } from "react";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@/shared/theme/ThemeProvider";
import { AccessProvider } from "@/features/access/AccessProvider";
import { AppRoutes } from "./routes";

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
      Загружаем…
    </div>
  );
}

export function App() {
  return (
    <ThemeProvider>
      <AccessProvider>
        <BrowserRouter>
          <Suspense fallback={<RouteFallback />}>
            <AppRoutes />
          </Suspense>
        </BrowserRouter>
      </AccessProvider>
    </ThemeProvider>
  );
}
