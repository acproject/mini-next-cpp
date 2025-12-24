const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const native = require('../build/Release/mini_next.node');

async function main() {
  function withTempDir(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-next-cpp-'));
    try {
      return fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  function writeFile(filePath, content = '') {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
  }

  withTempDir((pagesDir) => {
    writeFile(path.join(pagesDir, 'index.js'), 'module.exports = () => null;');
    writeFile(path.join(pagesDir, 'blog', 'index.js'), 'module.exports = () => null;');
    writeFile(path.join(pagesDir, 'user', '[id].js'), 'module.exports = () => null;');

    const rm = new native.RouteMatcher(pagesDir);

    const m1 = rm.match('/');
    assert.strictEqual(m1.matched, true);
    assert.strictEqual(m1.filePath, path.join(pagesDir, 'index.js'));

    const m2 = rm.match('/blog');
    assert.strictEqual(m2.matched, true);
    assert.strictEqual(m2.filePath, path.join(pagesDir, 'blog', 'index.js'));

    const m3 = rm.match('/user/123');
    assert.strictEqual(m3.matched, true);
    assert.strictEqual(m3.filePath, path.join(pagesDir, 'user', '[id].js'));
    assert.deepStrictEqual(m3.params, { id: '123' });
  });

  {
    const c = new native.SSRCache(2);
    assert.strictEqual(c.get('k'), undefined);
    c.set('k', 'v');
    assert.strictEqual(c.get('k'), 'v');
    c.erase('k');
    assert.strictEqual(c.get('k'), undefined);
    c.set('a', '1');
    c.clear();
    assert.strictEqual(c.get('a'), undefined);
  }

  {
    const html = native.markdownToHtml('# Hi\n\n- a\n- b\n\n`x` **y**');
    assert.ok(html.includes('<h1>Hi</h1>'));
    assert.ok(html.includes('<ul>'));
    assert.ok(html.includes('<code>x</code>'));
    assert.ok(html.includes('<strong>y</strong>'));
  }

  {
    const out1 = native.renderTemplate('Hello {{name}}', { name: '<x>' });
    assert.strictEqual(out1, 'Hello &lt;x&gt;');
    const out2 = native.renderTemplate('Hello {{{name}}}', { name: '<x>' });
    assert.strictEqual(out2, 'Hello <x>');
  }

  {
    const { css, runWithStyleRegistry } = require('../js/css');
    const out = await runWithStyleRegistry(async () => {
      const className = css`color: red; font-size: 16px;`;
      return { className };
    });
    assert.ok(typeof out.result.className === 'string' && out.result.className.startsWith('mn_'));
    assert.ok(out.stylesHtml.includes(`.${out.result.className}{`));
    assert.ok(out.stylesHtml.includes('color: red'));

    const out2 = await runWithStyleRegistry(async () => ({ ok: true }));
    assert.strictEqual(out2.stylesHtml, '');
  }

  await new Promise((resolve, reject) => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-next-cpp-isr-'));
    const pagesDir = path.join(rootDir, 'pages');
    const publicDir = path.join(rootDir, 'public');
    try {
      writeFile(
        path.join(pagesDir, 'index.js'),
        [
          'function Page(props) {',
          "  return 'n=' + String(props.n);",
          '}',
          '',
          'Page.getStaticProps = async () => {',
          '  globalThis.__isr_n = (globalThis.__isr_n || 0) + 1;',
          '  return { props: { n: globalThis.__isr_n }, revalidate: 1 };',
          '};',
          '',
          'module.exports = Page;',
          '',
        ].join('\n'),
      );
      writeFile(path.join(publicDir, 'a.svg'), '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');

      const http = require('http');
      const { createMiniNextServer } = require('../js/server');
      const { app, close } = createMiniNextServer({ pagesDir, publicDir, isProd: true, ssrCacheSize: 8, isrCacheSize: 8 });
      const server = app.listen(0, async () => {
        const port = server.address().port;
        const get = (p, headers = {}) => new Promise((res, rej) => {
          const req = http.request({ hostname: '127.0.0.1', port, path: p, method: 'GET', headers }, (r) => {
            let data = '';
            r.setEncoding('utf8');
            r.on('data', (c) => (data += c));
            r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: data }));
          });
          req.on('error', rej);
          req.end();
        });

        try {
          const r1 = await get('/');
          assert.strictEqual(r1.status, 200);
          assert.ok(r1.body.includes('n=1'));

          await new Promise((r) => setTimeout(r, 1100));
          const r2 = await get('/');
          assert.strictEqual(r2.status, 200);
          assert.ok(r2.body.includes('n=2'));

          const img1 = await get('/_mini_next/image?url=/a.svg');
          assert.strictEqual(img1.status, 200);
          assert.ok(String(img1.headers['content-type'] || '').includes('image/svg+xml'));
          const etag = String(img1.headers.etag || '');
          assert.ok(etag.length > 0);
          const img2 = await get('/_mini_next/image?url=/a.svg', { 'if-none-match': etag });
          assert.strictEqual(img2.status, 304);

          server.close(() => {
            try {
              close();
            } finally {
              fs.rmSync(rootDir, { recursive: true, force: true });
              resolve();
            }
          });
        } catch (e) {
          server.close(() => {
            try {
              close();
            } finally {
              fs.rmSync(rootDir, { recursive: true, force: true });
              reject(e);
            }
          });
        }
      });
    } catch (e) {
      try {
        fs.rmSync(rootDir, { recursive: true, force: true });
      } finally {
        reject(e);
      }
    }
  });

  withTempDir((tmpDir) => {
    const pagePath = path.join(tmpDir, 'page.js');
    writeFile(
      pagePath,
      [
        'function Page(props) {',
        '  const React = globalThis.__MINI_NEXT_REACT__;',
        "  return React.createElement('div', null, 'hi ' + String(props.name || ''));",
        '}',
        'module.exports = Page;',
        '',
      ].join('\n'),
    );

    const html = native.renderToString(pagePath, JSON.stringify({ name: 'alice' }));
    assert.ok(typeof html === 'string' && html.includes('hi alice'));
  });

  {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-next-cpp-watch-'));
    const watcher = new native.FileWatcher();
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        try {
          watcher.stop();
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('FileWatcher timeout'));
      }, 1500);

      watcher.start(dir, (ev) => {
        clearTimeout(timer);
        cleanup();
        assert.ok(ev && typeof ev.path === 'string' && ev.path.length > 0);
        resolve();
      }, { recursive: true });

      writeFile(path.join(dir, 'a.txt'), '1');
    });
  }

  console.log('cpp-test OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
