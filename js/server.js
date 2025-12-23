const path = require('path');
const fs = require('fs');

const express = require('express');
const { renderPage } = require('./renderer');

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

function enableBabelRegister() {
  require('@babel/register')({
    extensions: ['.js', '.jsx'],
    babelrc: false,
    configFile: false,
    presets: [
      [require.resolve('@babel/preset-env'), { targets: { node: 'current' } }],
      [require.resolve('@babel/preset-react'), { runtime: 'automatic' }],
    ],
    cache: true,
  });
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
  return { params: ctx.params, query: ctx.query };
}

async function main() {
  const port = Number(process.env.PORT || 3000);
  const pagesDir = process.env.PAGES_DIR || path.join(process.cwd(), 'pages');
  const isProd = process.env.NODE_ENV === 'production';

  enableBabelRegister();

  const native = loadNativeAddon();
  const routeMatcher = new native.RouteMatcher(pagesDir);
  const ssrCache = new native.SSRCache(Number(process.env.SSR_CACHE_SIZE || 512));

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  const publicDir = process.env.PUBLIC_DIR || path.join(process.cwd(), 'public');
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  app.get('/__mini_next__/health', (req, res) => {
    res.json({ ok: true });
  });

  app.get('*', async (req, res) => {
    try {
      if (!isProd) {
        routeMatcher.rescan();
        ssrCache.clear();
      }

      const urlPath = req.path || '/';
      const match = routeMatcher.match(urlPath);
      if (!match || match.matched !== true || !match.filePath) {
        res.status(404).send('Not Found');
        return;
      }

      const modulePath = match.filePath;
      delete require.cache[modulePath];
      const pageModule = require(modulePath);
      const Component = normalizePageModule(pageModule);

      if (!Component) {
        res.status(500).send(`Invalid page module: ${modulePath}`);
        return;
      }

      const ctx = { req, res, params: match.params || {}, query: req.query || {} };
      const props = await resolvePageProps(pageModule, ctx);
      const cacheKey = `${modulePath}|${urlPath}|${JSON.stringify(props)}`;

      const cached = ssrCache.get(cacheKey);
      if (typeof cached === 'string' && cached.length > 0) {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.send(cached);
        return;
      }

      const html = renderPage(Component, props, { route: { path: urlPath, params: match.params } });
      ssrCache.set(cacheKey, html);
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      res.status(500).send(String(err && err.stack ? err.stack : err));
    }
  });

  app.listen(port, () => {
    console.log(`mini-next-cpp dev server listening on http://localhost:${port}`);
    console.log(`pagesDir: ${pagesDir}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
