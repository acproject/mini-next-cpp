const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const native = require('../build/Release/mini_next.node');

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

console.log('cpp-test OK');

