/**
 * vite.config.mjs — Configuration de build MATHIC
 *
 * `base: './'` : assets RELATIFS. L'app fonctionne aussi bien à la racine
 * d'un domaine (ex. Netlify/Vercel) que sous un sous-chemin (ex. GitHub
 * Pages → https://<org>.github.io/mathic/), sans rien câbler en dur.
 */

export default {
  base: './',
  build: {
    assetsDir: 'assets',
  },
};