import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Connect } from 'vite';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = fileURLToPath(new URL('.', import.meta.url));
const BASE = '/xray-lab/';

let gitHash = 'dev';
try {
  gitHash = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch { /* not a checkout */ }

/**
 * Serves core binaries at `<base>xray-wasm/` in dev and preview, from the
 * library's own build output next to this repo (`../xray-wasm/dist-wasm`) or
 * from XRAY_WASM_DIR. Used by `bun run dev:local` (which points
 * VITE_XRAY_WASM_BASE there); by default the site loads the cores from the
 * library's GitHub Pages. Nothing is copied into this repo.
 */
const TYPES: Record<string, string> = {
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
};
const localWasm = (): Plugin => {
  const dir = process.env.XRAY_WASM_DIR
    ? resolve(process.env.XRAY_WASM_DIR)
    : resolve(root, '../xray-wasm/dist-wasm');
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const url = (req.url ?? '/').split('?')[0] ?? '/';
    const file = normalize(join(dir, decodeURIComponent(url)));
    if (!file.startsWith(dir + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.setHeader('Content-Length', String(statSync(file).size));
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-cache');
    createReadStream(file).pipe(res);
  };
  return {
    name: 'xray-lab:local-wasm',
    configureServer(server) {
      if (existsSync(dir)) server.middlewares.use(`${BASE}xray-wasm`, middleware);
    },
    configurePreviewServer(server) {
      if (existsSync(dir)) server.middlewares.use(`${BASE}xray-wasm`, middleware);
    },
  };
};

/**
 * When the library is installed from a local checkout (`bun add ../xray-wasm`)
 * the package is a link to a folder outside this repo; Vite serves files from
 * there (the worker module) only when allowed.
 */
const fsAllow = [root];
try {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>;
  const spec = pkg.optionalDependencies?.['xray-wasm'] ?? pkg.dependencies?.['xray-wasm'] ?? '';
  if (spec.startsWith('file:') && !spec.endsWith('.tgz')) fsAllow.push(resolve(root, spec.slice('file:'.length)));
  fsAllow.push(realpathSync(join(root, 'node_modules/xray-wasm')));
} catch { /* not installed */ }

export default defineConfig({
  base: BASE,
  plugins: [localWasm(), react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(`${process.env.npm_package_version ?? '0.0.0'}-${gitHash}`),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  worker: { format: 'es' },
  // The library starts its worker with `new Worker(new URL('./worker.js',
  // import.meta.url))`; pre-bundling would move it away from worker.js.
  optimizeDeps: { exclude: ['xray-wasm'] },
  server: { port: 5199, fs: { allow: fsAllow } },
  preview: { port: 4199 },
});
