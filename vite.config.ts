import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  if (command === "build") {
    const env = loadEnv(mode, ".", "VITE_");
    const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"].filter(
      (name) => !env[name]?.trim(),
    );
    if (missing.length) {
      throw new Error(
        `Cannot build: missing ${missing.join(", ")}. Configure these in .env.local or the build environment before deploying.`,
      );
    }
  }

  return {
    plugins: [react()],
    optimizeDeps: {
      exclude: ["lucide-react"],
    },
  };
});
