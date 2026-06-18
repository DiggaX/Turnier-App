import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Allow vitest to resolve the server-only sentinel that Next.js injects
      // (the vi.mock("server-only", () => ({})) call in test files then
      // replaces it at runtime so the throw never fires in jsdom).
      "server-only": fileURLToPath(
        new URL(
          "./node_modules/next/dist/compiled/server-only/index.js",
          import.meta.url,
        ),
      ),
    },
  },
});
