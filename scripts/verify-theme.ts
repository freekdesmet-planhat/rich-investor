/**
 * Proves the theme follows the toggle, not the operating system (round 2, item 7).
 *
 *   npm run build && npm run start           # in one terminal
 *   npm run verify:theme                      # in another
 *   npm run verify:theme -- https://<preview>.netlify.app
 *
 * The bug this guards against: Tailwind's `dark:` variant compiles, by default,
 * to `@media (prefers-color-scheme: dark)` — so with the OS in dark mode and the
 * app forced to light, every `dark:` utility fired anyway and painted dark styles
 * onto a light page. globals.css now rebinds `dark:` to the `data-theme` attribute
 * the toggle sets, so the two must agree regardless of the OS.
 *
 * It emulates the OS in dark while the app is forced light, and the reverse, and
 * reads two things on each: the page's own canvas (a token, always data-theme
 * bound) and the hidden `[data-theme-probe]` in the root layout, whose one job is
 * to carry a real `dark:` utility (`bg-white dark:bg-black`). If the binding ever
 * regresses to the OS query, the probe stops following the toggle — white turns
 * black on the light page, or stays white on the dark one — and this fails.
 *
 * The probe and canvas live in the root layout, so the binding is the same on
 * every page; this loads the public /login page and needs no sign-in.
 */
import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright-core';

const BASE = process.argv[2] ?? process.env.VERIFY_BASE ?? 'http://localhost:3000';
const ROUTE = process.env.VERIFY_THEME_ROUTE ?? '/login';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((path): path is string => typeof path === 'string' && path.length > 0);

// The canvas token in each theme (globals.css), and the probe's two ends.
const LIGHT_CANVAS = 'rgb(255, 255, 255)'; // #ffffff
const DARK_CANVAS = 'rgb(19, 18, 16)'; //   #131210
const WHITE = 'rgb(255, 255, 255)';
const BLACK = 'rgb(0, 0, 0)';

let failures = 0;
const check = (ok: boolean, message: string) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${message}`);
  if (!ok) failures++;
};

/**
 * Opens the page with the OS emulated one way and the app forced the other (via
 * the rib-theme cookie the toggle sets), and reads the canvas + probe colours.
 */
async function inspect(
  browser: Browser,
  os: 'light' | 'dark',
  app: 'light' | 'dark',
): Promise<{ canvas: string; probe: string; attr: string | null }> {
  const url = new URL(BASE);
  const context = await browser.newContext({ colorScheme: os });
  await context.addCookies([
    {
      name: 'rib-theme',
      value: app,
      domain: url.hostname,
      path: '/',
      secure: url.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);
  const page = await context.newPage();
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-theme-probe]', { state: 'attached', timeout: 10_000 });

  const result = await page.evaluate(() => {
    const probeEl = document.querySelector('[data-theme-probe]');
    return {
      canvas: getComputedStyle(document.body).backgroundColor,
      probe: probeEl ? getComputedStyle(probeEl).backgroundColor : 'none',
      attr: document.documentElement.getAttribute('data-theme'),
    };
  });
  await context.close();
  return result;
}

async function run(): Promise<void> {
  const executablePath = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!executablePath) {
    console.error('No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary.');
    process.exit(2);
  }

  console.log(`Theme binding check against ${BASE}${ROUTE}\n`);
  const browser = await chromium.launch({ executablePath });

  try {
    // Case A: OS dark, app forced light — the page must stay light and no dark:
    // utility may fire (the probe stays white).
    console.log('OS dark  · app light  (the original bug):');
    const a = await inspect(browser, 'dark', 'light');
    check(a.attr === 'light', `html data-theme is "light" (${a.attr})`);
    check(a.canvas === LIGHT_CANVAS, `canvas is the light token (${a.canvas})`);
    check(a.probe === WHITE, `dark: does not leak — probe is white, not black (${a.probe})`);

    // Case B: OS light, app forced dark — the reverse.
    console.log('OS light · app dark   (the reverse):');
    const b = await inspect(browser, 'light', 'dark');
    check(b.attr === 'dark', `html data-theme is "dark" (${b.attr})`);
    check(b.canvas === DARK_CANVAS, `canvas is the dark token (${b.canvas})`);
    check(b.probe === BLACK, `dark: applies under the toggle — probe is black (${b.probe})`);
  } finally {
    await browser.close();
  }

  console.log(
    `\n${failures === 0 ? 'OK — theme follows the toggle, not the OS.' : `${failures} FAILED`}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
