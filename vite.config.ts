import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

const APP_VERSION = readFileSync(new URL("./VERSION", import.meta.url), "utf8").trim();

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  // Prevent vite from obscuring Rust errors
  clearScreen: false,
  server: {
    // Tauri expects a fixed port; fail if it is not available
    port: 1420,
    strictPort: true,
    watch: {
      // Tell vite to ignore watching src-tauri
      ignored: ["**/src-tauri/**"],
    },
  },
});
