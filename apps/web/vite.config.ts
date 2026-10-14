import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy dev verso il runtime Omnicore (server.py, default http://127.0.0.1:8100).
// Override: OMNICORE_API_URL=http://127.0.0.1:8100 npm run dev
const target =
  process.env["OMNICORE_API_URL"] ?? "http://127.0.0.1:8100";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target, changeOrigin: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
