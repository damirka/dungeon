import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { mapperApi } from "./tools/mapperApi.mjs";

export default defineConfig({
  plugins: [react(), tailwindcss(), mapperApi()],
  build: {
    assetsDir: "app-assets"
  },
  server: {
    host: "::",
    port: 5173,
    watch: {
      ignored: ["**/data/**"]
    }
  }
});
