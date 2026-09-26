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
 * Opens the page with the OS emulated one way and, optionally, the app forced the
 * other (via the rib-theme cookie the toggle sets). `js: false` disables
 * JavaScript so what is measured is the pre-hydration first paint — the only way
 * to prove there is no flash of the wrong theme before the client runs.
 */
async function inspect(
  browser: Browser,
  { os, app, js = true }: { os: 'light' | 'dark'; app?: 'light' | 'dark'; js?: boolean },
): Promise<{ canvas: string; probe: string; attr: string | null }> {
  const url = new URL(BASE);
  const context = await browser.newContext({ colorScheme: os, javaScriptEnabled: js });
  if (app) {
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
  }
  const page = await context.newPage();
  // `load`, not `domcontentloaded`: it waits for the stylesheet, which matters
  // with JS disabled (no hydration to keep the connection busy) against a remote
  // deploy — otherwise body background is read before the CSS has applied.
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'load' });
  await page.waitForSelector('[data-theme-probe]', { state: 'attached', timeout: 10_000 });
  await page.waitForTimeout(300);

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
    const a = await inspect(browser, { os: 'dark', app: 'light' });
    check(a.attr === 'light', `html data-theme is "light" (${a.attr})`);
    check(a.canvas === LIGHT_CANVAS, `canvas is the light token (${a.canvas})`);
    check(a.probe === WHITE, `dark: does not leak — probe is white, not black (${a.probe})`);

    // Case B: OS light, app forced dark — the reverse.
    console.log('OS light · app dark   (the reverse):');
    const b = await inspect(browser, { os: 'light', app: 'dark' });
    check(b.attr === 'dark', `html data-theme is "dark" (${b.attr})`);
    check(b.canvas === DARK_CANVAS, `canvas is the dark token (${b.canvas})`);
    check(b.probe === BLACK, `dark: applies under the toggle — probe is black (${b.probe})`);

    // Case C: first visit, no saved preference, OS dark. Measured with JS off, so
    // this is the pre-hydration first paint: it must already be dark (follow the
    // OS) with no attribute set, i.e. no flash of light before the client runs.
    console.log('OS dark  · no preference, first paint (JS off):');
    const c = await inspect(browser, { os: 'dark', js: false });
    check(c.attr === null, `no data-theme attribute — "system" (${c.attr})`);
    check(c.canvas === DARK_CANVAS, `first paint follows OS dark (${c.canvas})`);
    check(c.probe === BLACK, `dark: applies under OS dark with no override (${c.probe})`);

    // Case D: first visit, no saved preference, OS light — the reverse first paint.
    console.log('OS light · no preference, first paint (JS off):');
    const d = await inspect(browser, { os: 'light', js: false });
    check(d.attr === null, `no data-theme attribute — "system" (${d.attr})`);
    check(d.canvas === LIGHT_CANVAS, `first paint follows OS light (${d.canvas})`);
    check(d.probe === WHITE, `dark: does not fire under OS light (${d.probe})`);

    // Case E: a SAVED preference opposite the OS must paint on the FIRST frame, not
    // only after hydration. Measured with JS off, so this is purely the server's
    // output: the theme must come from the cookie via SSR (data-theme on <html>),
    // not from a client script that would flash the OS theme first. Cookie dark,
    // OS light — the server must already say dark.
    console.log('OS light · saved dark, first frame (JS off):');
    const e = await inspect(browser, { os: 'light', app: 'dark', js: false });
    check(e.attr === 'dark', `SSR set data-theme="dark" from the cookie (${e.attr})`);
    check(e.canvas === DARK_CANVAS, `first frame is dark, not a flash of light (${e.canvas})`);
    check(e.probe === BLACK, `dark: applies on the first frame (${e.probe})`);

    // Case F: the reverse — cookie light, OS dark. The server must already say light.
    console.log('OS dark  · saved light, first frame (JS off):');
    const f = await inspect(browser, { os: 'dark', app: 'light', js: false });
    check(f.attr === 'light', `SSR set data-theme="light" from the cookie (${f.attr})`);
    check(f.canvas === LIGHT_CANVAS, `first frame is light, not a flash of dark (${f.canvas})`);
    check(f.probe === WHITE, `dark: does not fire on the first frame (${f.probe})`);
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
