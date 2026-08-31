import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The deployed backend. Override with VITE_API_TARGET if you run the API locally.
const API_TARGET =
  process.env.VITE_API_TARGET ??
  "https://fastapi-backend-production-6703.up.railway.app";

// All API calls go through /api and are proxied server-side, so the browser
// never makes a cross-origin request in dev — no CORS setup needed.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
