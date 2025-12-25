#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const out = { dir: null, typescript: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--ts' || a === '--typescript') {
      out.typescript = true;
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
    '  create-mini-next-app <dir> [--ts]',
    '',
    'Examples:',
    '  create-mini-next-app my-app',
    '  create-mini-next-app my-app --ts',
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

async function createApp(targetDir, options = {}) {
  const typescript = options.typescript === true;
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

  const appName = String(path.basename(abs) || 'mini-next-app')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '') || 'mini-next-app';

  const pkg = {
    name: appName,
    version: '0.1.0',
    private: true,
    type: 'commonjs',
    scripts: {
      dev: 'node server.js',
    },
    dependencies: {
      'mini-next-cpp': '^1.0.0',
    },
  };

  const serverJs = [
    "const { startMiniNextDevServer } = require('mini-next-cpp');",
    '',
    'startMiniNextDevServer({',
    "  port: Number(process.env.PORT || 3000),",
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

  writeFileSafe(path.join(abs, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  writeFileSafe(path.join(abs, 'server.js'), serverJs);
  if (typescript) {
    writeFileSafe(path.join(abs, 'pages', 'index.ts'), pageTs);
  } else {
    writeFileSafe(path.join(abs, 'pages', 'index.js'), pageJs);
  }
  fs.mkdirSync(path.join(abs, 'public'), { recursive: true });

  return { dir: abs };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.dir) {
    process.stdout.write(usage());
    process.exit(args.help ? 0 : 1);
  }
  try {
    const out = await createApp(args.dir, { typescript: args.typescript });
    process.stdout.write(`Created mini-next-cpp app in ${out.dir}\n`);
    process.stdout.write('Next:\n');
    process.stdout.write(`  cd ${args.dir}\n`);
    process.stdout.write('  npm install\n');
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

