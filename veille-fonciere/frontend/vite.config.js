import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En dev, /api est relayé vers le serveur Python (python -m vf serve) pour enregistrer les notes dans SQLite.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { proxy: { "/api": "http://127.0.0.1:8765" } },
});
