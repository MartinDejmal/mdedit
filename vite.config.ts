import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
