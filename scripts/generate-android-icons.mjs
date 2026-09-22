/**
 * scripts/generate-android-icons.mjs — génère les assets natifs Android
 * (mipmaps adaptatives + splash) depuis public/icons/icon-512.png.
 *
 * Usage : node scripts/generate-android-icons.mjs
 * (devDep : sharp) — reproductible, rien d'autre n'est modifié.
 */
import sharp from 'sharp';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RUN = await promisify(execFile)('git', ['rev-parse', '--show-toplevel'], { cwd: import.meta.dirname });
const ROOT = RUN.stdout.trim();
const SRC = path.join(ROOT, 'public/icons/icon-512.png');
const RES = path.join(ROOT, 'android/app/src/main/res');

const THEME = { r: 0x1a, g: 0x1d, b: 0x29 }; // fond sombre du jeu (#1a1d29)

// Tuiles héritées (launcher/round) : icône entière à la taille cible.
const LEGACY = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];

// Foreground adaptatif : logo cadré dans la zone sûre du masque (66/108).
const FOREGROUND = [
  ['mipmap-mdpi', 108],
  ['mipmap-hdpi', 162],
  ['mipmap-xhdpi', 216],
  ['mipmap-xxhdpi', 324],
  ['mipmap-xxxhdpi', 432],
];

async function canvas(width, height, { bg = null } = {}) {
  const background = bg
    ? { r: bg.r, g: bg.g, b: bg.b, alpha: 255 }
    : { r: 0, g: 0, b: 0, alpha: 0 };
  return sharp({
    create: { width, height, channels: 4, background },
  });
}

async function logo(size) {
  return sharp(SRC).resize(size, size, { fit: 'inside' }).toBuffer();
}

async function centered(canvas, layer) {
  return canvas
    .composite([{ input: layer, gravity: 'center' }])
    .png()
    .toBuffer();
}

/**
 * Génère un PNG splash aux dimensions exactes des variantes du template
 * (fond sombre + logo centré à ~55 % du petit côté).
 */
async function writeSplash(relDir) {
  const matches = fs.readdirSync(relDir).filter((f) => f === 'splash.png');
  for (const name of matches) {
    const file = path.join(relDir, name);
    const meta = await sharp(file).metadata();
    const logoPx = Math.round(Math.min(meta.width, meta.height) * 0.55);
    const buf = await centered(
      await canvas(meta.width, meta.height, { bg: THEME }),
      await logo(logoPx),
    );
    fs.writeFileSync(file, buf);
    console.log('splash', meta.width + 'x' + meta.height, '<-', path.relative(ROOT, file));
  }
}

async function main() {
  for (const [folder, size] of LEGACY) {
    const dir = path.join(RES, folder);
    const buf = await centered(await canvas(size, size), await logo(size));
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), buf);
    fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), buf);
    console.log('legacy', size, '<-', folder);
  }

  for (const [folder, size] of FOREGROUND) {
    const dir = path.join(RES, folder);
    const logoPx = Math.round(size * 0.56); // zone sûre 66/108
    const buf = await centered(await canvas(size, size), await logo(logoPx));
    fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), buf);
    console.log('foreground', size, '<-', folder);
  }

  // Logo dédié au splash Jetpack (windowSplashScreenAnimatedIcon).
  fs.writeFileSync(
    path.join(RES, 'drawable/splash_logo.png'),
    await centered(await canvas(288, 288), await logo(164)),
  );
  console.log('drawable/splash_logo.png <- 288px');

  // Variantes splash du template (portrait/land). Portrait = layout lock.
  for (const entry of fs.readdirSync(RES)) {
    if (entry.startsWith('drawable')) await writeSplash(path.join(RES, entry));
  }
  await writeSplash(RES);

  console.log('OK — assets natifs générés depuis icon-512.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});