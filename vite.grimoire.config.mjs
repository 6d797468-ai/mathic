import { resolve } from "node:path";

export default {
  root: resolve(import.meta.dirname, "src/grimoire/web"),
  base: "./",
  publicDir: false,
  build: {
    outDir: resolve(import.meta.dirname, "dist-grimoire"),
    emptyOutDir: true,
    assetsDir: "assets",
    rollupOptions: {
      input: "index.html",
      output: {
        entryFileNames: "grimoire.js",
        assetFileNames: "grimoire.[ext]",
      },
    },
  },
};
