const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');

function parseCookies(req) {
  const raw = String((req && req.headers && req.headers.cookie) || '');
  const out = {};
  for (const part of raw.split(';')) {
    const p = part.trim();
    if (!p) continue;
    const idx = p.indexOf('=');
    if (idx < 0) continue;
    const k = decodeURIComponent(p.slice(0, idx).trim());
    const v = decodeURIComponent(p.slice(idx + 1).trim());
    if (!k) continue;
    if (out[k] == null) out[k] = v;
  }
  return out;
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function pbkdf2Hash(password, saltHex) {
  const salt = Buffer.from(saltHex, 'hex');
  const dk = crypto.pbkdf2Sync(String(password || ''), salt, 100000, 32, 'sha256');
  return dk.toString('hex');
}

function randomHex(n) {
  return crypto.randomBytes(n).toString('hex');
}

function ensureDb(dbPath) {
  const abs = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const db = new Database(abs);
  db.pragma('journal_mode = WAL');
  db.exec([
    'CREATE TABLE IF NOT EXISTS users (',
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
    '  email TEXT NOT NULL UNIQUE,',
    '  name TEXT NOT NULL,',
    '  password_salt TEXT NOT NULL,',
    '  password_hash TEXT NOT NULL,',
    '  created_at INTEGER NOT NULL',
    ');',
    'CREATE TABLE IF NOT EXISTS sessions (',
    '  token TEXT PRIMARY KEY,',
    '  user_id INTEGER NOT NULL,',
    '  expires_at INTEGER NOT NULL,',
    '  created_at INTEGER NOT NULL,',
    '  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE',
    ');',
    'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);',
    'CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);',
  ].join('\n'));
  return db;
}

function createAuthPlugin(options = {}) {
  const cookieName = String(options.cookieName || 'mn_session');
  const sessionMaxAgeSec = Number(options.sessionMaxAgeSec || 60 * 60 * 24 * 7);
  const db = ensureDb(String(options.dbPath || path.join(process.cwd(), 'data', 'app.db')));

  const stmtGetSession = db.prepare(
    'SELECT s.token, s.user_id, s.expires_at, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? LIMIT 1'
  );
  const stmtDeleteSession = db.prepare('DELETE FROM sessions WHERE token = ?');
  const stmtInsertSession = db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)');
  const stmtFindUserByEmail = db.prepare('SELECT id, email, name, password_salt, password_hash FROM users WHERE email = ? LIMIT 1');
  const stmtInsertUser = db.prepare('INSERT INTO users (email, name, password_salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)');

  function getUserFromReq(req) {
    const cookies = parseCookies(req);
    const token = cookies[cookieName];
    if (!token) return null;
    const row = stmtGetSession.get(String(token));
    if (!row) return null;
    if (Number(row.expires_at) < nowSec()) {
      try { stmtDeleteSession.run(String(token)); } catch (_) {}
      return null;
    }
    return { id: row.user_id, email: row.email, name: row.name, token: String(row.token) };
  }

  function setSessionCookie(res, token) {
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: sessionMaxAgeSec * 1000,
    });
  }

  function clearSessionCookie(res) {
    res.cookie(cookieName, '', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  }

  function requireAuth(req, res, next) {
    const u = getUserFromReq(req);
    if (!u) {
      res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      return;
    }
    req.miniNextUser = u;
    next();
  }

  return {
    apply(api) {
      const app = api && api.app;
      if (!app) return;

      app.use((req, _res, next) => {
        try { req.miniNextUser = getUserFromReq(req); } catch (_) { req.miniNextUser = null; }
        next();
      });

      app.get('/api/me', (req, res) => {
        const u = req.miniNextUser;
        if (!u) {
          res.json({ ok: true, user: null });
          return;
        }
        res.json({ ok: true, user: { id: u.id, email: u.email, name: u.name } });
      });

      app.post('/api/register', (req, res) => {
        const email = String((req.body && req.body.email) || '').trim().toLowerCase();
        const name = String((req.body && req.body.name) || '').trim();
        const password = String((req.body && req.body.password) || '');
        if (!email || !name || password.length < 6) {
          res.status(400).send('Bad Request');
          return;
        }
        const existing = stmtFindUserByEmail.get(email);
        if (existing) {
          res.status(409).send('Email already registered');
          return;
        }
        const salt = randomHex(16);
        const hash = pbkdf2Hash(password, salt);
        const t = db.transaction(() => {
          const info = stmtInsertUser.run(email, name, salt, hash, nowSec());
          const userId = Number(info.lastInsertRowid);
          const token = randomHex(32);
          const exp = nowSec() + sessionMaxAgeSec;
          stmtInsertSession.run(token, userId, exp, nowSec());
          return { userId, token };
        });
        const out = t();
        setSessionCookie(res, out.token);
        res.redirect('/');
      });

      app.post('/api/login', (req, res) => {
        const email = String((req.body && req.body.email) || '').trim().toLowerCase();
        const password = String((req.body && req.body.password) || '');
        if (!email || !password) {
          res.status(400).send('Bad Request');
          return;
        }
        const u = stmtFindUserByEmail.get(email);
        if (!u) {
          res.status(401).send('Invalid credentials');
          return;
        }
        const hash = pbkdf2Hash(password, String(u.password_salt));
        if (hash !== String(u.password_hash)) {
          res.status(401).send('Invalid credentials');
          return;
        }
        const token = randomHex(32);
        const exp = nowSec() + sessionMaxAgeSec;
        stmtInsertSession.run(token, Number(u.id), exp, nowSec());
        setSessionCookie(res, token);
        const nextUrl = String((req.body && req.body.next) || (req.query && req.query.next) || '/');
        res.redirect(nextUrl.startsWith('/') ? nextUrl : '/');
      });

      app.post('/api/logout', (req, res) => {
        const u = req.miniNextUser;
        if (u && u.token) {
          try { stmtDeleteSession.run(String(u.token)); } catch (_) {}
        }
        clearSessionCookie(res);
        res.redirect('/');
      });

      app.get('/api/protected', requireAuth, (req, res) => {
        const u = req.miniNextUser;
        res.json({ ok: true, user: { id: u.id, email: u.email, name: u.name } });
      });
    },
    extendPageProps(props, ctx) {
      const req = ctx && ctx.req;
      const u = req && req.miniNextUser ? req.miniNextUser : null;
      const base = props && typeof props === 'object' ? props : {};
      return { ...base, auth: u ? { id: u.id, email: u.email, name: u.name } : null };
    },
    onRequest(ctx) {
      const req = ctx && ctx.req;
      const res = ctx && ctx.res;
      const urlPath = String(ctx && ctx.urlPath ? ctx.urlPath : '/');
      if (!req || !res) return;
      if (urlPath === '/profile') {
        const u = req.miniNextUser;
        if (!u) {
          return { handled: true, status: 302, headers: { location: '/login?next=%2Fprofile' }, body: '' };
        }
      }
    },
  };
}

module.exports = { createAuthPlugin };
