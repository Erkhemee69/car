import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  // Vercel дээр '/'-оор эхлэх нь зөв
  base: "/",
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // Assets-ийн замыг илүү найдвартай болгох
      "@assets": path.resolve(import.meta.dirname, "../../attached_assets"),
    },
  },
  // Root-ийг заавал хатуу заах шаардлагагүй, Vercel өөрөө олдог
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // CSS болон JS-ийг зөв баглах тохиргоо
    assetsDir: "assets",
  },
});