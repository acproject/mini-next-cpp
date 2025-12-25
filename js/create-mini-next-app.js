#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');

function parseArgs(argv) {
  const out = {
    dir: null,
    typescript: false,
    template: 'basic',
    css: 'tailwind',
    ui: 'daisyui',
    db: 'none',
    install: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--ts' || a === '--typescript') {
      out.typescript = true;
      continue;
    }
    if (a === '--no-install') {
      out.install = false;
      continue;
    }
    if (a === '--install') {
      out.install = true;
      continue;
    }
    if (a === '--template' && i + 1 < argv.length) {
      out.template = String(argv[i + 1] || 'basic');
      i++;
      continue;
    }
    if (a === '--music') {
      out.template = 'music';
      continue;
    }
    if (a === '--css' && i + 1 < argv.length) {
      out.css = String(argv[i + 1] || 'none');
      i++;
      continue;
    }
    if (a === '--ui' && i + 1 < argv.length) {
      out.ui = String(argv[i + 1] || 'none');
      i++;
      continue;
    }
    if (a === '--db' && i + 1 < argv.length) {
      out.db = String(argv[i + 1] || 'none');
      i++;
      continue;
    }
    if (a === '-h' || a === '--help') {
      out.help = true;
      continue;
    }
    if (a.startsWith('-')) continue;
    if (!out.dir) out.dir = a;
  }
  return out;
}

function usage() {
  return [
    'Usage:',
    '  create-mini-next-app <dir> [--ts] [--template <basic|music>]',
    '    [--css <none|tailwind|pico|bootstrap>]',
    '    [--ui <none|daisyui|preline|flowbite>]',
    '    [--db <none|sqlite>]',
    '    [--no-install]',
    '',
    'Examples:',
    '  create-mini-next-app my-app',
    '  create-mini-next-app my-app --ts',
    '  create-mini-next-app my-app --template music',
    '  create-mini-next-app my-app --music',
    '  create-mini-next-app my-app --css tailwind --ui daisyui',
    '  create-mini-next-app my-app --template music --db sqlite --css tailwind --ui daisyui',
    '',
  ].join('\n');
}

function isDirEmpty(dir) {
  try {
    const items = fs.readdirSync(dir);
    return items.length === 0;
  } catch (_) {
    return true;
  }
}

function writeFileSafe(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, { encoding: 'utf8', flag: 'wx' });
}

function normalizeAppName(abs) {
  return (String(path.basename(abs) || 'mini-next-app')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '') || 'mini-next-app');
}

function normalizeChoice(value, allow, fallback) {
  const v = String(value || '').trim().toLowerCase();
  return allow.includes(v) ? v : fallback;
}

function buildAppPlugin({ css, ui, enableAuth }) {
  const lines = [];
  lines.push('function injectBeforeHeadClose(html, extra) {');
  lines.push('  const s = String(html || "");');
  lines.push('  const x = String(extra || "");');
  lines.push('  if (!x) return s;');
  lines.push('  const idx = s.lastIndexOf("</head>");');
  lines.push('  if (idx >= 0) return s.slice(0, idx) + x + s.slice(idx);');
  lines.push('  return x + s;');
  lines.push('}');
  lines.push('');
  lines.push('module.exports = {');
  lines.push('  transformHtml(html) {');
  const headParts = [];
  if (css === 'tailwind') {
    headParts.push('<link rel="stylesheet" href="/tailwind.css" />');
  } else if (css === 'pico') {
    headParts.push('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2/css/pico.min.css" />');
  } else if (css === 'bootstrap') {
    headParts.push('<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" />');
  }
  if (headParts.length === 0) {
    lines.push('    return html;');
  } else {
    lines.push(`    return injectBeforeHeadClose(html, ${JSON.stringify(headParts.join(''))});`);
  }
  lines.push('  },');
  if (ui === 'preline') {
    lines.push('  getClientScripts() {');
    lines.push("    return ['https://cdn.jsdelivr.net/npm/preline@2.5.1/dist/preline.js'];");
    lines.push('  },');
  } else if (ui === 'flowbite') {
    lines.push('  getClientScripts() {');
    lines.push("    return ['https://cdn.jsdelivr.net/npm/flowbite@2.5.2/dist/flowbite.min.js'];");
    lines.push('  },');
  }
  lines.push('  extendPageProps(props) {');
  lines.push('    const base = props && typeof props === "object" ? props : {};');
  lines.push(`    return { ...base, enableAuth: ${enableAuth ? 'true' : 'false'} };`);
  lines.push('  },');
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

function buildTailwindConfig({ ui }) {
  const plugins = [];
  if (ui === 'daisyui') plugins.push('require("daisyui")');
  if (ui === 'flowbite') plugins.push('require("flowbite/plugin")');
  const content = [
    './pages/**/*.{js,jsx,ts,tsx}',
    './plugins/**/*.{js,cjs}',
  ];
  if (ui === 'flowbite') content.push('./node_modules/flowbite/**/*.js');
  return [
    '/** @type {import("tailwindcss").Config} */',
    'module.exports = {',
    '  content: [',
    ...content.map((p) => `    ${JSON.stringify(p)},`),
    '  ],',
    '  theme: { extend: {} },',
    `  plugins: [${plugins.join(', ')}],`,
    '};',
    '',
  ].join('\n');
}

function buildBasicTemplate({ appName, typescript, css, ui, miniNextDependency }) {
  const cssChoice = normalizeChoice(css, ['none', 'tailwind', 'pico', 'bootstrap'], 'none');
  const uiChoice = normalizeChoice(ui, ['none', 'daisyui', 'preline', 'flowbite'], 'none');
  const pkg = {
    name: appName,
    version: '0.1.0',
    private: true,
    type: 'commonjs',
    scripts: {
      dev: 'node server.js',
    },
    dependencies: {
      'mini-next-cpp': String(miniNextDependency || '^1.0.0'),
    },
  };
  if (cssChoice === 'tailwind') {
    pkg.scripts['build:css'] = 'tailwindcss -c ./tailwind.config.cjs -i ./styles/tailwind.css -o ./public/tailwind.css --minify';
    pkg.scripts['dev:css'] = 'tailwindcss -c ./tailwind.config.cjs -i ./styles/tailwind.css -o ./public/tailwind.css --watch';
    pkg.devDependencies = { tailwindcss: '^3.4.17' };
    if (uiChoice === 'daisyui') {
      pkg.devDependencies.daisyui = '^4.12.14';
    }
    if (uiChoice === 'flowbite') {
      pkg.devDependencies.flowbite = '^2.5.2';
    }
  }

  const serverJs = [
    "const path = require('path');",
    "const { startMiniNextDevServer } = require('mini-next-cpp');",
    "const appPlugin = require('./plugins/app');",
    '',
    'startMiniNextDevServer({',
    "  port: Number(process.env.PORT || 3000),",
    "  pagesDir: path.join(__dirname, 'pages'),",
    "  publicDir: path.join(__dirname, 'public'),",
    '  plugins: [appPlugin],',
    '}).catch((err) => {',
    '  console.error(err);',
    '  process.exit(1);',
    '});',
    '',
  ].join('\n');

  const pageJs = [
    'function Page(props) {',
    "  return 'hello ' + String(props && props.name ? props.name : 'mini-next-cpp');",
    '}',
    '',
    'Page.getServerSideProps = async () => {',
    "  return { props: { name: 'mini-next-cpp' } };",
    '};',
    '',
    'module.exports = Page;',
    '',
  ].join('\n');

  const pageTs = [
    'type Props = {',
    '  name?: string;',
    '};',
    '',
    'export default function Page(props: Props) {',
    "  return 'hello ' + String(props && props.name ? props.name : 'mini-next-cpp');",
    '}',
    '',
    'export async function getServerSideProps() {',
    "  return { props: { name: 'mini-next-cpp' } };",
    '}',
    '',
  ].join('\n');

  const files = {
    'package.json': `${JSON.stringify(pkg, null, 2)}\n`,
    'server.js': serverJs,
    [path.join('plugins', 'app.js')]: buildAppPlugin({ css: cssChoice, ui: uiChoice, enableAuth: false }),
    ...(typescript ? { [path.join('pages', 'index.ts')]: pageTs } : { [path.join('pages', 'index.js')]: pageJs }),
  };
  const dirs = ['public', 'plugins'];
  if (cssChoice === 'tailwind') {
    files['tailwind.config.cjs'] = buildTailwindConfig({ ui: uiChoice });
    files[path.join('styles', 'tailwind.css')] = [
      '@tailwind base;',
      '@tailwind components;',
      '@tailwind utilities;',
      '',
    ].join('\n');
    dirs.push('styles');
  }
  return { files, dirs };
}

function buildMusicTemplate({ appName, css, ui, db, miniNextDependency }) {
  const coverSvg = (title, a, b) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="800" height="800" rx="48" fill="url(#g)"/>
  <circle cx="610" cy="190" r="96" fill="rgba(255,255,255,0.14)"/>
  <circle cx="150" cy="640" r="140" fill="rgba(0,0,0,0.18)"/>
  <text x="56" y="130" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-weight="800" font-size="54" fill="rgba(255,255,255,0.94)">${String(title).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</text>
  <text x="56" y="188" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" font-weight="600" font-size="22" fill="rgba(255,255,255,0.78)">mini-next-cpp example</text>
</svg>
`;

  const cssChoice = normalizeChoice(css, ['none', 'tailwind', 'pico', 'bootstrap'], 'none');
  const uiChoice = normalizeChoice(ui, ['none', 'daisyui', 'preline', 'flowbite'], 'none');
  const dbChoice = normalizeChoice(db, ['none', 'sqlite'], 'none');
  const enableAuth = dbChoice === 'sqlite';

  const pkg = {
    name: appName,
    version: '0.1.0',
    private: true,
    type: 'commonjs',
    scripts: {
      dev: 'node server.js',
    },
    dependencies: {
      'mini-next-cpp': String(miniNextDependency || '^1.0.0'),
    },
  };
  if (enableAuth) {
    pkg.dependencies['better-sqlite3'] = '^11.10.0';
  }
  if (cssChoice === 'tailwind') {
    pkg.scripts['build:css'] = 'tailwindcss -c ./tailwind.config.cjs -i ./styles/tailwind.css -o ./public/tailwind.css --minify';
    pkg.scripts['dev:css'] = 'tailwindcss -c ./tailwind.config.cjs -i ./styles/tailwind.css -o ./public/tailwind.css --watch';
    pkg.devDependencies = { tailwindcss: '^3.4.17' };
    if (uiChoice === 'daisyui') {
      pkg.devDependencies.daisyui = '^4.12.14';
    }
    if (uiChoice === 'flowbite') {
      pkg.devDependencies.flowbite = '^2.5.2';
    }
  }

  const serverJs = [
    "const path = require('path');",
    "const { startMiniNextDevServer } = require('mini-next-cpp');",
    "const appPlugin = require('./plugins/app');",
    ...(enableAuth ? ["const { createAuthPlugin } = require('./plugins/auth');"] : []),
    '',
    'startMiniNextDevServer({',
    "  port: Number(process.env.PORT || 3000),",
    "  pagesDir: path.join(__dirname, 'pages'),",
    "  publicDir: path.join(__dirname, 'public'),",
    '  plugins: [',
    '    appPlugin,',
    ...(enableAuth ? [
      '    createAuthPlugin({',
      "      dbPath: path.join(__dirname, 'data', 'app.db'),",
      '    }),',
    ] : []),
    '  ],',
    '}).catch((err) => {',
    '  console.error(err);',
    '  process.exit(1);',
    '});',
    '',
  ].join('\n');

  const authPluginJs = [
    "const fs = require('fs');",
    "const path = require('path');",
    "const crypto = require('crypto');",
    "const Database = require('better-sqlite3');",
    '',
    'function parseCookies(req) {',
    "  const raw = String((req && req.headers && req.headers.cookie) || '');",
    '  const out = {};',
    "  for (const part of raw.split(';')) {",
    '    const p = part.trim();',
    '    if (!p) continue;',
    "    const idx = p.indexOf('=');",
    '    if (idx < 0) continue;',
    "    const k = decodeURIComponent(p.slice(0, idx).trim());",
    "    const v = decodeURIComponent(p.slice(idx + 1).trim());",
    '    if (!k) continue;',
    '    if (out[k] == null) out[k] = v;',
    '  }',
    '  return out;',
    '}',
    '',
    'function nowSec() {',
    '  return Math.floor(Date.now() / 1000);',
    '}',
    '',
    'function pbkdf2Hash(password, saltHex) {',
    "  const salt = Buffer.from(saltHex, 'hex');",
    "  const dk = crypto.pbkdf2Sync(String(password || ''), salt, 100000, 32, 'sha256');",
    "  return dk.toString('hex');",
    '}',
    '',
    'function randomHex(n) {',
    '  return crypto.randomBytes(n).toString(\'hex\');',
    '}',
    '',
    'function ensureDb(dbPath) {',
    '  const abs = path.resolve(dbPath);',
    '  fs.mkdirSync(path.dirname(abs), { recursive: true });',
    '  const db = new Database(abs);',
    '  db.pragma(\'journal_mode = WAL\');',
    '  db.exec([',
    "    'CREATE TABLE IF NOT EXISTS users (',",
    "    '  id INTEGER PRIMARY KEY AUTOINCREMENT,',",
    "    '  email TEXT NOT NULL UNIQUE,',",
    "    '  name TEXT NOT NULL,',",
    "    '  password_salt TEXT NOT NULL,',",
    "    '  password_hash TEXT NOT NULL,',",
    "    '  created_at INTEGER NOT NULL',",
    "    ');',",
    "    'CREATE TABLE IF NOT EXISTS sessions (',",
    "    '  token TEXT PRIMARY KEY,',",
    "    '  user_id INTEGER NOT NULL,',",
    "    '  expires_at INTEGER NOT NULL,',",
    "    '  created_at INTEGER NOT NULL,',",
    "    '  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE',",
    "    ');',",
    "    'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);',",
    "    'CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);',",
    "  ].join('\\n'));",
    '  return db;',
    '}',
    '',
    'function createAuthPlugin(options = {}) {',
    "  const cookieName = String(options.cookieName || 'mn_session');",
    '  const sessionMaxAgeSec = Number(options.sessionMaxAgeSec || 60 * 60 * 24 * 7);',
    '  const db = ensureDb(String(options.dbPath || path.join(process.cwd(), \'data\', \'app.db\')));',
    '',
    '  const stmtGetSession = db.prepare(',
    "    'SELECT s.token, s.user_id, s.expires_at, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? LIMIT 1'",
    '  );',
    '  const stmtDeleteSession = db.prepare(\'DELETE FROM sessions WHERE token = ?\');',
    '  const stmtInsertSession = db.prepare(\'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)\');',
    '  const stmtFindUserByEmail = db.prepare(\'SELECT id, email, name, password_salt, password_hash FROM users WHERE email = ? LIMIT 1\');',
    '  const stmtInsertUser = db.prepare(\'INSERT INTO users (email, name, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)\');',
    '',
    '  function getUserFromReq(req) {',
    '    const cookies = parseCookies(req);',
    '    const token = cookies[cookieName];',
    '    if (!token) return null;',
    '    const row = stmtGetSession.get(String(token));',
    '    if (!row) return null;',
    '    if (Number(row.expires_at) < nowSec()) {',
    '      try { stmtDeleteSession.run(String(token)); } catch (_) {}',
    '      return null;',
    '    }',
    '    return { id: row.user_id, email: row.email, name: row.name, token: String(row.token) };',
    '  }',
    '',
    '  function setSessionCookie(res, token) {',
    '    res.cookie(cookieName, token, {',
    '      httpOnly: true,',
    '      sameSite: \'lax\',',
    '      path: \'/\',',
    '      maxAge: sessionMaxAgeSec * 1000,',
    '    });',
    '  }',
    '',
    '  function clearSessionCookie(res) {',
    '    res.cookie(cookieName, \'\', {',
    '      httpOnly: true,',
    '      sameSite: \'lax\',',
    '      path: \'/\',',
    '      maxAge: 0,',
    '    });',
    '  }',
    '',
    '  function requireAuth(req, res, next) {',
    '    const u = getUserFromReq(req);',
    '    if (!u) {',
    "      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });",
    '      return;',
    '    }',
    '    req.miniNextUser = u;',
    '    next();',
    '  }',
    '',
    '  return {',
    '    apply(api) {',
    '      const app = api && api.app;',
    '      if (!app) return;',
    '',
    '      app.use((req, _res, next) => {',
    '        try { req.miniNextUser = getUserFromReq(req); } catch (_) { req.miniNextUser = null; }',
    '        next();',
    '      });',
    '',
    "      app.get('/api/me', (req, res) => {",
    '        const u = req.miniNextUser;',
    '        if (!u) {',
    '          res.json({ ok: true, user: null });',
    '          return;',
    '        }',
    '        res.json({ ok: true, user: { id: u.id, email: u.email, name: u.name } });',
    '      });',
    '',
    "      app.post('/api/register', (req, res) => {",
    "        const email = String((req.body && req.body.email) || '').trim().toLowerCase();",
    "        const name = String((req.body && req.body.name) || '').trim();",
    "        const password = String((req.body && req.body.password) || '');",
    "        if (!email || !name || password.length < 6) {",
    "          res.status(400).send('Bad Request');",
    '          return;',
    '        }',
    '        const existing = stmtFindUserByEmail.get(email);',
    '        if (existing) {',
    "          res.status(409).send('Email already registered');",
    '          return;',
    '        }',
    '        const salt = randomHex(16);',
    '        const hash = pbkdf2Hash(password, salt);',
    '        const t = db.transaction(() => {',
    '          const info = stmtInsertUser.run(email, name, salt, hash, nowSec());',
    '          const userId = Number(info.lastInsertRowid);',
    '          const token = randomHex(32);',
    '          const exp = nowSec() + sessionMaxAgeSec;',
    '          stmtInsertSession.run(token, userId, exp, nowSec());',
    '          return { userId, token };',
    '        });',
    '        const out = t();',
    '        setSessionCookie(res, out.token);',
    "        res.redirect('/');",
    '      });',
    '',
    "      app.post('/api/login', (req, res) => {",
    "        const email = String((req.body && req.body.email) || '').trim().toLowerCase();",
    "        const password = String((req.body && req.body.password) || '');",
    "        if (!email || !password) {",
    "          res.status(400).send('Bad Request');",
    '          return;',
    '        }',
    '        const u = stmtFindUserByEmail.get(email);',
    '        if (!u) {',
    "          res.status(401).send('Invalid credentials');",
    '          return;',
    '        }',
    '        const hash = pbkdf2Hash(password, String(u.password_salt));',
    "        if (hash !== String(u.password_hash)) {",
    "          res.status(401).send('Invalid credentials');",
    '          return;',
    '        }',
    '        const token = randomHex(32);',
    '        const exp = nowSec() + sessionMaxAgeSec;',
    '        stmtInsertSession.run(token, Number(u.id), exp, nowSec());',
    '        setSessionCookie(res, token);',
    '        const nextUrl = String((req.body && req.body.next) || (req.query && req.query.next) || \'/\');',
    '        res.redirect(nextUrl.startsWith(\'/\') ? nextUrl : \'/\');',
    '      });',
    '',
    "      app.post('/api/logout', (req, res) => {",
    '        const u = req.miniNextUser;',
    '        if (u && u.token) {',
    '          try { stmtDeleteSession.run(String(u.token)); } catch (_) {}',
    '        }',
    '        clearSessionCookie(res);',
    "        res.redirect('/');",
    '      });',
    '',
    "      app.get('/api/protected', requireAuth, (req, res) => {",
    '        const u = req.miniNextUser;',
    '        res.json({ ok: true, user: { id: u.id, email: u.email, name: u.name } });',
    '      });',
    '    },',
    '    extendPageProps(props, ctx) {',
    '      const req = ctx && ctx.req;',
    '      const u = req && req.miniNextUser ? req.miniNextUser : null;',
    '      const base = props && typeof props === \'object\' ? props : {};',
    '      return { ...base, auth: u ? { id: u.id, email: u.email, name: u.name } : null };',
    '    },',
    '    onRequest(ctx) {',
    '      const req = ctx && ctx.req;',
    '      const res = ctx && ctx.res;',
    '      const urlPath = String(ctx && ctx.urlPath ? ctx.urlPath : \'/\');',
    '      if (!req || !res) return;',
    "      if (urlPath === '/profile') {",
    '        const u = req.miniNextUser;',
    '        if (!u) {',
    "          return { handled: true, status: 302, headers: { location: '/login?next=%2Fprofile' }, body: '' };",
    '        }',
    '      }',
    '    },',
    '  };',
    '}',
    '',
    'module.exports = { createAuthPlugin };',
    '',
  ].join('\n');

  const songsJson = JSON.stringify({
    site: { name: 'StreetVoice', slogan: '把音乐带回生活' },
    hero: [
      { title: '网恋', artist: '莫宰羊', cover: '/covers/missing.svg', tag: '推荐单曲' },
      { title: 'Songwriter', artist: 'Demo', cover: '/covers/blue.svg', tag: '推荐专辑' },
      { title: 'Live Session', artist: 'Various', cover: '/covers/purple.svg', tag: '热门精选' }
    ],
    songOfDay: {
      title: '晃 (demo)',
      artist: '吴昊',
      cover: '/covers/chair.svg',
      likes: 11,
      desc: '每日一曲，把日常的缝隙填满；把情绪留给音乐。'
    },
    ranking: [
      { idx: 1, title: '雨爱（帕奇拉PACHILA Remix）', artist: '街声PACHILA', cover: '/covers/rain.svg', likes: 159 },
      { idx: 2, title: '冬 / demo', artist: '没有才能', cover: '/covers/winter.svg', likes: 57 },
      { idx: 3, title: '阿兹盗贼症', artist: '暖男曲', cover: '/covers/rob.svg', likes: 143 },
      { idx: 4, title: 'Missin\'', artist: '大成 DACHENG', cover: '/covers/missin.svg', likes: 36 },
      { idx: 5, title: '空と絆', artist: '時雨雨', cover: '/covers/sky.svg', likes: 41 },
      { idx: 6, title: '暖冬2025', artist: 'chun', cover: '/covers/warm.svg', likes: 12 }
    ]
  }, null, 2) + '\n';

  const indexJs = [
    "const React = require('react');",
    "const fs = require('fs');",
    "const path = require('path');",
    "const { css } = require('mini-next-cpp');",
    '',
    'function clamp(n, min, max) {',
    '  return Math.max(min, Math.min(max, n));',
    '}',
    '',
    'function Icon({ name }) {',
    '  const cls = css`display:inline-block;width:18px;height:18px;opacity:.9;`;',
    '  const box = css`display:inline-flex;align-items:center;justify-content:center;border-radius:999px;width:32px;height:32px;background:rgba(255,255,255,.08);`;',
    "  const text = name === 'search' ? '⌕' : name === 'globe' ? '🌐' : name === 'play' ? '▶' : '•';",
    '  return React.createElement(\'span\', { className: box }, React.createElement(\'span\', { className: cls }, text));',
    '}',
    '',
    'function Button({ href, children, primary }) {',
    '  const cls = css`display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 14px;border-radius:999px;font-size:13px;letter-spacing:.2px;text-decoration:none;border:1px solid rgba(255,255,255,.16);color:#fff;background:${primary ? "rgba(255,70,120,.92)" : "rgba(255,255,255,.06)"};`;',
    '  return React.createElement(\'a\', { className: cls, href }, children);',
    '}',
    '',
    'function Chip({ children }) {',
    '  const cls = css`display:inline-flex;align-items:center;justify-content:center;padding:6px 10px;border-radius:999px;background:rgba(0,0,0,.35);backdrop-filter: blur(6px);font-size:12px;color:#fff;`;',
    '  return React.createElement(\'span\', { className: cls }, children);',
    '}',
    '',
    'function Page(props) {',
    '  const data = props && props.data ? props.data : null;',
    '  const auth = props && props.auth ? props.auth : null;',
    '  const enableAuth = props && props.enableAuth === true;',
    '  const layout = css`min-height:100vh;background:#0b0b0d;color:#fff;`;',
    '  const topBar = css`position:sticky;top:0;z-index:10;background:rgba(11,11,13,.72);backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.06);`;',
    '  const topInner = css`max-width:1120px;margin:0 auto;padding:14px 18px;display:flex;align-items:center;gap:14px;`;',
    '  const logo = css`font-weight:700;letter-spacing:.6px;font-size:16px;`;',
    '  const nav = css`display:flex;gap:16px;opacity:.9;font-size:13px;`;',
    '  const navA = css`color:rgba(255,255,255,.86);text-decoration:none;`;',
    '  const spacer = css`flex:1;`;',
    '  const right = css`display:flex;align-items:center;gap:10px;`;',
    '  const lang = css`font-size:12px;opacity:.8;`;',
    '  const container = css`max-width:1120px;margin:0 auto;padding:18px;`;',
    '  const heroWrap = css`display:grid;grid-template-columns:1fr 380px;gap:18px;align-items:stretch;`;',
    '  const carousel = css`border-radius:18px;overflow:hidden;position:relative;min-height:310px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(135deg,#8b5cf6,#0f172a);`;',
    '  const slide = css`position:absolute;inset:0;display:flex;align-items:center;justify-content:center;`;',
    '  const slideInner = css`width:100%;height:100%;padding:22px;display:flex;gap:18px;align-items:center;`;',
    '  const cover = css`width:240px;height:240px;border-radius:18px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;overflow:hidden;`;',
    '  const coverImg = css`width:100%;height:100%;object-fit:cover;`;',
    '  const meta = css`display:flex;flex-direction:column;gap:10px;`;',
    '  const hTitle = css`font-size:40px;font-weight:800;line-height:1.05;letter-spacing:1px;`;',
    '  const hArtist = css`font-size:18px;opacity:.9;`;',
    '  const ssgNote = css`margin-top:8px;font-size:12px;opacity:.65;`;',
    '  const sideCard = css`border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);padding:16px;display:flex;flex-direction:column;gap:14px;`;',
    '  const sideTitle = css`font-size:16px;font-weight:700;`;',
    '  const songCard = css`display:flex;gap:12px;align-items:flex-start;`;',
    '  const songImg = css`width:120px;height:120px;border-radius:14px;background:rgba(255,255,255,.08);overflow:hidden;border:1px solid rgba(255,255,255,.1);`;',
    '  const songImgEl = css`width:100%;height:100%;object-fit:cover;`;',
    '  const songName = css`font-weight:700;`;',
    '  const songArtist = css`opacity:.85;font-size:12px;margin-top:4px;`;',
    '  const songDesc = css`opacity:.75;font-size:12px;line-height:1.5;margin-top:10px;`;',
    '  const likes = css`display:inline-flex;align-items:center;gap:6px;font-size:12px;opacity:.8;margin-top:10px;`;',
    '  const grid = css`margin-top:18px;display:grid;grid-template-columns:1fr;gap:18px;`;',
    '  const section = css`border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);overflow:hidden;`;',
    '  const sectionHead = css`display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06);`;',
    '  const sectionTitle = css`font-size:16px;font-weight:800;`;',
    '  const sectionRight = css`display:flex;gap:10px;align-items:center;`;',
    '  const pill = css`height:30px;border-radius:999px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);font-size:12px;color:#fff;text-decoration:none;`;',
    '  const list = css`padding:8px;`;',
    '  const row = css`display:grid;grid-template-columns:42px 44px 1fr 90px 92px;align-items:center;gap:12px;padding:10px 10px;border-radius:14px;`;',
    '  const rowHover = css`background:rgba(255,255,255,.02);`;',
    '  const idxCls = css`opacity:.7;font-size:12px;text-align:right;`;',
    '  const tinyCover = css`width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,.08);overflow:hidden;border:1px solid rgba(255,255,255,.08);`;',
    '  const tinyImg = css`width:100%;height:100%;object-fit:cover;`;',
    '  const songMain = css`display:flex;flex-direction:column;gap:2px;`;',
    '  const songT = css`font-weight:700;font-size:13px;`;',
    '  const songA = css`opacity:.75;font-size:12px;`;',
    '  const likeCls = css`opacity:.75;font-size:12px;display:flex;align-items:center;gap:6px;justify-content:flex-end;`;',
    '  const actions = css`display:flex;justify-content:flex-end;gap:8px;`;',
    '  const actionBtn = css`height:30px;width:30px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;display:inline-flex;align-items:center;justify-content:center;`;',
    '  const player = css`position:fixed;left:0;right:0;bottom:0;z-index:20;background:rgba(20,20,24,.78);backdrop-filter:blur(10px);border-top:1px solid rgba(255,255,255,.06);`;',
    '  const playerInner = css`max-width:1120px;margin:0 auto;padding:12px 18px;display:flex;align-items:center;gap:14px;`;',
    '  const playerNow = css`display:flex;flex-direction:column;gap:2px;`;',
    '  const playerTitle = css`font-weight:700;font-size:13px;`;',
    '  const playerArtist = css`opacity:.75;font-size:12px;`;',
    '  const playBtn = css`margin-left:auto;height:42px;width:42px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,70,120,.92);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;`;',
    '',
    '  const heroList = (data && Array.isArray(data.hero) ? data.hero : []).slice(0, 3);',
    '  const hero0 = heroList[0] || { title: \'Music\', artist: \'demo\', tag: \'推荐\' };',
    '  const songOfDay = data && data.songOfDay ? data.songOfDay : null;',
    '  const ranking = data && Array.isArray(data.ranking) ? data.ranking : [];',
    '',
    '  return React.createElement(',
    "    'div',",
    '    { className: layout },',
    '    React.createElement(',
    "      'div',",
    '      { className: topBar },',
    '      React.createElement(',
    "        'div',",
    '        { className: topInner },',
    "        React.createElement('div', { className: logo }, (data && data.site && data.site.name) || 'StreetVoice'),",
    '        React.createElement(',
    "          'nav',",
    '          { className: nav },',
    "          React.createElement('a', { className: navA, href: '/' }, '音乐人指南'),",
    "          React.createElement('a', { className: navA, href: '/' }, '流派'),",
    "          React.createElement('a', { className: navA, href: '/' }, '歌单'),",
    '        ),',
    "        React.createElement('div', { className: spacer }),",
    "        React.createElement('div', { className: right },",
    "          React.createElement('span', { className: lang }, '中文（简体）'),",
    "          React.createElement(Icon, { name: 'search' }),",
    "          React.createElement(Icon, { name: 'globe' }),",
    '          (enableAuth && auth) ? React.createElement(',
    "            React.Fragment,",
    '            null,',
    "            React.createElement('a', { className: navA, href: '/profile' }, '你好，' + String(auth.name || auth.email || '')),",
    "            React.createElement('form', { method: 'POST', action: '/api/logout', style: { display: 'inline' } },",
    "              React.createElement('button', { className: css`margin-left:8px;height:36px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;cursor:pointer;`, type: 'submit' }, '退出')",
    '            )',
    '          ) : React.createElement(',
    "            React.Fragment,",
    '            null,',
    '            enableAuth ? React.createElement(Button, { href: "/login", primary: false }, "登录") : null,',
    '            enableAuth ? React.createElement(Button, { href: "/register", primary: true }, "注册") : null',
    '          )',
    '        ),',
    '      ),',
    '    ),',
    '    React.createElement(',
    "      'div',",
    '      { className: container },',
    '      React.createElement(',
    "        'div',",
    '        { className: heroWrap },',
    '        React.createElement(',
    "          'div',",
    '          { className: carousel },',
    '          React.createElement(',
    "            'div',",
    '            { className: slide },',
    '            React.createElement(',
    "              'div',",
    '              { className: slideInner },',
    '              React.createElement(',
    "                'div',",
    '                { className: cover },',
    "                React.createElement('img', { className: coverImg, alt: hero0.title, src: hero0.cover || '' })",
    '              ),',
    '              React.createElement(',
    "                'div',",
    '                { className: meta },',
    "                React.createElement(Chip, null, hero0.tag || '推荐'),",
    "                React.createElement('div', { className: hTitle }, hero0.title || ''),",
    "                React.createElement('div', { className: hArtist }, hero0.artist || ''),",
    "                React.createElement('div', { className: ssgNote }, '首页使用 getStaticProps（生产环境走 SSG/ISR 缓存）')",
    '              ),',
    '            )',
    '          )',
    '        ),',
    '        React.createElement(',
    "          'aside',",
    '          { className: sideCard },',
    "          React.createElement('div', { className: sideTitle }, 'Song of the Day'),",
    '          songOfDay ? React.createElement(',
    "            'div',",
    '            { className: songCard },',
    "            React.createElement('div', { className: songImg }, React.createElement('img', { className: songImgEl, alt: songOfDay.title, src: songOfDay.cover || '' })),",
    "            React.createElement('div', null,",
    "              React.createElement('div', { className: songName }, songOfDay.title),",
    "              React.createElement('div', { className: songArtist }, songOfDay.artist),",
    "              React.createElement('div', { className: likes }, '♥', String(songOfDay.likes || 0)),",
    "              React.createElement('div', { className: songDesc }, songOfDay.desc || '')",
    '            )',
    '          ) : null',
    '        ),',
    '      ),',
    '      React.createElement(',
    "        'div',",
    '        { className: grid },',
    '        React.createElement(',
    "          'section',",
    '          { className: section },',
    '          React.createElement(',
    "            'div',",
    '            { className: sectionHead },',
    "            React.createElement('div', { className: sectionTitle }, '即时排行'),",
    "            React.createElement('div', { className: sectionRight },",
    "              React.createElement('a', { className: pill, href: '/' }, '更多排行榜'),",
    "              React.createElement('a', { className: pill, href: '/' }, '全部播放')",
    '            )',
    '          ),',
    "          React.createElement('div', { className: list },",
    '            ranking.map((s) => React.createElement(',
    "              'div',",
    '              { key: String(s.idx), className: row + \' \' + rowHover },',
    "              React.createElement('div', { className: idxCls }, String(clamp(Number(s.idx) || 0, 0, 999))),",
    "              React.createElement('div', { className: tinyCover }, React.createElement('img', { className: tinyImg, alt: s.title, src: s.cover || '' })),",
    "              React.createElement('div', { className: songMain },",
    "                React.createElement('div', { className: songT }, s.title),",
    "                React.createElement('div', { className: songA }, s.artist)",
    '              ),',
    "              React.createElement('div', { className: likeCls }, '♥', String(s.likes || 0)),",
    "              React.createElement('div', { className: actions },",
    "                React.createElement('button', { className: actionBtn, type: 'button', title: 'play' }, '▶'),",
    "                React.createElement('button', { className: actionBtn, type: 'button', title: 'add' }, '+'),",
    "                React.createElement('button', { className: actionBtn, type: 'button', title: 'next' }, '→')",
    '              )',
    '            ))',
    '          )',
    '        )',
    '      )',
    '    ),',
    '    React.createElement(',
    "      'div',",
    '      { className: player },',
    '      React.createElement(',
    "        'div',",
    '        { className: playerInner },',
    "        React.createElement('div', { className: css`width:44px;height:44px;border-radius:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08);overflow:hidden;` },",
    "          songOfDay ? React.createElement('img', { className: css`width:100%;height:100%;object-fit:cover;`, alt: songOfDay.title, src: songOfDay.cover || '' }) : null",
    '        ),',
    "        React.createElement('div', { className: playerNow },",
    "          React.createElement('div', { className: playerTitle }, songOfDay ? songOfDay.title : '—'),",
    "          React.createElement('div', { className: playerArtist }, songOfDay ? songOfDay.artist : '')",
    '        ),',
    "        React.createElement('div', { className: playBtn }, React.createElement(Icon, { name: 'play' }))",
    '      )',
    '    )',
    '  );',
    '}',
    '',
    'Page.getStaticProps = async () => {',
    "  const file = path.join(__dirname, '..', 'data', 'songs.json');",
    "  const raw = fs.readFileSync(file, 'utf8');",
    '  const data = JSON.parse(raw);',
    '  return { props: { data }, revalidate: 60 };',
    '};',
    '',
    'module.exports = Page;',
    '',
  ].join('\n');

  const loginJs = [
    "const React = require('react');",
    "const { css } = require('mini-next-cpp');",
    '',
    'function Field({ label, name, type, placeholder }) {',
    '  const wrap = css`display:flex;flex-direction:column;gap:8px;`;',
    '  const lab = css`font-size:12px;opacity:.82;`;',
    '  const input = css`height:40px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;padding:0 12px;outline:none;`;',
    '  return React.createElement(',
    "    'label',",
    '    { className: wrap },',
    "    React.createElement('div', { className: lab }, label),",
    "    React.createElement('input', { className: input, name, type, placeholder, required: true })",
    '  );',
    '}',
    '',
    'function Page(props) {',
    '  const auth = props && props.auth ? props.auth : null;',
    '  const box = css`min-height:100vh;background:#0b0b0d;color:#fff;display:flex;align-items:center;justify-content:center;padding:22px;`;',
    '  const card = css`width:100%;max-width:420px;border-radius:18px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);padding:18px;`;',
    '  const title = css`font-size:18px;font-weight:800;`;',
    '  const sub = css`margin-top:6px;font-size:12px;opacity:.72;line-height:1.5;`;',
    '  const form = css`margin-top:16px;display:flex;flex-direction:column;gap:12px;`;',
    '  const btn = css`margin-top:4px;height:42px;border-radius:12px;border:0;background:rgba(255,70,120,.92);color:#fff;font-weight:800;cursor:pointer;`;',
    '  const link = css`margin-top:12px;font-size:12px;opacity:.85;`;',
    '  const a = css`color:#fff;`;',
    '',
    '  if (auth) {',
    '    return React.createElement(',
    "      'div',",
    '      { className: box },',
    '      React.createElement(',
    "        'div',",
    '        { className: card },',
    "        React.createElement('div', { className: title }, '已登录'),",
    "        React.createElement('div', { className: sub }, '你已登录为 ' + String(auth.name || auth.email || '')),",
    "        React.createElement('a', { className: css`display:inline-flex;margin-top:16px;color:#fff;text-decoration:none;`, href: '/' }, '回到首页')",
    '      )',
    '    );',
    '  }',
    '',
    "  const nextUrl = props && props.query && props.query.next ? String(props.query.next) : '/';",
    '',
    '  return React.createElement(',
    "    'div',",
    '    { className: box },',
    '    React.createElement(',
    "      'div',",
    '      { className: card },',
    "      React.createElement('div', { className: title }, '登录'),",
    "      React.createElement('div', { className: sub }, '使用邮箱 + 密码登录。示例使用 SQLite 存储用户与会话。'),",
    "      React.createElement('form', { className: form, method: 'POST', action: '/api/login' },",
    "        React.createElement('input', { type: 'hidden', name: 'next', value: nextUrl }),",
    "        React.createElement(Field, { label: '邮箱', name: 'email', type: 'email', placeholder: 'you@example.com' }),",
    "        React.createElement(Field, { label: '密码', name: 'password', type: 'password', placeholder: '至少 6 位' }),",
    "        React.createElement('button', { className: btn, type: 'submit' }, '登录')",
    '      ),',
    "      React.createElement('div', { className: link }, '没有账号？ ', React.createElement('a', { className: a, href: '/register' }, '去注册'))",
    '    )',
    '  );',
    '}',
    '',
    'Page.getServerSideProps = async (ctx) => {',
    '  return { props: { query: ctx && ctx.query ? ctx.query : {} } };',
    '};',
    '',
    'module.exports = Page;',
    '',
  ].join('\n');

  const registerJs = [
    "const React = require('react');",
    "const { css } = require('mini-next-cpp');",
    '',
    'function Field({ label, name, type, placeholder }) {',
    '  const wrap = css`display:flex;flex-direction:column;gap:8px;`;',
    '  const lab = css`font-size:12px;opacity:.82;`;',
    '  const input = css`height:40px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;padding:0 12px;outline:none;`;',
    '  return React.createElement(',
    "    'label',",
    '    { className: wrap },',
    "    React.createElement('div', { className: lab }, label),",
    "    React.createElement('input', { className: input, name, type, placeholder, required: true })",
    '  );',
    '}',
    '',
    'function Page(props) {',
    '  const auth = props && props.auth ? props.auth : null;',
    '  const box = css`min-height:100vh;background:#0b0b0d;color:#fff;display:flex;align-items:center;justify-content:center;padding:22px;`;',
    '  const card = css`width:100%;max-width:420px;border-radius:18px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);padding:18px;`;',
    '  const title = css`font-size:18px;font-weight:800;`;',
    '  const sub = css`margin-top:6px;font-size:12px;opacity:.72;line-height:1.5;`;',
    '  const form = css`margin-top:16px;display:flex;flex-direction:column;gap:12px;`;',
    '  const btn = css`margin-top:4px;height:42px;border-radius:12px;border:0;background:rgba(255,70,120,.92);color:#fff;font-weight:800;cursor:pointer;`;',
    '  const link = css`margin-top:12px;font-size:12px;opacity:.85;`;',
    '  const a = css`color:#fff;`;',
    '',
    '  if (auth) {',
    '    return React.createElement(',
    "      'div',",
    '      { className: box },',
    '      React.createElement(',
    "        'div',",
    '        { className: card },',
    "        React.createElement('div', { className: title }, '已登录'),",
    "        React.createElement('div', { className: sub }, '你已登录为 ' + String(auth.name || auth.email || '')),",
    "        React.createElement('a', { className: css`display:inline-flex;margin-top:16px;color:#fff;text-decoration:none;`, href: '/' }, '回到首页')",
    '      )',
    '    );',
    '  }',
    '',
    '  return React.createElement(',
    "    'div',",
    '    { className: box },',
    '    React.createElement(',
    "      'div',",
    '      { className: card },',
    "      React.createElement('div', { className: title }, '注册'),",
    "      React.createElement('div', { className: sub }, '注册后将自动登录，并创建一个 SQLite 会话。'),",
    "      React.createElement('form', { className: form, method: 'POST', action: '/api/register' },",
    "        React.createElement(Field, { label: '昵称', name: 'name', type: 'text', placeholder: '你的名字' }),",
    "        React.createElement(Field, { label: '邮箱', name: 'email', type: 'email', placeholder: 'you@example.com' }),",
    "        React.createElement(Field, { label: '密码', name: 'password', type: 'password', placeholder: '至少 6 位' }),",
    "        React.createElement('button', { className: btn, type: 'submit' }, '创建账号')",
    '      ),',
    "      React.createElement('div', { className: link }, '已有账号？ ', React.createElement('a', { className: a, href: '/login' }, '去登录'))",
    '    )',
    '  );',
    '}',
    '',
    'module.exports = Page;',
    '',
  ].join('\n');

  const profileJs = [
    "const React = require('react');",
    "const { css } = require('mini-next-cpp');",
    '',
    'function Page(props) {',
    '  const auth = props && props.auth ? props.auth : null;',
    '  const wrap = css`min-height:100vh;background:#0b0b0d;color:#fff;padding:22px;`;',
    '  const card = css`max-width:720px;margin:0 auto;border-radius:18px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);padding:18px;`;',
    '  const title = css`font-size:18px;font-weight:800;`;',
    '  const sub = css`margin-top:10px;font-size:12px;opacity:.75;`;',
    '  const row = css`margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;`;',
    '  const chip = css`display:inline-flex;align-items:center;justify-content:center;padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);font-size:12px;`;',
    '',
    '  return React.createElement(',
    "    'div',",
    '    { className: wrap },',
    '    React.createElement(',
    "      'div',",
    '      { className: card },',
    "      React.createElement('div', { className: title }, '个人中心'),",
    '      auth ? React.createElement(',
    "        React.Fragment,",
    '        null,',
    "        React.createElement('div', { className: sub }, '此页面通过服务端插件 onRequest 做访问控制，已登录才可进入。'),",
    "        React.createElement('div', { className: row },",
    "          React.createElement('div', { className: chip }, 'ID: ' + String(auth.id)),",
    "          React.createElement('div', { className: chip }, 'Email: ' + String(auth.email)),",
    "          React.createElement('div', { className: chip }, 'Name: ' + String(auth.name))",
    '        ),',
    "        React.createElement('a', { className: css`display:inline-flex;margin-top:16px;color:#fff;text-decoration:none;`, href: '/' }, '回到首页')",
    '      ) : React.createElement(',
    "        React.Fragment,",
    '        null,',
    "        React.createElement('div', { className: sub }, '未登录'),",
    "        React.createElement('a', { className: css`display:inline-flex;margin-top:16px;color:#fff;text-decoration:none;`, href: '/login' }, '去登录')",
    '      )',
    '    )',
    '  );',
    '}',
    '',
    'module.exports = Page;',
    '',
  ].join('\n');

  const files = {
    'package.json': `${JSON.stringify(pkg, null, 2)}\n`,
    'server.js': serverJs,
    [path.join('plugins', 'app.js')]: buildAppPlugin({ css: cssChoice, ui: uiChoice, enableAuth }),
    ...(enableAuth ? { [path.join('plugins', 'auth.js')]: authPluginJs } : {}),
    [path.join('pages', 'index.js')]: indexJs,
    ...(enableAuth ? {
      [path.join('pages', 'login.js')]: loginJs,
      [path.join('pages', 'register.js')]: registerJs,
      [path.join('pages', 'profile.js')]: profileJs,
    } : {}),
    [path.join('data', 'songs.json')]: songsJson,
  };

  const dirs = [path.join('public', 'covers')];
  dirs.push('plugins');
  if (cssChoice === 'tailwind') {
    files['tailwind.config.cjs'] = buildTailwindConfig({ ui: uiChoice });
    files[path.join('styles', 'tailwind.css')] = [
      '@tailwind base;',
      '@tailwind components;',
      '@tailwind utilities;',
      '',
    ].join('\n');
    dirs.push('styles');
  }
  const assets = {
    [path.join('public', 'covers', 'missing.svg')]: coverSvg('网恋', '#7c3aed', '#111827'),
    [path.join('public', 'covers', 'blue.svg')]: coverSvg('Songwriter', '#2563eb', '#0f172a'),
    [path.join('public', 'covers', 'purple.svg')]: coverSvg('Live Session', '#a855f7', '#111827'),
    [path.join('public', 'covers', 'chair.svg')]: coverSvg('Song of Day', '#f97316', '#111827'),
    [path.join('public', 'covers', 'rain.svg')]: coverSvg('雨爱', '#22c55e', '#0f172a'),
    [path.join('public', 'covers', 'winter.svg')]: coverSvg('冬', '#06b6d4', '#0f172a'),
    [path.join('public', 'covers', 'rob.svg')]: coverSvg('阿兹盗贼症', '#ef4444', '#111827'),
    [path.join('public', 'covers', 'missin.svg')]: coverSvg('Missin\'', '#8b5cf6', '#0f172a'),
    [path.join('public', 'covers', 'sky.svg')]: coverSvg('空と絆', '#3b82f6', '#111827'),
    [path.join('public', 'covers', 'warm.svg')]: coverSvg('暖冬2025', '#f43f5e', '#111827'),
  };

  return { files, dirs, assets };
}

function runCommand(cwd, cmd, args) {
  const isWin = process.platform === 'win32';
  const c = isWin && cmd === 'npm' ? 'npm.cmd' : cmd;
  const r = childProcess.spawnSync(c, args, { cwd, stdio: 'inherit' });
  if (r.status !== 0) {
    const code = typeof r.status === 'number' ? r.status : 1;
    throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${code}`);
  }
}

function resolveMiniNextDependency(targetAbs) {
  try {
    const repoRoot = path.resolve(__dirname, '..');
    const pkgPath = path.join(repoRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) return '^1.0.0';
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (!pkg || pkg.name !== 'mini-next-cpp') return '^1.0.0';
    const v = String(pkg.version || '1.0.0');

    const abs = path.resolve(String(targetAbs || ''));
    const examplesDir = path.join(repoRoot, 'examples') + path.sep;
    if (abs.startsWith(examplesDir)) {
      const rel = path.relative(abs, repoRoot) || '.';
      const p = rel.startsWith('.') ? rel : `./${rel}`;
      return `file:${p.split(path.sep).join('/')}`;
    }
    return `^${v}`;
  } catch (_) {
    return '^1.0.0';
  }
}

async function createApp(targetDir, options = {}) {
  const typescript = options.typescript === true;
  const template = String(options.template || 'basic');
  const css = options.css || 'none';
  const ui = options.ui || 'none';
  const db = options.db || 'none';
  const install = options.install === true;
  const abs = path.resolve(process.cwd(), targetDir);
  if (fs.existsSync(abs) && !fs.statSync(abs).isDirectory()) {
    throw new Error(`Target path exists and is not a directory: ${abs}`);
  }
  if (!fs.existsSync(abs)) {
    fs.mkdirSync(abs, { recursive: true });
  }
  if (!isDirEmpty(abs)) {
    throw new Error(`Target directory is not empty: ${abs}`);
  }

  const appName = normalizeAppName(abs);
  const miniNextDependency = resolveMiniNextDependency(abs);
  const tpl = template === 'music'
    ? buildMusicTemplate({ appName, css, ui, db, miniNextDependency })
    : buildBasicTemplate({ appName, typescript, css, ui, miniNextDependency });

  for (const d of tpl.dirs || []) {
    fs.mkdirSync(path.join(abs, d), { recursive: true });
  }

  for (const [rel, content] of Object.entries(tpl.files || {})) {
    writeFileSafe(path.join(abs, rel), String(content));
  }

  if (tpl.assets && typeof tpl.assets === 'object') {
    for (const [rel, content] of Object.entries(tpl.assets)) {
      if (content == null) continue;
      writeFileSafe(path.join(abs, rel), String(content));
    }
  }

  if (install) {
    runCommand(abs, 'npm', ['install']);
    const needsCssBuild = tpl.files && Object.prototype.hasOwnProperty.call(tpl.files, 'tailwind.config.cjs');
    if (needsCssBuild) {
      runCommand(abs, 'npm', ['run', 'build:css']);
    }
  }

  return { dir: abs };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.dir) {
    process.stdout.write(usage());
    process.exit(args.help ? 0 : 1);
  }
  try {
    const out = await createApp(args.dir, {
      typescript: args.typescript,
      template: args.template,
      css: args.css,
      ui: args.ui,
      db: args.db,
      install: args.install,
    });
    process.stdout.write(`Created mini-next-cpp app in ${out.dir}\n`);
    process.stdout.write('Next:\n');
    process.stdout.write(`  cd ${args.dir}\n`);
    if (!args.install) {
      process.stdout.write('  npm install\n');
      const needsCssBuild = String(args.css || '').toLowerCase() === 'tailwind';
      if (needsCssBuild) process.stdout.write('  npm run build:css\n');
    }
    process.stdout.write('  npm run dev\n');
  } catch (err) {
    process.stderr.write(`${String(err && err.message ? err.message : err)}\n`);
    process.exit(1);
  }
}

module.exports = { createApp, main };

if (require.main === module) {
  main();
}
