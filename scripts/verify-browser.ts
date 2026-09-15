/**
 * Cold-loads the app in a real browser and checks that the pages arrive.
 *
 *   npm run build && npm run start          # in one terminal
 *   npm run verify:browser                   # in another
 *   npm run verify:browser -- https://richinvestor.netlify.app
 *
 * It signs in as a real person, so it needs an account: put VERIFY_EMAIL and
 * VERIFY_PASSWORD in `.env.local`, which the npm script already loads. Use a
 * whitelisted address with a password set on the account page — a magic link
 * cannot be replayed from a script, which is the whole reason the password
 * route exists.
 *
 * Why this exists, when there are already 494 unit tests, a type check, a
 * linter and a production build: every one of those passed, on every commit,
 * through a week in which every hard page load on production hung on a loading
 * skeleton for ever. They could not have caught it. The server render was
 * correct, the HTML contained the data, and the failure was entirely in what
 * the client did with it afterwards.
 *
 * The same gap has caught, since: a web manifest that redirected to the login
 * page so the app could never be installed; formatter functions passed into a
 * client component, twice, each taking a whole page down; a metric card
 * printing a target of 20 beside a setting of 15. In every case the suite was
 * green. So this is not a nice-to-have alongside the tests — it is the only
 * check that looks at what a person actually sees.
 *
 * Deliberately shallow: it signs in, opens each page cold, and asks whether
 * real content arrived rather than a skeleton, plus whether the browser
 * complained. It is not a functional test suite and should not grow into one —
 * the things it guards against are failures of arrival, not of behaviour.
 */
import { existsSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext } from 'playwright-core';

const BASE = process.argv[2] ?? process.env.VERIFY_BASE ?? 'http://localhost:3000';
const EMAIL = process.env.VERIFY_EMAIL ?? '';
const PASSWORD = process.env.VERIFY_PASSWORD ?? '';

/**
 * The installed browser, rather than one downloaded by Playwright.
 *
 * `playwright-core` ships no browsers, which keeps this a small dependency;
 * the trade is that the machine needs a Chrome, which any machine running this
 * app for a person already has.
 */
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((path): path is string => typeof path === 'string' && path.length > 0);

/** The pages worth checking: every one that reads data behind the login. */
const ROUTES = ['/', '/stock/ADBE', '/suggestions', '/compare', '/account', '/search?q=SAP'];

/** How long to give hydration before calling a skeleton a hang. */
const SETTLE_MS = 6_000;

const unesc = (s: string) =>
  s.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;/g, "'");

let failures = 0;
const check = (ok: boolean, message: string) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${message}`);
  if (!ok) failures++;
};

/**
 * Signs in over HTTP and returns the cookies, rather than driving the form.
 *
 * The sign-in form posts a server action whose hidden fields change with every
 * build, so replaying them is both simpler and less brittle than filling in a
 * form whose markup is not what is being tested.
 */
async function sessionCookies(): Promise<Array<Record<string, unknown>>> {
  const page = await fetch(`${BASE}/login`);
  const html = await page.text();
  const seed = (page.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

  const fields = [...html.matchAll(/<input type="hidden" name="([^"]+)"(?: value="([^"]*)")?\/>/g)]
    .map((m) => [unesc(m[1]), m[2] === undefined ? '' : unesc(m[2])] as const)
    .filter(([name]) => /^\$ACTION_(REF_\d+|\d+:\d+|KEY)$/.test(name));

  const form = new FormData();
  for (const [key, value] of fields) form.append(key, value);
  form.append('email', EMAIL);
  form.append('password', PASSWORD);
  form.append('intent', 'password');

  const res = await fetch(`${BASE}/login`, {
    method: 'POST',
    body: form,
    redirect: 'manual',
    headers: { origin: BASE, referer: `${BASE}/login`, cookie: seed },
  });

  const raw = res.headers.getSetCookie?.() ?? [];
  if (!raw.some((c) => /^sb-/.test(c))) {
    throw new Error(
      `sign-in failed (HTTP ${res.status}). Set VERIFY_EMAIL and VERIFY_PASSWORD to an allowed account.`,
    );
  }

  const url = new URL(BASE);
  return raw.map((cookie) => {
    const [pair] = cookie.split(';');
    const equals = pair.indexOf('=');
    return {
      name: pair.slice(0, equals),
      value: pair.slice(equals + 1),
      domain: url.hostname,
      path: '/',
      secure: url.protocol === 'https:',
      sameSite: 'Lax' as const,
    };
  });
}

async function run(): Promise<void> {
  if (!EMAIL || !PASSWORD) {
    console.error('Set VERIFY_EMAIL and VERIFY_PASSWORD to an account allowed to sign in.');
    process.exit(2);
  }

  const executablePath = CHROME_CANDIDATES.find((path) => existsSync(path));
  if (!executablePath) {
    console.error(
      'No Chrome found. Set CHROME_PATH to a Chrome or Chromium binary; this uses the installed browser rather than downloading one.',
    );
    process.exit(2);
  }

  console.log(`Cold-loading ${BASE} in ${executablePath}\n`);

  let browser: Browser | undefined;
  let context: BrowserContext | undefined;

  try {
    browser = await chromium.launch({ executablePath, headless: true });
    context = await browser.newContext();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await context.addCookies((await sessionCookies()) as any);

    for (const route of ROUTES) {
      const page = await context.newPage();
      const problems: string[] = [];
      page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() === 'error') problems.push(`console: ${message.text()}`);
      });

      const started = Date.now();
      await page.goto(`${BASE}${route}`, { waitUntil: 'load', timeout: 45_000 });
      await page.waitForTimeout(SETTLE_MS);

      const state = await page.evaluate(() => {
        const main = document.querySelector('main');
        return {
          busy: main?.getAttribute('aria-busy') === 'true',
          skeletons: document.querySelectorAll('.animate-pulse').length,
          text: (main?.innerText ?? '').trim(),
        };
      });

      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`=== ${route} (${seconds}s) ===`);
      for (const line of state.text.split('\n').filter(Boolean).slice(0, 3)) {
        console.log(`    | ${line.slice(0, 100)}`);
      }

      // A page still showing its loading fallback after six seconds is the
      // failure this whole script exists for: it never arrived, and nothing
      // else in the toolchain can tell.
      check(!state.busy && state.skeletons === 0, 'the page rendered rather than hanging on its skeleton');
      check(state.text.length > 40, 'it has real content');
      check(problems.length === 0, `no browser errors${problems.length ? `: ${problems[0].slice(0, 120)}` : ''}`);

      await page.close();
    }
  } finally {
    await context?.close();
    await browser?.close();
  }

  console.log(`\n${failures === 0 ? 'All pages arrived.' : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

await run();
