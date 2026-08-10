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

export default defineConfig({
  server: {
    port: 8080,
    strictPort: false,
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
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
});
