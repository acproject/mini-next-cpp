function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function renderDocument({ bodyHtml, pageData, title, stylesHtml, scriptsHtml }) {
  const safeTitle = title ? escapeHtml(title) : 'mini-next-cpp';
  const data = escapeJsonForHtml(pageData ?? {});
  const styles = stylesHtml ? String(stylesHtml) : '';
  const scripts = scriptsHtml ? String(scriptsHtml) : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
${styles}
  </head>
  <body>
    <div id="__next">${bodyHtml}</div>
    <script id="__MINI_NEXT_DATA__" type="application/json">${data}</script>
${scripts}
  </body>
</html>`;
}

function compileRoutePattern(route) {
  const segs = String(route || '')
    .split('/')
    .filter((s) => s.length > 0);
  const keys = [];
  const parts = segs.map((seg) => {
    if (seg.startsWith('[') && seg.endsWith(']')) {
      const key = seg.slice(1, -1).trim();
      keys.push(key);
      return '([^/]+)';
    }
    return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  const re = new RegExp(`^/${parts.join('/')}${parts.length ? '/?' : ''}$`);
  return { re, keys };
}

function createRouteMatcher(routesMap) {
  const entries = [];
  for (const [route, mod] of Object.entries(routesMap || {})) {
    const normalized = route === '/' ? '/' : `/${String(route).replace(/^\/+/, '').replace(/\/+$/, '')}`;
    const { re, keys } = compileRoutePattern(normalized);
    entries.push({ route: normalized, re, keys, mod });
  }

  const score = (route) => route.split('/').filter(Boolean).reduce((acc, seg) => acc + (seg.startsWith('[') ? 1 : 10), 0);
  entries.sort((a, b) => score(b.route) - score(a.route));

  return (pathname) => {
    const p = pathname || '/';
    for (const e of entries) {
      const m = e.re.exec(p);
      if (!m) continue;
      const params = {};
      for (let i = 0; i < e.keys.length; i++) {
        params[e.keys[i]] = decodeURIComponent(m[i + 1] || '');
      }
      return { matched: true, route: e.route, params, module: e.mod };
    }
    return { matched: false, route: null, params: null, module: null };
  };
}

function normalizePageModule(mod) {
  if (mod == null) return null;
  if (typeof mod === 'function') return mod;
  if (typeof mod.default === 'function') return mod.default;
  return null;
}

function getPageScriptsSource(pageModule, Component) {
  if (pageModule && typeof pageModule.getClientScripts === 'function') return pageModule;
  if (pageModule && Array.isArray(pageModule.__mini_next_scripts)) return pageModule;
  if (pageModule && Array.isArray(pageModule.scripts)) return pageModule;
  if (Component && typeof Component.getClientScripts === 'function') return Component;
  if (Component && Array.isArray(Component.__mini_next_scripts)) return Component;
  if (Component && Array.isArray(Component.scripts)) return Component;
  return null;
}

function scriptsToHtml(scripts) {
  const uniq = [];
  const seen = new Set();
  for (const s of scripts || []) {
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

async function resolvePageProps(mod, ctx) {
  if (mod && typeof mod.getServerSideProps === 'function') {
    const out = await mod.getServerSideProps(ctx);
    if (out && typeof out === 'object' && out.props && typeof out.props === 'object') return out.props;
  }
  if (mod && typeof mod.getStaticProps === 'function') {
    const out = await mod.getStaticProps(ctx);
    if (out && typeof out === 'object' && out.props && typeof out.props === 'object') return out.props;
  }
  return { params: ctx.params, query: ctx.query };
}

async function applyPropsPlugins(plugins, props, ctx) {
  let nextProps = props && typeof props === 'object' ? props : {};
  for (const p of plugins) {
    if (!p || typeof p.extendPageProps !== 'function') continue;
    const out = await p.extendPageProps(nextProps, ctx);
    if (out && typeof out === 'object') nextProps = out;
  }
  return nextProps;
}

async function applyHtmlPlugins(plugins, html, ctx) {
  let outHtml = String(html || '');
  for (const p of plugins) {
    if (!p || typeof p.transformHtml !== 'function') continue;
    const out = await p.transformHtml(outHtml, ctx);
    if (typeof out === 'string') outHtml = out;
  }
  return outHtml;
}

async function runPlugins(plugins, name, ctx) {
  for (const p of plugins) {
    if (!p) continue;
    const fn = p[name];
    if (typeof fn !== 'function') continue;
    try {
      await fn.call(p, ctx);
    } catch (_) {
    }
  }
}

function sendPluginResponse(out) {
  if (out instanceof Response) return out;
  if (!out || typeof out !== 'object' || out.handled !== true) return null;
  if (out.response instanceof Response) return out.response;
  const status = typeof out.status === 'number' && Number.isFinite(out.status) ? out.status : 200;
  const headers = new Headers();
  if (out.headers && typeof out.headers === 'object') {
    for (const [k, v] of Object.entries(out.headers)) {
      if (v == null) continue;
      try {
        headers.set(k, String(v));
      } catch (_) {
      }
    }
  }
  const body = out.body != null ? out.body : '';
  return new Response(body, { status, headers });
}

async function runPluginsWithControl(plugins, name, ctx) {
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

    const resp = sendPluginResponse(out);
    if (resp) return { handled: true, ctx: next, response: resp };

    if (out && typeof out === 'object') {
      if (typeof out.urlPath === 'string') next.urlPath = out.urlPath;
      if (typeof out.route === 'string') next.route = out.route;
      if (out.params && typeof out.params === 'object') next.params = out.params;
      if (out.modulePath != null) next.module = out.modulePath;
      if (out.module != null) next.module = out.module;
    }
  }
  return { handled: false, ctx: next, response: null };
}

async function getScriptsHtml(plugins, pageModule, Component, pageCtx) {
  const src = getPageScriptsSource(pageModule, Component);
  let scripts = [];
  if (src) {
    if (typeof src.getClientScripts === 'function') {
      const out = await src.getClientScripts(pageCtx);
      if (Array.isArray(out)) scripts = out;
    } else if (Array.isArray(src.__mini_next_scripts)) {
      scripts = src.__mini_next_scripts;
    } else if (Array.isArray(src.scripts)) {
      scripts = src.scripts;
    }
  }

  for (const p of plugins) {
    if (!p || typeof p.getClientScripts !== 'function') continue;
    const out = await p.getClientScripts(pageCtx);
    if (Array.isArray(out) && out.length > 0) scripts = scripts.concat(out);
  }

  return scriptsToHtml(scripts);
}

function createMiniNextEdgeHandler(options = {}) {
  const routes = options.routes && typeof options.routes === 'object' ? options.routes : {};
  const matcher = createRouteMatcher(routes);
  const plugins = Array.isArray(options.plugins) ? options.plugins.filter(Boolean) : [];
  const renderer = typeof options.renderToString === 'function'
    ? options.renderToString
    : async (Component, props) => String(await Component(props));

  const api = {
    isEdge: true,
    routes,
    renderDocument,
  };
  for (const p of plugins) {
    if (!p || typeof p.apply !== 'function') continue;
    p.apply(api);
  }
  for (const p of plugins) {
    if (!p || typeof p.onStart !== 'function') continue;
    p.onStart(api);
  }

  return async function handle(request, env, ctx) {
    const req = request;
    const url = new URL(req.url);
    let urlPath = url.pathname || '/';
    const query = {};
    for (const [k, v] of url.searchParams.entries()) {
      if (query[k] == null) query[k] = v;
    }

    try {
      const reqOut = await runPluginsWithControl(plugins, 'onRequest', { req, urlPath, env, ctx, query });
      if (reqOut.handled) return reqOut.response;
      urlPath = String(reqOut.ctx.urlPath || urlPath);

      const match = matcher(urlPath);
      if (!match.matched) {
        const nfOut = await runPluginsWithControl(plugins, 'onNotFound', { req, urlPath, env, ctx, query });
        if (nfOut.handled) return nfOut.response;
        await runPlugins(plugins, 'onResponse', { req, urlPath, statusCode: 404, env, ctx, query });
        return new Response('Not Found', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }

      let route = match.route;
      let params = match.params || {};
      let pageModule = match.module;
      const prOut = await runPluginsWithControl(plugins, 'onPageResolved', { req, urlPath, route, params, module: pageModule, env, ctx, query });
      if (prOut.handled) return prOut.response;
      urlPath = String(prOut.ctx.urlPath || urlPath);
      route = typeof prOut.ctx.route === 'string' ? prOut.ctx.route : route;
      params = prOut.ctx.params && typeof prOut.ctx.params === 'object' ? prOut.ctx.params : params;
      pageModule = prOut.ctx.module != null ? prOut.ctx.module : pageModule;

      const Component = normalizePageModule(pageModule);
      if (!Component) {
        const bad = await runPluginsWithControl(plugins, 'onError', { err: new Error('Invalid page module'), req, urlPath, env, ctx, query });
        if (bad.handled) return bad.response;
        await runPlugins(plugins, 'onResponse', { req, urlPath, statusCode: 500, env, ctx, query });
        return new Response('Invalid page module', { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
      }

      const pageCtx = { req, env, ctx, params, query, urlPath, route };

      const propsRaw = await resolvePageProps(pageModule, pageCtx);
      const props = await applyPropsPlugins(plugins, propsRaw, pageCtx);

      const scriptsHtml = options.scriptsHtml != null ? String(options.scriptsHtml) : await getScriptsHtml(plugins, pageModule, Component, pageCtx);
      const bodyHtml = await renderer(Component, props, { route: { path: urlPath, params } });
      const htmlRaw = renderDocument({
        bodyHtml: String(bodyHtml || ''),
        pageData: { props, route: { path: urlPath, params } },
        title: options.title ?? null,
        stylesHtml: options.stylesHtml ?? null,
        scriptsHtml,
      });
      const html = await applyHtmlPlugins(plugins, htmlRaw, pageCtx);
      await runPlugins(plugins, 'onRendered', { req, urlPath, route, params, html, env, ctx, query });
      await runPlugins(plugins, 'onResponse', { req, urlPath, statusCode: 200, env, ctx, query });

      return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
    } catch (err) {
      const erOut = await runPluginsWithControl(plugins, 'onError', { err, req, urlPath, env, ctx, query });
      if (erOut.handled) return erOut.response;
      await runPlugins(plugins, 'onResponse', { req, urlPath, statusCode: 500, env, ctx, query });
      return new Response(String(err && err.stack ? err.stack : err), { status: 500, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
  };
}

module.exports = { createMiniNextEdgeHandler, renderDocument };
