/**
 * Copies Next.js prerendered pages into the Workers static-assets directory so Cloudflare serves
 * them straight from the edge, without invoking the Worker. On the Workers Free plan a cold isolate
 * can exceed the 10 ms CPU limit while loading the Next.js handler ("Worker exceeded CPU time
 * limit"); static assets never run the Worker, so prerendered pages always load on first request.
 *
 * Also writes an `_headers` file so those pages keep the security headers/CSP from next.config
 * (Next's `headers()` only applies to responses rendered by the Worker).
 *
 * Runs as the wrangler custom build (wrangler.jsonc → build.command), i.e. right before every
 * `wrangler deploy` / `opennextjs-cloudflare deploy`. It is a no-op when there is no build output.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKIP_ROUTES = new Set(['/_not-found', '/_global-error']);
const MAX_HEADER_RULES = 90; // Cloudflare allows 100 rules per _headers file

/** Maps a route to its asset file, e.g. `/` → `index.html`, `/collections/x` → `collections/x.html`. */
export function routeToAssetPath(route) {
  if (route === '/') return 'index.html';
  const clean = route.replace(/^\/+|\/+$/g, '');
  if (!clean || clean.split('/').some((s) => s === '..' || s === '.' || s === '')) return null;
  return path.posix.extname(clean) ? clean : `${clean}.html`;
}

/** Prerendered routes that are fully static and safe to serve as plain files. */
export function staticRoutes(prerenderManifest) {
  return Object.entries(prerenderManifest.routes || {})
    .filter(([route, info]) =>
      !SKIP_ROUTES.has(route) &&
      !route.startsWith('/api') &&
      !route.startsWith('/studio') &&
      info &&
      info.initialRevalidateSeconds === false &&
      (info.initialStatus === undefined || info.initialStatus === 200) &&
      !info.experimentalPPR &&
      !info.renderingMode)
    .map(([route]) => route)
    .sort();
}

/** Headers next.config's `headers()` would add for `route` (rules with has/missing are skipped). */
export function headersForRoute(route, routesManifest) {
  const out = new Map();
  for (const rule of routesManifest.headers || []) {
    if (rule.has || rule.missing) continue;
    if (!new RegExp(rule.regex).test(route)) continue;
    for (const { key, value } of rule.headers) out.set(key, value);
  }
  return out;
}

export function buildHeadersFile(routes, routesManifest) {
  const blocks = [];
  const emit = (pattern, headers) => {
    if (!headers.size) return;
    blocks.push([pattern, ...[...headers].map(([k, v]) => `  ${k}: ${v}`)].join('\n'));
  };
  if (routes.length <= MAX_HEADER_RULES) {
    for (const route of routes) emit(route, headersForRoute(route, routesManifest));
  } else {
    emit('/*', headersForRoute('/', routesManifest));
  }
  return blocks.length ? `${blocks.join('\n\n')}\n` : '';
}

export function run(root = process.cwd(), log = console.log) {
  const nextDir = path.join(root, '.next');
  const assetsDir = path.join(root, '.open-next', 'assets');
  const prerenderPath = path.join(nextDir, 'prerender-manifest.json');
  const routesPath = path.join(nextDir, 'routes-manifest.json');
  if (!fs.existsSync(assetsDir) || !fs.existsSync(prerenderPath) || !fs.existsSync(routesPath)) {
    log('[static-html-assets] no build output found; skipping');
    return { copied: [] };
  }
  const prerender = JSON.parse(fs.readFileSync(prerenderPath, 'utf8'));
  const routesManifest = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
  const appDir = path.join(nextDir, 'server', 'app');

  const copied = [];
  for (const route of staticRoutes(prerender)) {
    const target = routeToAssetPath(route);
    if (!target) continue;
    const isHtml = target.endsWith('.html');
    const rel = route === '/' ? 'index' : route.replace(/^\//, '');
    const source = path.join(appDir, isHtml ? `${rel}.html` : `${rel}.body`);
    const dest = path.join(assetsDir, ...target.split('/'));
    if (!fs.existsSync(source)) continue;
    if (fs.existsSync(path.join(root, 'public', ...target.split('/')))) continue; // never shadow public/ files
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(source, dest);
    copied.push(route);
  }

  const headers = buildHeadersFile(copied, routesManifest);
  if (headers) {
    const headersPath = path.join(assetsDir, '_headers');
    const existing = fs.existsSync(headersPath) ? fs.readFileSync(headersPath, 'utf8') : '';
    const marker = '# static-html-assets';
    const base = existing.split(marker)[0].trimEnd();
    fs.writeFileSync(headersPath, `${base ? `${base}\n\n` : ''}${marker}\n${headers}`);
  }
  log(`[static-html-assets] serving ${copied.length} prerendered routes as static assets`);
  return { copied };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run();
}
