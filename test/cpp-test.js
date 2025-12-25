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
    if (Buffer.isBuffer(content)) {
      fs.writeFileSync(filePath, content);
      return;
    }
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
      writeFile(path.join(publicDir, 'a.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wIAAgMBAp0N/QAAAABJRU5ErkJggg==', 'base64'));

      const http = require('http');
      const { createMiniNextServer } = require('../js/server');
      const { app, close } = createMiniNextServer({ pagesDir, publicDir, isProd: true, ssrCacheSize: 8, isrCacheSize: 8 });
      const server = app.listen(0, async () => {
        const port = server.address().port;
        const get = (p, headers = {}, asBuffer = false) => new Promise((res, rej) => {
          const req = http.request({ hostname: '127.0.0.1', port, path: p, method: 'GET', headers }, (r) => {
            if (asBuffer) {
              const chunks = [];
              r.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
              r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks) }));
              return;
            }
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

          let hasSharp = false;
          try {
            hasSharp = !!require('sharp');
          } catch (_) {
            hasSharp = false;
          }

          const p = '/_mini_next/image?url=/a.png&width=2&height=2&quality=80&f=webp';
          const t1 = await get(p, {}, true);
          assert.strictEqual(t1.status, 200);
          assert.ok(Buffer.isBuffer(t1.body) && t1.body.length > 0);
          if (hasSharp) {
            assert.ok(String(t1.headers['content-type'] || '').includes('image/webp'));
          } else {
            assert.ok(String(t1.headers['content-type'] || '').includes('image/png'));
          }
          const etag2 = String(t1.headers.etag || '');
          assert.ok(etag2.length > 0);
          const t2 = await get(p, { 'if-none-match': etag2 }, true);
          assert.strictEqual(t2.status, 304);

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

  await new Promise((resolve, reject) => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-next-cpp-isr-invalidate-'));
    const pagesDir = path.join(rootDir, 'pages');
    const publicDir = path.join(rootDir, 'public');
    try {
      const pagePath = path.join(pagesDir, 'index.js');
      writeFile(
        pagePath,
        [
          'function Page() {',
          "  return 'v=1';",
          '}',
          '',
          'Page.getStaticProps = async () => ({ props: { v: 1 }, revalidate: 60 });',
          '',
          'module.exports = Page;',
          '',
        ].join('\n'),
      );

      const http = require('http');
      const { createMiniNextServer } = require('../js/server');

      let apiRef = null;
      const { app, close } = createMiniNextServer({
        pagesDir,
        publicDir,
        isProd: true,
        ssrCacheSize: 8,
        isrCacheSize: 8,
        plugins: [
          {
            apply(api) {
              apiRef = api;
            },
          },
        ],
      });

      const server = app.listen(0, async () => {
        const port = server.address().port;
        const get = (p) => new Promise((res, rej) => {
          const req = http.request({ hostname: '127.0.0.1', port, path: p, method: 'GET' }, (r) => {
            let data = '';
            r.setEncoding('utf8');
            r.on('data', (c) => (data += c));
            r.on('end', () => res({ status: r.statusCode, body: data }));
          });
          req.on('error', rej);
          req.end();
        });

        try {
          const r1 = await get('/');
          assert.strictEqual(r1.status, 200);
          assert.ok(r1.body.includes('v=1'));

          writeFile(
            pagePath,
            [
              'function Page() {',
              "  return 'v=2';",
              '}',
              '',
              'Page.getStaticProps = async () => ({ props: { v: 2 }, revalidate: 60 });',
              '',
              'module.exports = Page;',
              '',
            ].join('\n'),
          );
          assert.ok(apiRef && typeof apiRef.invalidate === 'function');
          apiRef.invalidate(pagePath);

          const r2 = await get('/');
          assert.strictEqual(r2.status, 200);
          assert.ok(r2.body.includes('v=2'));
        } catch (e) {
          server.close(() => {
            try {
              close();
            } finally {
              fs.rmSync(rootDir, { recursive: true, force: true });
              reject(e);
            }
          });
          return;
        }

        server.close(() => {
          try {
            close();
          } finally {
            fs.rmSync(rootDir, { recursive: true, force: true });
            resolve();
          }
        });
      });
    } catch (e) {
      try {
        fs.rmSync(rootDir, { recursive: true, force: true });
      } finally {
        reject(e);
      }
    }
  });

  await new Promise((resolve, reject) => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-next-cpp-plugin-'));
    const pagesDir = path.join(rootDir, 'pages');
    const publicDir = path.join(rootDir, 'public');
    try {
      writeFile(path.join(pagesDir, 'index.js'), 'module.exports = () => "ok";');
      const http = require('http');
      const { createMiniNextServer } = require('../js/server');

      const pluginCalls = [];
      const { app, close } = createMiniNextServer({
        pagesDir,
        publicDir,
        isProd: true,
        plugins: [
          {
            onStart(ctx) {
              pluginCalls.push(['onStart', !!ctx && ctx.isProd === true]);
            },
            onRequest(ctx) {
              pluginCalls.push(['onRequest', String(ctx && ctx.urlPath)]);
            },
            onPageResolved(ctx) {
              pluginCalls.push(['onPageResolved', String(ctx && ctx.modulePath)]);
            },
            onRendered(ctx) {
              pluginCalls.push(['onRendered', typeof (ctx && ctx.html)]);
            },
            onResponse(ctx) {
              pluginCalls.push(['onResponse', Number(ctx && ctx.statusCode)]);
            },
          },
        ],
      });

      const server = app.listen(0, async () => {
        const port = server.address().port;
        const get = (p) => new Promise((res, rej) => {
          const req = http.request({ hostname: '127.0.0.1', port, path: p, method: 'GET' }, (r) => {
            let data = '';
            r.setEncoding('utf8');
            r.on('data', (c) => (data += c));
            r.on('end', () => res({ status: r.statusCode, body: data }));
          });
          req.on('error', rej);
          req.end();
        });

        try {
          const r = await get('/');
          assert.strictEqual(r.status, 200);
          assert.ok(r.body.includes('ok'));

          const kinds = pluginCalls.map((c) => c[0]);
          assert.ok(kinds.includes('onStart'));
          assert.ok(kinds.includes('onRequest'));
          assert.ok(kinds.includes('onPageResolved'));
          assert.ok(kinds.includes('onRendered'));
          assert.ok(kinds.includes('onResponse'));
        } catch (e) {
          server.close(() => {
            try {
              close();
            } finally {
              fs.rmSync(rootDir, { recursive: true, force: true });
              reject(e);
            }
          });
          return;
        }

        server.close(() => {
          try {
            close();
          } finally {
            fs.rmSync(rootDir, { recursive: true, force: true });
            resolve();
          }
        });
      });
    } catch (e) {
      try {
        fs.rmSync(rootDir, { recursive: true, force: true });
      } finally {
        reject(e);
      }
    }
  });

  await new Promise((resolve, reject) => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-next-cpp-plugin2-'));
    const pagesDir = path.join(rootDir, 'pages');
    const publicDir = path.join(rootDir, 'public');
    try {
      writeFile(path.join(pagesDir, 'index.js'), "module.exports = () => 'home';");
      writeFile(path.join(pagesDir, 'user', '[id].js'), "module.exports = (props) => 'id=' + String(props && props.params ? props.params.id : '');");

      const http = require('http');
      const { createMiniNextServer } = require('../js/server');
      const { app, close } = createMiniNextServer({
        pagesDir,
        publicDir,
        isProd: true,
        plugins: [
          {
            onRequest(ctx) {
              if (ctx && ctx.urlPath === '/rewritten') return { urlPath: '/user/123' };
              return null;
            },
            onNotFound(ctx) {
              if (ctx && ctx.urlPath === '/missing') return { handled: true, status: 418, body: 'teapot' };
              return null;
            },
            getClientScripts() {
              return ['/global.js'];
            },
          },
        ],
      });

      const server = app.listen(0, async () => {
        const port = server.address().port;
        const get = (p) => new Promise((res, rej) => {
          const req = http.request({ hostname: '127.0.0.1', port, path: p, method: 'GET' }, (r) => {
            let data = '';
            r.setEncoding('utf8');
            r.on('data', (c) => (data += c));
            r.on('end', () => res({ status: r.statusCode, body: data }));
          });
          req.on('error', rej);
          req.end();
        });

        try {
          const r1 = await get('/rewritten');
          assert.strictEqual(r1.status, 200);
          assert.ok(r1.body.includes('id=123'));
          assert.ok(r1.body.includes('<script src="/global.js"></script>'));

          const r2 = await get('/missing');
          assert.strictEqual(r2.status, 418);
          assert.ok(r2.body.includes('teapot'));
        } catch (e) {
          server.close(() => {
            try {
              close();
            } finally {
              fs.rmSync(rootDir, { recursive: true, force: true });
              reject(e);
            }
          });
          return;
        }

        server.close(() => {
          try {
            close();
          } finally {
            fs.rmSync(rootDir, { recursive: true, force: true });
            resolve();
          }
        });
      });
    } catch (e) {
      try {
        fs.rmSync(rootDir, { recursive: true, force: true });
      } finally {
        reject(e);
      }
    }
  });

  await new Promise((resolve, reject) => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-next-cpp-cli-'));
    try {
      const cli = require('../js/create-mini-next-app');
      assert.ok(cli && typeof cli.createApp === 'function');
      cli.createApp(path.join(rootDir, 'my-app'), { typescript: true })
        .then((out) => {
          assert.ok(out && typeof out.dir === 'string' && out.dir.length > 0);
          assert.ok(fs.existsSync(path.join(out.dir, 'package.json')));
          assert.ok(fs.existsSync(path.join(out.dir, 'server.js')));
          assert.ok(fs.existsSync(path.join(out.dir, 'pages', 'index.ts')));
          resolve();
        })
        .catch(reject)
        .finally(() => {
          fs.rmSync(rootDir, { recursive: true, force: true });
        });
    } catch (e) {
      try {
        fs.rmSync(rootDir, { recursive: true, force: true });
      } finally {
        reject(e);
      }
    }
  });

  {
    const { createMiniNextEdgeHandler } = require('../js/edge');
    const handler = createMiniNextEdgeHandler({
      routes: {
        '/': (props) => `edge-ok:${String(props && props.added ? props.added : '')}`,
        '/user/[id]': (props) => `id=${props && props.params ? props.params.id : ''},x=${String(props && props.query ? props.query.x || '' : '')},extra=${String(props && props.extra ? props.extra : '')}`,
        '/boom': () => {
          throw new Error('boom');
        },
      },
      plugins: [
        {
          onRequest(ctx) {
            if (ctx && ctx.urlPath === '/rewritten') return { urlPath: '/user/123' };
          },
          onPageResolved(ctx) {
            if (ctx && ctx.urlPath === '/user/999') return { params: { id: '321' } };
          },
          onNotFound(ctx) {
            if (ctx && ctx.urlPath === '/missing') return { handled: true, status: 418, body: 'teapot' };
          },
          onError(ctx) {
            if (ctx && ctx.urlPath === '/boom') return { handled: true, status: 520, body: 'edge-error' };
          },
          getClientScripts() {
            return ['/global.js'];
          },
          extendPageProps(props) {
            const base = props && typeof props === 'object' ? props : {};
            return { ...base, extra: 'x', added: '1' };
          },
          transformHtml(html) {
            return String(html).replace('edge-ok', 'edge-ok-x');
          },
        },
      ],
    });

    const r1 = await handler(new Request('http://localhost/'));
    assert.strictEqual(r1.status, 200);
    const t1 = await r1.text();
    assert.ok(t1.includes('edge-ok-x'));
    assert.ok(t1.includes('<script src="/global.js"></script>'));

    const r2 = await handler(new Request('http://localhost/rewritten?x=1'));
    assert.strictEqual(r2.status, 200);
    const t2 = await r2.text();
    assert.ok(t2.includes('id=123'));
    assert.ok(t2.includes('x=1'));
    assert.ok(t2.includes('extra=x'));

    const r3 = await handler(new Request('http://localhost/user/999'));
    assert.strictEqual(r3.status, 200);
    const t3 = await r3.text();
    assert.ok(t3.includes('id=321'));

    const r4 = await handler(new Request('http://localhost/missing'));
    assert.strictEqual(r4.status, 418);
    const t4 = await r4.text();
    assert.ok(t4.includes('teapot'));

    const r5 = await handler(new Request('http://localhost/boom'));
    assert.strictEqual(r5.status, 520);
    const t5 = await r5.text();
    assert.ok(t5.includes('edge-error'));

    const r6 = await handler(new Request('http://localhost/nope'));
    assert.strictEqual(r6.status, 404);
  }

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
      }, 5000);

      watcher.start(dir, (ev) => {
        clearTimeout(timer);
        cleanup();
        assert.ok(ev && typeof ev.path === 'string' && ev.path.length > 0);
        resolve();
      }, { recursive: true });

      setTimeout(() => {
        writeFile(path.join(dir, 'a.txt'), '1');
      }, 50);
    });
  }

  console.log('cpp-test OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
