import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export const config = defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./", import.meta.url)) },
  },
  test: {
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules/**", ".next/**", ".claude/**"],
  },
});

export default config;
