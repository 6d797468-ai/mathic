/**
 * tests/runtime/offline.spec.mjs
 *
 * Test Playwright — Offline PWA (G0.5.5)
 *
 * Vérifie le cycle complet :
 *  1. App shell chargée en ligne
 *  2. SW enregistré et actif
 *  3. Réseau coupé (offline mode)
 *  4. Reload → app servie depuis cache SW
 *  5. Coup joué → résultat déterministe
 *  6. Momo fallback actif (pas de crash si LLM indisponible)
 *
 * Prérequis :
 *  - npm run build (produit dist/ avec sw.js versionné)
 *  - npm run serve:https (serveur HTTPS local sur port 4443)
 *  - npx playwright install chromium
 *
 * Usage :
 *  node scripts/https-server.mjs &
 *  npx playwright test tests/runtime/offline.spec.mjs
 *
 * Gate : G0.5.5
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.MATHIC_TEST_URL ?? 'https://localhost:4443';

// --- Configuration Playwright -----------------------------------------------

test.use({
  ignoreHTTPSErrors: true, // certificat auto-signé en local
  viewport: { width: 390, height: 844 }, // iPhone 14 viewport
});

// --- Helper : attendre que le SW soit actif ---------------------------------

async function waitForServiceWorker(page, timeoutMs = 15_000) {
  return page.evaluate(
    (timeout) =>
      new Promise((resolve, reject) => {
        const start = Date.now();
        const check = async () => {
          const regs = await navigator.serviceWorker.getRegistrations();
          const active = regs.find((r) => r.active);
          if (active) return resolve(active.active.scriptURL);
          if (Date.now() - start > timeout)
            return reject(new Error('SW non actif après ' + timeout + 'ms'));
          setTimeout(check, 500);
        };
        check();
      }),
    timeoutMs
  );
}

// --- Test 1 : SW enregistré et versionné ------------------------------------

test('G0.5.1 — SW enregistré avec VERSION concrète (pas placeholder)', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  const swUrl = await waitForServiceWorker(page);
  expect(swUrl).toContain('sw.js');

  // Lire le contenu du SW depuis la page et vérifier la VERSION
  const version = await page.evaluate(async () => {
    const res = await fetch('sw.js');
    const text = await res.text();
    const match = /const VERSION = '([^']+)'/.exec(text);
    return match ? match[1] : null;
  });

  expect(version).not.toBeNull();
  expect(version).not.toBe('__SW_VERSION__');
  expect(version).not.toBe('mathic-v2');
  expect(version).toMatch(/^mathic-v4-/);

  console.log(`✅ SW VERSION : ${version}`);
});

// --- Test 2 : Caches SW créés -----------------------------------------------

test('G0.5.1 — Caches SW créés avec noms versionnés', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await waitForServiceWorker(page);

  // Attendre que le SW installe et crée ses caches
  await page.waitForTimeout(2000);

  const cacheNames = await page.evaluate(() => caches.keys());

  expect(cacheNames.length).toBeGreaterThan(0);
  expect(cacheNames.some((n) => n.includes('mathic-v4'))).toBe(true);
  expect(cacheNames.some((n) => n.includes('mathic-v2'))).toBe(false);

  console.log('✅ Caches actifs :', cacheNames);
});

// --- Test 3 : App shell servie depuis cache (offline) -----------------------

test('G0.5.5 — App shell servie depuis cache SW en mode offline', async ({ page, context }) => {
  // Première visite en ligne pour peupler le cache
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await waitForServiceWorker(page);
  await page.waitForTimeout(2000); // laisser le SW terminer l'install

  // Couper le réseau
  await context.setOffline(true);

  // Recharger la page hors-ligne
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Vérifier que l'app shell est toujours là
  const title = await page.title();
  expect(title).toContain('MATHIC');

  const grid = page.locator('#grid');
  await expect(grid).toBeVisible({ timeout: 10_000 });

  console.log('✅ App shell servie depuis cache SW (offline)');
});

// --- Test 4 : Coup joué en offline ------------------------------------------

test('G0.5.5 — Coup jouable en mode offline (pas de crash)', async ({ page, context }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await waitForServiceWorker(page);
  await page.waitForTimeout(2000);

  // Couper le réseau
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  const grid = page.locator('#grid');
  await expect(grid).toBeVisible({ timeout: 10_000 });

  // Simuler un swipe (flèche directionnelle)
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(500);

  // Vérifier que la grille est toujours là (pas de crash)
  await expect(grid).toBeVisible();

  // Vérifier que le score est affiché (game loop active)
  const score = page.locator('#score');
  await expect(score).toBeVisible();

  console.log('✅ Coup jouable en offline');
});

// --- Test 5 : Momo fallback (pas de crash si LLM indisponible) -------------

test('G0.5.4 — Coach text visible sans crash LLM', async ({ page, context }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await waitForServiceWorker(page);
  await page.waitForTimeout(2000);

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Le coach text doit exister dans le DOM (fallback scripté)
  const coachText = page.locator('#coach-text');
  await expect(coachText).toBeVisible({ timeout: 10_000 });

  // Ne doit pas contenir de message d'erreur
  const text = await coachText.textContent();
  expect(text).not.toContain('undefined');
  expect(text).not.toContain('Error');
  expect(text?.length).toBeGreaterThan(0);

  console.log(`✅ Coach fallback actif : "${text?.slice(0, 60)}..."`);
});
