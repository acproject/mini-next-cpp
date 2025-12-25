const path = require('path');
const fs = require('fs');
const Module = require('module');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const express = require('express');
const { renderPage } = require('./renderer');
const { runWithStyleRegistry } = require('./css');

function loadNativeAddon() {
  const candidates = [
    path.join(process.cwd(), 'build', 'Release', 'mini_next.node'),
    path.join(__dirname, '..', 'build', 'Release', 'mini_next.node'),
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      return require(filePath);
    }
  }
  throw new Error('Cannot find native addon at build/Release/mini_next.node');
}

function pickRenderer(native, options = {}) {
  const mode = String(options.ssrMode || process.env.SSR_MODE || 'js');
  if (mode === 'native') {
    return {
      mode: 'native',
      renderToString: (modulePath, props) => native.renderToString(modulePath, JSON.stringify(props || {})),
    };
  }
  return {
    mode: 'js',
    renderToString: (Component, props, renderOptions) => renderPage(Component, props, renderOptions),
  };
}

function createPagesCompiler(pagesDir) {
  const babel = require('@babel/core');
  const compiledByFilename = new Map();
  const watchedPrefix = path.resolve(pagesDir) + path.sep;
  const originalJsExtension = Module._extensions['.js'];
  const originalJsxExtension = Module._extensions['.jsx'];
  const originalTsExtension = Module._extensions['.ts'];
  const originalTsxExtension = Module._extensions['.tsx'];
  const cacheDir = path.join(process.cwd(), '.mini-next', 'pages-cache');
  const useNativeJsxCompiler = String(process.env.JSX_COMPILER || '') === 'native';
  let nativeJsx = null;
  if (useNativeJsxCompiler) {
    try {
      const n = loadNativeAddon();
      if (n && typeof n.jsxToJsModule === 'function') {
        nativeJsx = n;
      }
    } catch (_) {
      nativeJsx = null;
    }
  }

  function isUnderPagesDir(filename) {
    const abs = path.resolve(filename);
    return abs === path.resolve(pagesDir) || abs.startsWith(watchedPrefix);
  }

  function isInNodeModules(filename) {
    const abs = path.resolve(filename);
    return abs.includes(`${path.sep}node_modules${path.sep}`);
  }

  function hashSource(source) {
    return crypto.createHash('sha1').update(source).digest('hex');
  }

  function ensureCacheDir() {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  function writeFileAtomic(filePath, content) {
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, filePath);
  }

  function outputPathFor(filename, sourceHash) {
    const abs = path.resolve(filename);
    const fileId = hashSource(abs).slice(0, 12);
    return path.join(cacheDir, `${fileId}-${sourceHash.slice(0, 12)}.cjs`);
  }

  function purgeDiskCacheFor(filename) {
    try {
      if (!fs.existsSync(cacheDir)) return;
      const abs = path.resolve(filename);
      const fileId = hashSource(abs).slice(0, 12);
      const prefix = `${fileId}-`;
      const entries = fs.readdirSync(cacheDir);
      for (const name of entries) {
        if (!name.startsWith(prefix)) continue;
        if (!name.endsWith('.cjs')) continue;
        try {
          fs.rmSync(path.join(cacheDir, name), { force: true });
        } catch (_) {
        }
      }
    } catch (_) {
    }
  }

  function compile(filename) {
    const stat = fs.statSync(filename);
    const mtimeMs = Number(stat.mtimeMs || 0);
    const cached = compiledByFilename.get(filename);
    if (cached && cached.mtimeMs === mtimeMs) {
      return cached.code;
    }

    const source = fs.readFileSync(filename, 'utf8');
    const sourceHash = hashSource(source);

    const ext = String(path.extname(filename) || '').toLowerCase();
    const isTs = ext === '.ts' || ext === '.tsx';
    const isTsx = ext === '.tsx';
    const isJsx = ext === '.jsx' || ext === '.tsx';
    const isJsxFile = ext === '.jsx';

    const outPath = outputPathFor(filename, sourceHash);
    if (fs.existsSync(outPath)) {
      const code = fs.readFileSync(outPath, 'utf8');
      compiledByFilename.set(filename, { mtimeMs, sourceHash, code, outPath });
      return code;
    }

    let input = source;
    let usedNativeJsx = false;
    if (nativeJsx && isJsxFile) {
      input = nativeJsx.jsxToJsModule(source);
      usedNativeJsx = true;
    }

    const presets = [
      [require.resolve('@babel/preset-env'), { targets: { node: 'current' }, modules: 'commonjs' }],
    ];
    if (isTs) {
      presets.push([require.resolve('@babel/preset-typescript'), { isTSX: isTsx && !usedNativeJsx, allExtensions: true }]);
    }
    if (!usedNativeJsx && (isJsx || ext === '.js')) {
      presets.push([require.resolve('@babel/preset-react'), { runtime: 'automatic' }]);
    }

    const out = babel.transformSync(input, {
      filename,
      babelrc: false,
      configFile: false,
      presets,
      sourceMaps: false,
      comments: false,
      compact: false,
    });
    const code = String(out && out.code ? out.code : '');
    ensureCacheDir();
    try {
      if (cached && cached.outPath && cached.outPath !== outPath) {
        fs.rmSync(cached.outPath, { force: true });
      }
      writeFileAtomic(outPath, code);
    } catch (_) {
    }
    compiledByFilename.set(filename, { mtimeMs, sourceHash, code, outPath });
    return code;
  }

  function compileAndLoad(module, filename) {
    const code = compile(filename);
    module._compile(code, filename);
  }

  function install() {
    Module._extensions['.jsx'] = (mod, filename) => {
      if (isInNodeModules(filename)) {
        if (typeof originalJsxExtension === 'function') return originalJsxExtension(mod, filename);
        const raw = fs.readFileSync(filename, 'utf8');
        mod._compile(raw, filename);
        return;
      }
      compileAndLoad(mod, filename);
    };

    Module._extensions['.tsx'] = (mod, filename) => {
      if (isInNodeModules(filename)) {
        if (typeof originalTsxExtension === 'function') return originalTsxExtension(mod, filename);
        const raw = fs.readFileSync(filename, 'utf8');
        mod._compile(raw, filename);
        return;
      }
      compileAndLoad(mod, filename);
    };

    Module._extensions['.ts'] = (mod, filename) => {
      if (isInNodeModules(filename)) {
        if (typeof originalTsExtension === 'function') return originalTsExtension(mod, filename);
        const raw = fs.readFileSync(filename, 'utf8');
        mod._compile(raw, filename);
        return;
      }
      compileAndLoad(mod, filename);
    };

    Module._extensions['.js'] = (mod, filename) => {
      if (!isUnderPagesDir(filename)) {
        return originalJsExtension(mod, filename);
      }
      compileAndLoad(mod, filename);
    };
  }

  function dispose() {
    Module._extensions['.js'] = originalJsExtension;
    if (typeof originalJsxExtension === 'function') {
      Module._extensions['.jsx'] = originalJsxExtension;
    } else {
      delete Module._extensions['.jsx'];
    }
    if (typeof originalTsExtension === 'function') {
      Module._extensions['.ts'] = originalTsExtension;
    } else {
      delete Module._extensions['.ts'];
    }
    if (typeof originalTsxExtension === 'function') {
      Module._extensions['.tsx'] = originalTsxExtension;
    } else {
      delete Module._extensions['.tsx'];
    }
  }

  function invalidate(filePath) {
    if (typeof filePath === 'string' && filePath.length > 0) {
      purgeDiskCacheFor(filePath);
      const cached = compiledByFilename.get(filePath);
      if (cached && cached.outPath) {
        try {
          fs.rmSync(cached.outPath, { force: true });
        } catch (_) {
        }
      }
      compiledByFilename.delete(filePath);
      try {
        delete require.cache[require.resolve(filePath)];
      } catch (_) {
      }
    } else {
      compiledByFilename.clear();
    }
  }

  install();
  return { invalidate, dispose };
}

async function loadModuleWithEsmFallback(modulePath, options = {}) {
  const cacheBust = options.cacheBust === true;
  try {
    if (cacheBust) {
      try {
        delete require.cache[require.resolve(modulePath)];
      } catch (_) {
      }
    }
    return require(modulePath);
  } catch (err) {
    const isEsm = err && (err.code === 'ERR_REQUIRE_ESM' || err.code === 'ERR_UNKNOWN_FILE_EXTENSION');
    if (isEsm) {
      const base = pathToFileURL(modulePath).href;
      const url = cacheBust ? `${base}?t=${Date.now()}` : base;
      return import(url);
    }
    throw err;
  }
}

function normalizePageModule(mod) {
  if (mod == null) return null;
  if (typeof mod === 'function') return mod;
  if (typeof mod.default === 'function') return mod.default;
  return null;
}

async function resolvePageProps(mod, ctx) {
  if (mod && typeof mod.getServerSideProps === 'function') {
    const out = await mod.getServerSideProps(ctx);
    if (out && typeof out === 'object' && out.props && typeof out.props === 'object') {
      return out.props;
    }
  }
  if (mod && typeof mod.getStaticProps === 'function') {
    const out = await mod.getStaticProps(ctx);
    if (out && typeof out === 'object' && out.props && typeof out.props === 'object') {
      return out.props;
    }
  }
  return { params: ctx.params, query: ctx.query };
}

function createMiniNextServer(options = {}) {
  const pagesDir = options.pagesDir || path.join(process.cwd(), 'pages');
  const publicDir = options.publicDir || path.join(process.cwd(), 'public');
  const isProd = options.isProd ?? process.env.NODE_ENV === 'production';

  const pagesCompiler = createPagesCompiler(pagesDir);

  const native = loadNativeAddon();
  const routeMatcher = new native.RouteMatcher(pagesDir);
  const ssrCache = new native.SSRCache(Number(options.ssrCacheSize || process.env.SSR_CACHE_SIZE || 512));
  const isrCache = new Map();
  const isrIndexByModulePath = new Map();
  const imageCache = new Map();
  const renderer = pickRenderer(native, options);
  const cleanups = [];
  const hmrClients = new Set();
  const plugins = Array.isArray(options.plugins) ? options.plugins.filter(Boolean) : [];

  function isrIndexAdd(modulePath, key) {
    const abs = String(modulePath || '');
    if (!abs) return;
    let set = isrIndexByModulePath.get(abs);
    if (!set) {
      set = new Set();
      isrIndexByModulePath.set(abs, set);
    }
    set.add(key);
  }

  function isrIndexRemoveKey(key) {
    for (const set of isrIndexByModulePath.values()) {
      set.delete(key);
    }
  }

  function isrInvalidateModule(modulePath) {
    const abs = String(modulePath || '');
    if (!abs) return;
    const set = isrIndexByModulePath.get(abs);
    if (!set) return;
    for (const k of set) {
      isrCache.delete(k);
    }
    isrIndexByModulePath.delete(abs);
  }

  function isrClear() {
    isrCache.clear();
    isrIndexByModulePath.clear();
  }

  let needsRescan = !isProd;
  if (!isProd && typeof native.FileWatcher === 'function') {
    const watcher = new native.FileWatcher();
    watcher.start(pagesDir, (ev) => {
      needsRescan = true;
      ssrCache.clear();
      isrClear();
      pagesCompiler.invalidate(ev && ev.path ? String(ev.path) : null);
      const msg = JSON.stringify({ type: 'reload', changed: ev && ev.path ? String(ev.path) : null, ts: Date.now() });
      for (const res of hmrClients) {
        try {
          res.write(`data: ${msg}\n\n`);
        } catch (_) {
        }
      }
      for (const p of plugins) {
        try {
          if (p && typeof p.onDevFileChange === 'function') {
            const out = p.onDevFileChange(ev);
            if (out && typeof out.catch === 'function') out.catch(() => { });
          }
        } catch (_) {
        }
      }
    }, { recursive: true });
    cleanups.push(() => watcher.stop());
  }

  const devRescanAlways = !isProd && typeof native.FileWatcher !== 'function';

  function getPageScriptsSource(pageModule, Component) {
    if (pageModule && typeof pageModule.getClientScripts === 'function') return pageModule;
    if (pageModule && Array.isArray(pageModule.__mini_next_scripts)) return pageModule;
    if (pageModule && Array.isArray(pageModule.scripts)) return pageModule;
    if (Component && typeof Component.getClientScripts === 'function') return Component;
    if (Component && Array.isArray(Component.__mini_next_scripts)) return Component;
    if (Component && Array.isArray(Component.scripts)) return Component;
    return null;
  }

  async function getScriptsHtml(pageModule, Component, ctx) {
    const src = getPageScriptsSource(pageModule, Component);
    let scripts = [];
    if (src) {
      if (typeof src.getClientScripts === 'function') {
        const out = await src.getClientScripts(ctx);
        if (Array.isArray(out)) scripts = out;
      } else if (Array.isArray(src.__mini_next_scripts)) {
        scripts = src.__mini_next_scripts;
      } else if (Array.isArray(src.scripts)) {
        scripts = src.scripts;
      }
    }

    for (const p of plugins) {
      if (!p || typeof p.getClientScripts !== 'function') continue;
      const out = await p.getClientScripts(ctx);
      if (Array.isArray(out) && out.length > 0) scripts = scripts.concat(out);
    }

    const uniq = [];
    const seen = new Set();
    for (const s of scripts) {
      const u = typeof s === 'string' ? s : null;
      if (!u) continue;
      if (seen.has(u)) continue;
      seen.add(u);
      uniq.push(u);
    }
    if (uniq.length === 0) return '';

    return uniq
      .map((u) => {
        const safe = String(u).replaceAll('"', '&quot;');
        const isModule = safe.endsWith('.mjs') || safe.includes('type=module');
        return isModule
          ? `<script type="module" src="${safe}"></script>`
          : `<script src="${safe}"></script>`;
      })
      .join('\n');
  }

  async function resolveStaticProps(mod, ctx) {
    if (!(mod && typeof mod.getStaticProps === 'function')) return null;
    const out = await mod.getStaticProps(ctx);
    if (!out || typeof out !== 'object') return null;
    const props = out.props && typeof out.props === 'object' ? out.props : {};
    const revalidate = out.revalidate;
    const revalidateSec = typeof revalidate === 'number' && Number.isFinite(revalidate) && revalidate > 0
      ? revalidate
      : null;
    return { props, revalidateSec };
  }

  function isrKey(modulePath, urlPath, params) {
    let p = '';
    try {
      p = JSON.stringify(params || {});
    } catch (_) {
      p = '';
    }
    return `${modulePath}|${urlPath}|${p}`;
  }

  function isFreshIsr(entry) {
    if (!entry) return false;
    if (entry.revalidateMs == null) return true;
    const age = Date.now() - Number(entry.generatedAt || 0);
    return age >= 0 && age < entry.revalidateMs;
  }

  function lruGet(map, key) {
    if (!map.has(key)) return null;
    const v = map.get(key);
    map.delete(key);
    map.set(key, v);
    return v;
  }

  function lruSet(map, key, value, limit) {
    if (map.has(key)) map.delete(key);
    map.set(key, value);
    while (map.size > limit) {
      const first = map.keys().next().value;
      if (first == null) break;
      map.delete(first);
      if (map === isrCache) {
        isrIndexRemoveKey(first);
      }
    }
  }

  function devClientScript() {
    if (isProd) return '';
    return [
      '<script>',
      "(() => {",
      "  try {",
      "    const es = new EventSource('/__mini_next__/hmr');",
      "    es.onmessage = (e) => {",
      "      try {",
      "        const msg = JSON.parse(String(e.data || '{}'));",
      "        if (msg && msg.type === 'reload') {",
      "          window.location.reload();",
      "        }",
      "      } catch (_) {",
      "        window.location.reload();",
      "      }",
      "    };",
      "  } catch (_) {",
      "  }",
      "})();",
      '</script>',
      '',
    ].join('\n');
  }

  function withDevScripts(scriptsHtml) {
    const dev = devClientScript();
    if (!dev) return String(scriptsHtml || '');
    const extra = String(scriptsHtml || '');
    return extra ? `${extra}\n${dev}` : dev;
  }

  function injectStylesHtml(html, stylesHtml) {
    const styles = String(stylesHtml || '');
    if (!styles) return html;
    const s = String(html || '');
    const idx = s.lastIndexOf('</head>');
    if (idx >= 0) return s.slice(0, idx) + styles + s.slice(idx);
    return styles + s;
  }

  async function applyPropsPlugins(props, ctx) {
    let nextProps = props && typeof props === 'object' ? props : {};
    for (const p of plugins) {
      if (!p || typeof p.extendPageProps !== 'function') continue;
      const out = await p.extendPageProps(nextProps, ctx);
      if (out && typeof out === 'object') nextProps = out;
    }
    return nextProps;
  }

  async function applyHtmlPlugins(html, ctx) {
    let outHtml = String(html || '');
    for (const p of plugins) {
      if (!p || typeof p.transformHtml !== 'function') continue;
      const out = await p.transformHtml(outHtml, ctx);
      if (typeof out === 'string') outHtml = out;
    }
    return outHtml;
  }

  function sendPluginResponse(res, out) {
    if (!out || typeof out !== 'object' || out.handled !== true) return false;
    const status = out.status;
    if (typeof status === 'number' && Number.isFinite(status)) {
      res.status(status);
    }
    const headers = out.headers;
    if (headers && typeof headers === 'object') {
      for (const [k, v] of Object.entries(headers)) {
        if (v == null) continue;
        try {
          res.setHeader(k, String(v));
        } catch (_) {
        }
      }
    }
    if (out.body != null) {
      res.send(out.body);
    } else {
      res.end();
    }
    return true;
  }

  async function runPlugins(name, ctx) {
    for (const p of plugins) {
      if (!p) continue;
      const fn = p[name];
      if (typeof fn !== 'function') continue;
      try {
        await fn.call(p, ctx);
      } catch (_) {
      }
      if (ctx && ctx.res && ctx.res.headersSent) return;
    }
  }

  async function runPluginsWithControl(name, ctx) {
    let next = ctx && typeof ctx === 'object' ? { ...ctx } : {};
    for (const p of plugins) {
      if (!p) continue;
      const fn = p[name];
      if (typeof fn !== 'function') continue;
      let out = null;
      try {
        out = await fn.call(p, next);
      } catch (_) {
        out = null;
      }
      if (next.res && next.res.headersSent) {
        return { handled: true, ctx: next };
      }
      if (sendPluginResponse(next.res, out)) {
        return { handled: true, ctx: next };
      }
      if (out && typeof out === 'object') {
        if (typeof out.urlPath === 'string') next.urlPath = out.urlPath;
        if (typeof out.modulePath === 'string') next.modulePath = out.modulePath;
        if (out.params && typeof out.params === 'object') next.params = out.params;
      }
    }
    return { handled: false, ctx: next };
  }

  async function runErrorPlugins(err, req, res, ctx) {
    const out = await runPluginsWithControl('onError', { err, req, res, ctx });
    return out.handled === true;
  }

  function renderErrorPage(err, req) {
    const stack = String(err && err.stack ? err.stack : err);
    const safe = stack
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    const url = String((req && (req.originalUrl || req.url)) || '');
    return [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8" />',
      '<meta name="viewport" content="width=device-width, initial-scale=1" />',
      '<title>mini-next-cpp error</title>',
      '</head>',
      '<body style="margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial;">',
      '<div style="padding:20px;background:#111;color:#fff;">',
      '<div style="font-size:14px;opacity:.9">mini-next-cpp dev error</div>',
      `<div style="margin-top:6px;font-size:12px;opacity:.8">${url.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</div>`,
      '</div>',
      '<pre style="margin:0;padding:16px;white-space:pre-wrap;word-break:break-word;background:#0b0b0b;color:#e6e6e6;line-height:1.4;font-size:12px;">',
      safe,
      '</pre>',
      '</body>',
      '</html>',
      '',
    ].join('\n');
  }

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  {
    const api = {
      app,
      isProd,
      pagesDir,
      publicDir,
      native,
      routeMatcher,
      ssrCache,
      rendererMode: renderer.mode,
      clearCaches: () => {
        ssrCache.clear();
        isrClear();
        imageCache.clear();
      },
      invalidate: (filePath) => {
        const abs = typeof filePath === 'string' ? filePath : null;
        pagesCompiler.invalidate(abs);
        ssrCache.clear();
        if (abs) {
          isrInvalidateModule(abs);
        } else {
          isrClear();
        }
      },
    };
    for (const p of plugins) {
      if (!p || typeof p.apply !== 'function') continue;
      p.apply(api);
    }
    for (const p of plugins) {
      if (!p || typeof p.onStart !== 'function') continue;
      p.onStart(api);
    }
  }

  app.get('/__mini_next__/health', (req, res) => {
    res.json({ ok: true });
  });

  app.get('/__mini_next__/debug', (req, res) => {
    res.json({
      ok: true,
      isProd,
      pagesDir,
      publicDir,
      ssrMode: renderer.mode,
      devRescanAlways,
    });
  });

  app.post('/__mini_next__/cache/clear', (req, res) => {
    ssrCache.clear();
    isrClear();
    imageCache.clear();
    res.json({ ok: true });
  });

  app.post('/__mini_next__/rescan', (req, res) => {
    routeMatcher.rescan();
    needsRescan = false;
    res.json({ ok: true });
  });

  app.get('/__mini_next__/hmr', (req, res) => {
    if (isProd) {
      res.status(404).send('Not Found');
      return;
    }
    res.status(200);
    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.flushHeaders?.();
    res.write('data: {"type":"connected"}\n\n');
    hmrClients.add(res);
    const ping = setInterval(() => {
      try {
        res.write(':\n\n');
      } catch (_) {
      }
    }, 15000);
    res.on('close', () => {
      clearInterval(ping);
      hmrClients.delete(res);
    });
  });

  app.get('/_mini_next/image', async (req, res) => {
    const url = String(req.query && req.query.url ? req.query.url : '');
    const wRaw = req.query && (req.query.w != null || req.query.width != null)
      ? String(req.query.w != null ? req.query.w : req.query.width)
      : '';
    const hRaw = req.query && (req.query.h != null || req.query.height != null)
      ? String(req.query.h != null ? req.query.h : req.query.height)
      : '';
    const qRaw = req.query && (req.query.q != null || req.query.quality != null)
      ? String(req.query.q != null ? req.query.q : req.query.quality)
      : '';
    const fRaw = req.query && (req.query.format != null || req.query.f != null)
      ? String(req.query.format != null ? req.query.format : req.query.f)
      : '';
    if (!url || !url.startsWith('/')) {
      res.status(400).json({ ok: false, error: 'Invalid url' });
      return;
    }
    const cleaned = path.posix.normalize(url).replace(/^(\.\.(\/|\\|$))+/, '');
    const abs = path.resolve(publicDir, '.' + cleaned);
    const pubAbs = path.resolve(publicDir) + path.sep;
    if (!(abs === path.resolve(publicDir) || abs.startsWith(pubAbs))) {
      res.status(400).json({ ok: false, error: 'Invalid url' });
      return;
    }
    if (!fs.existsSync(abs)) {
      res.status(404).send('Not Found');
      return;
    }
    let stat = null;
    try {
      stat = fs.statSync(abs);
    } catch (_) {
    }
    if (stat) {
      const etagSeed = `${abs}|${Number(stat.size || 0)}|${Number(stat.mtimeMs || 0)}|w=${wRaw}|h=${hRaw}|q=${qRaw}|f=${fRaw}`;
      const etag = `W/\"${crypto.createHash('sha1').update(etagSeed).digest('hex').slice(0, 16)}\"`;
      res.setHeader('etag', etag);
      const inm = req.headers['if-none-match'];
      if (typeof inm === 'string' && inm === etag) {
        res.status(304).end();
        return;
      }
    }
    const ext = String(path.extname(abs) || '').toLowerCase();
    const type = ext === '.png'
      ? 'image/png'
      : (ext === '.jpg' || ext === '.jpeg')
        ? 'image/jpeg'
        : ext === '.gif'
          ? 'image/gif'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.avif'
              ? 'image/avif'
              : ext === '.svg'
                ? 'image/svg+xml'
                : '';
    if (type) {
      res.setHeader('content-type', ext === '.svg' ? `${type}; charset=utf-8` : type);
    }
    const w = Number.parseInt(wRaw, 10);
    const h = Number.parseInt(hRaw, 10);
    const q = Number.parseInt(qRaw, 10);
    const width = Number.isFinite(w) && w > 0 ? Math.min(w, 4096) : null;
    const height = Number.isFinite(h) && h > 0 ? Math.min(h, 4096) : null;
    const quality = Number.isFinite(q) && q > 0 ? Math.min(q, 100) : 75;
    const fmt = String(fRaw || '').trim().toLowerCase();
    const format = fmt === 'webp' || fmt === 'avif' || fmt === 'jpeg' || fmt === 'jpg' || fmt === 'png'
      ? (fmt === 'jpg' ? 'jpeg' : fmt)
      : null;

    const shouldTransform = !!(width || height || format || qRaw);
    const raster = ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp' || ext === '.avif';

    if (shouldTransform && raster) {
      let sharp = null;
      try {
        sharp = require('sharp');
      } catch (_) {
      }

      if (sharp) {
        try {
          const key = `${abs}|${Number(stat ? stat.size : 0)}|${Number(stat ? stat.mtimeMs : 0)}|w=${width || ''}|h=${height || ''}|q=${quality}|f=${format || ''}`;
          const cached = lruGet(imageCache, key);
          if (cached && cached.etag === res.getHeader('etag')) {
            res.setHeader('content-type', cached.contentType);
            res.setHeader('cache-control', isProd ? 'public, max-age=3600' : 'no-cache');
            res.end(cached.buf);
            return;
          }

          let img = sharp(abs);
          if (width || height) {
            const resizeOpts = { withoutEnlargement: true };
            if (width) resizeOpts.width = width;
            if (height) resizeOpts.height = height;
            img = img.resize(resizeOpts);
          }

          const outFormat = format || (ext === '.png' ? 'png' : 'jpeg');
          if (outFormat === 'jpeg') {
            img = img.jpeg({ quality, mozjpeg: true });
          } else if (outFormat === 'webp') {
            img = img.webp({ quality });
          } else if (outFormat === 'avif') {
            img = img.avif({ quality });
          } else if (outFormat === 'png') {
            img = img.png({ compressionLevel: 9 });
          }

          const buf = await img.toBuffer();
          const contentType = outFormat === 'jpeg'
            ? 'image/jpeg'
            : outFormat === 'webp'
              ? 'image/webp'
              : outFormat === 'avif'
                ? 'image/avif'
                : outFormat === 'png'
                  ? 'image/png'
                  : 'application/octet-stream';

          const etagNow = String(res.getHeader('etag') || '');
          const limit = Number(options.imageCacheSize || process.env.IMAGE_CACHE_SIZE || 128);
          lruSet(imageCache, key, { buf, contentType, etag: etagNow }, Number.isFinite(limit) && limit > 0 ? limit : 128);

          res.setHeader('content-type', contentType);
          res.setHeader('cache-control', isProd ? 'public, max-age=3600' : 'no-cache');
          res.end(buf);
          return;
        } catch (_) {
        }
      }
    }

    res.setHeader('cache-control', isProd ? 'public, max-age=3600' : 'no-cache');
    res.sendFile(abs);
  });

  app.get(/.*/, async (req, res) => {
    try {
      if (!isProd) {
        if (devRescanAlways || needsRescan) {
          routeMatcher.rescan();
          needsRescan = false;
        }
      }

      let urlPath = req.path || '/';
      const reqOut = await runPluginsWithControl('onRequest', { req, res, urlPath });
      if (reqOut.handled) return;
      urlPath = String(reqOut.ctx.urlPath || urlPath);

      const match = routeMatcher.match(urlPath);
      if (!match || match.matched !== true || !match.filePath) {
        const nf = await runPluginsWithControl('onNotFound', { req, res, urlPath });
        if (nf.handled) return;
        res.status(404);
        await runPlugins('onResponse', { req, res, urlPath, statusCode: res.statusCode });
        res.send('Not Found');
        return;
      }

      let modulePath = match.filePath;
      let params = match.params || {};
      const prOut = await runPluginsWithControl('onPageResolved', { req, res, urlPath, modulePath, params });
      if (prOut.handled) return;
      urlPath = String(prOut.ctx.urlPath || urlPath);
      modulePath = String(prOut.ctx.modulePath || modulePath);
      params = prOut.ctx.params && typeof prOut.ctx.params === 'object' ? prOut.ctx.params : params;

      const pageModule = await loadModuleWithEsmFallback(modulePath, { cacheBust: !isProd });
      const Component = normalizePageModule(pageModule);

      if (!Component) {
        res.status(500);
        await runPlugins('onResponse', { req, res, urlPath, modulePath, params, statusCode: res.statusCode });
        res.send(`Invalid page module: ${modulePath}`);
        return;
      }

      const ctx = { req, res, params, query: req.query || {}, urlPath, modulePath };
      const isStatic = isProd
        && pageModule
        && typeof pageModule.getStaticProps === 'function'
        && typeof pageModule.getServerSideProps !== 'function';

      if (isStatic) {
        const key = isrKey(modulePath, urlPath, params);
        const cached = lruGet(isrCache, key);
        if (isFreshIsr(cached)) {
          res.setHeader('content-type', 'text/html; charset=utf-8');
          await runPlugins('onResponse', { req, res, urlPath, modulePath, params, statusCode: res.statusCode });
          res.send(cached.html);
          return;
        }

        const staticOut = await resolveStaticProps(pageModule, ctx);
        const propsRaw = staticOut ? staticOut.props : { params: ctx.params, query: ctx.query };
        const props = await applyPropsPlugins(propsRaw, ctx);
        const revalidateMs = staticOut && staticOut.revalidateSec != null ? staticOut.revalidateSec * 1000 : null;

        const pageData = JSON.stringify({ props, route: { path: urlPath, params } })
          .replaceAll('<', '\\u003c')
          .replaceAll('>', '\\u003e')
          .replaceAll('&', '\\u0026')
          .replaceAll('\\u2028', '\\u2028')
          .replaceAll('\\u2029', '\\u2029');

        const scriptsHtml = withDevScripts(await getScriptsHtml(pageModule, Component, ctx));

        const renderOut = await runWithStyleRegistry(async () => {
          if (renderer.mode === 'native') {
            const bodyHtml = renderer.renderToString(modulePath, props);
            return { bodyHtml: String(bodyHtml || '') };
          }
          const html = renderer.renderToString(Component, props, {
            route: { path: urlPath, params },
            scriptsHtml,
          });
          return { html: String(html || '') };
        });

        const htmlRaw = renderer.mode === 'native'
          ? native.renderTemplate(
            '<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>{{title}}</title>{{{stylesHtml}}}</head><body><div id="__next">{{{bodyHtml}}}</div><script id="__MINI_NEXT_DATA__" type="application/json">{{{pageData}}}</script>{{{scriptsHtml}}}</body></html>',
            {
              title: 'mini-next-cpp',
              bodyHtml: renderOut.result.bodyHtml,
              pageData,
              stylesHtml: renderOut.stylesHtml,
              scriptsHtml,
            },
            false,
          )
          : injectStylesHtml(renderOut.result.html, renderOut.stylesHtml);
        const html = await applyHtmlPlugins(htmlRaw, ctx);
        await runPlugins('onRendered', { req, res, urlPath, modulePath, params, html });

        const limit = Number(options.isrCacheSize || process.env.ISR_CACHE_SIZE || 256);
        lruSet(isrCache, key, { html, generatedAt: Date.now(), revalidateMs }, Number.isFinite(limit) && limit > 0 ? limit : 256);
        isrIndexAdd(modulePath, key);

        res.setHeader('content-type', 'text/html; charset=utf-8');
        await runPlugins('onResponse', { req, res, urlPath, modulePath, params, statusCode: res.statusCode });
        res.send(html);
        return;
      }

      const propsRaw = await resolvePageProps(pageModule, ctx);
      const props = await applyPropsPlugins(propsRaw, ctx);
      const cacheKey = `${modulePath}|${urlPath}|${JSON.stringify(props)}`;

      const cached = ssrCache.get(cacheKey);
      if (typeof cached === 'string' && cached.length > 0) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.send(cached);
        return;
      }

      const pageData = JSON.stringify({ props, route: { path: urlPath, params } })
        .replaceAll('<', '\\u003c')
        .replaceAll('>', '\\u003e')
        .replaceAll('&', '\\u0026')
        .replaceAll('\\u2028', '\\u2028')
        .replaceAll('\\u2029', '\\u2029');

      const scriptsHtml = withDevScripts(await getScriptsHtml(pageModule, Component, ctx));

      const renderOut = await runWithStyleRegistry(async () => {
        if (renderer.mode === 'native') {
          const bodyHtml = renderer.renderToString(modulePath, props);
          return { bodyHtml: String(bodyHtml || '') };
        }
        const html = renderer.renderToString(Component, props, {
          route: { path: urlPath, params },
          scriptsHtml,
        });
        return { html: String(html || '') };
      });

      const htmlRaw = renderer.mode === 'native'
        ? native.renderTemplate(
          '<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>{{title}}</title>{{{stylesHtml}}}</head><body><div id="__next">{{{bodyHtml}}}</div><script id="__MINI_NEXT_DATA__" type="application/json">{{{pageData}}}</script>{{{scriptsHtml}}}</body></html>',
          {
            title: 'mini-next-cpp',
            bodyHtml: renderOut.result.bodyHtml,
            pageData,
            stylesHtml: renderOut.stylesHtml,
            scriptsHtml,
          },
          false,
        )
        : injectStylesHtml(renderOut.result.html, renderOut.stylesHtml);
      const html = await applyHtmlPlugins(htmlRaw, ctx);
      await runPlugins('onRendered', { req, res, urlPath, modulePath, params, html });
      ssrCache.set(cacheKey, html);
      res.setHeader('content-type', 'text/html; charset=utf-8');
      await runPlugins('onResponse', { req, res, urlPath, modulePath, params, statusCode: res.statusCode });
      res.send(html);
    } catch (err) {
      const handled = await runErrorPlugins(err, req, res, null);
      if (handled) return;
      res.status(500);
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.send(renderErrorPage(err, req));
    }
  });

  const close = () => {
    for (const fn of cleanups) {
      try {
        fn();
      } catch (_) {
      }
    }
    pagesCompiler.invalidate(null);
    pagesCompiler.dispose();
    for (const res of hmrClients) {
      try {
        res.end();
      } catch (_) {
      }
    }
    hmrClients.clear();
  };

  return { app, pagesDir, close };
}

async function startMiniNextDevServer(options = {}) {
  const port = Number(options.port || process.env.PORT || 3000);
  const { app, pagesDir, close } = createMiniNextServer(options);

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      console.log(`mini-next-cpp dev server listening on http://localhost:${port}`);
      console.log(`pagesDir: ${pagesDir}`);
      resolve(server);
    });
    server.on('close', close);
  });
}

module.exports = { createMiniNextServer, startMiniNextDevServer };

if (require.main === module) {
  startMiniNextDevServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
