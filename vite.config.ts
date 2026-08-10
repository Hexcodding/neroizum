import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "node:path";

// Разбиение бандла на части задано вручную: в предыдущей версии всё
// собиралось одним куском на 858 КБ, и первая загрузка страдала целиком
// из-за библиотек, которые нужны не на первом экране.
const vendorChunks: Record<string, readonly string[]> = {
  "vendor-react": ["react", "react-dom", "scheduler"],
  "vendor-router": ["react-router", "react-router-dom"],
  "vendor-ui": ["@radix-ui", "lucide-react", "class-variance-authority"],
};

function resolveChunk(moduleId: string): string | undefined {
  if (!moduleId.includes("node_modules")) return undefined;
  const normalized = moduleId.replace(/\\/g, "/");
  for (const [chunkName, packages] of Object.entries(vendorChunks)) {
    if (packages.some((pkg) => normalized.includes(`node_modules/${pkg}`))) {
      return chunkName;
    }
  }
  return "vendor";
}

export default defineConfig(({ mode }) => ({
  // Признак админской сборки задаётся режимом, а не файлом окружения: файл
  // окружения легко забыть на боевом сервере и выложить панель управления
  // вместе с приложением для клиентов. Режим виден прямо в команде сборки.
  //
  // В разработке панель доступна всегда — иначе её не проверить локально.
  // Значение подставляется строкой, поэтому в клиентской сборке ветка с
  // загрузкой панели становится недостижимой и её код в бандл не входит.
  define: {
    "import.meta.env.VITE_ADMIN": JSON.stringify(
      mode === "admin" || mode === "development" ? "on" : "",
    ),
  },
  server: {
    port: 8080,
    strictPort: false,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@contracts": path.resolve(import.meta.dirname, "./contracts"),
    },
  },
  build: {
    // Карта исходников в продакшене не публикуется: она восстанавливает
    // исходный код, а вместе с ним и границу «клиент не видит сервер».
    sourcemap: false,
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        manualChunks: resolveChunk,
      },
    },
  },
}));
