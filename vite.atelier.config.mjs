import { resolve } from "node:path";

export default {
  root: resolve(import.meta.dirname, "src/atelier/web"),
  base: "./",
  publicDir: resolve(import.meta.dirname, "src/atelier/web/public"),
  build: {
    outDir: resolve(import.meta.dirname, "dist-atelier"),
    emptyOutDir: true,
    assetsDir: "assets",
    rollupOptions: {
      input: "index.html",
      output: {
        entryFileNames: "atelier.js",
        assetFileNames: "atelier.[ext]",
      },
    },
  },
};