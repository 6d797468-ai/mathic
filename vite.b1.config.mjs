import { resolve } from "node:path";

export default {
  root: resolve(import.meta.dirname, "src/b1/web"),
  base: "./",
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, "dist-b1"),
    emptyOutDir: true,
    assetsDir: "assets",
    rollupOptions: {
      input: "index.html",
      output: {
        entryFileNames: "b1-web.js",
        assetFileNames: "b1-web.[ext]",
      },
    },
  },
};