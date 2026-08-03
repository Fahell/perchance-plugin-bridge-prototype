import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  define: {
    __BUILD_COMMIT__: JSON.stringify(process.env.GITHUB_SHA ?? "local"),
  },
  build: {
    lib: {
      entry: resolve(import.meta.dirname, "src/main.ts"),
      formats: ["es"],
      fileName: () => "main.bundle.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    minify: "esbuild",
    target: "es2022",
    sourcemap: false,
    emptyOutDir: true,
  },
});
