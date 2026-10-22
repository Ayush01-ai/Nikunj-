import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildHeadersFile, routeToAssetPath, run, staticRoutes } from '../scripts/static-html-assets.mjs';

const routesManifest = {
  headers: [
    { source: '/(.*)', regex: '^(?:/(.*))(?:/)?$', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }] },
    { source: '/((?!studio).*)', regex: '^(?:/((?!studio).*))(?:/)?$', headers: [{ key: 'Content-Security-Policy', value: "default-src 'self'" }] },
    { source: '/api/:path*', regex: '^/api(?:/(.*))?(?:/)?$', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
  ],
};
const page = { initialRevalidateSeconds: false };

describe('static-html-assets', () => {
  let tmp = '';
  afterEach(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    tmp = '';
  });

  it('maps routes to flat asset files', () => {
    expect(routeToAssetPath('/')).toBe('index.html');
    expect(routeToAssetPath('/collections')).toBe('collections.html');
    expect(routeToAssetPath('/collections/deity-shringar/haar')).toBe('collections/deity-shringar/haar.html');
    expect(routeToAssetPath('/robots.txt')).toBe('robots.txt');
    expect(routeToAssetPath('/a/../b')).toBeNull();
  });

  it('only selects fully static, non-internal routes', () => {
    const routes = staticRoutes({
      routes: {
        '/': page,
        '/_not-found': page,
        '/_global-error': page,
        '/isr': { initialRevalidateSeconds: 60 },
        '/missing': { ...page, initialStatus: 404 },
        '/studio': page,
        '/products/x': page,
      },
    });
    expect(routes).toEqual(['/', '/products/x']);
  });

  it('carries the next.config security headers into _headers', () => {
    const out = buildHeadersFile(['/', '/login'], routesManifest);
    expect(out).toContain("/\n  X-Content-Type-Options: nosniff\n  Content-Security-Policy: default-src 'self'");
    expect(out).toContain('/login\n');
    expect(out).not.toContain('no-store');
  });

  it('copies prerendered pages into the assets dir and is a no-op without build output', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'static-html-'));
    const log = () => undefined;
    expect(run(tmp, log).copied).toEqual([]);

    const app = path.join(tmp, '.next', 'server', 'app');
    fs.mkdirSync(path.join(app, 'collections'), { recursive: true });
    fs.mkdirSync(path.join(tmp, '.open-next', 'assets'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'public'), { recursive: true });
    fs.writeFileSync(path.join(app, 'index.html'), '<h1>home</h1>');
    fs.writeFileSync(path.join(app, 'collections', 'poshak.html'), '<h1>poshak</h1>');
    fs.writeFileSync(path.join(app, 'robots.txt.body'), 'User-agent: *');
    fs.writeFileSync(path.join(app, 'contact.html'), '<h1>contact</h1>');
    fs.writeFileSync(path.join(tmp, 'public', 'contact.html'), 'custom');
    fs.writeFileSync(
      path.join(tmp, '.next', 'prerender-manifest.json'),
      JSON.stringify({ routes: { '/': page, '/collections/poshak': page, '/robots.txt': page, '/contact': page, '/gone': page } }),
    );
    fs.writeFileSync(path.join(tmp, '.next', 'routes-manifest.json'), JSON.stringify(routesManifest));

    const { copied } = run(tmp, log);
    expect(copied).toEqual(['/', '/collections/poshak', '/robots.txt']);
    const assets = path.join(tmp, '.open-next', 'assets');
    expect(fs.readFileSync(path.join(assets, 'index.html'), 'utf8')).toBe('<h1>home</h1>');
    expect(fs.readFileSync(path.join(assets, 'collections', 'poshak.html'), 'utf8')).toBe('<h1>poshak</h1>');
    expect(fs.readFileSync(path.join(assets, 'robots.txt'), 'utf8')).toBe('User-agent: *');
    expect(fs.existsSync(path.join(assets, 'contact.html'))).toBe(false);

    // Re-running (e.g. wrangler dev then deploy) keeps a single generated _headers section.
    run(tmp, log);
    const headers = fs.readFileSync(path.join(assets, '_headers'), 'utf8');
    expect(headers.match(/# static-html-assets/g)).toHaveLength(1);
    expect(headers).toContain('/collections/poshak\n  X-Content-Type-Options: nosniff');
  });
});
