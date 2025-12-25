# mini-next-cpp

基于 C++ 的小型 Next.js 风格框架（支持 SSR / SSG / ISR、插件系统、Edge 运行时适配、CSS-in-JS、图片代理/可选优化）。

## 安装

本包包含 Node-API 原生扩展，安装时会触发 `node-gyp rebuild`。

前置依赖：

- Node.js >= 14
- Python 3
- C/C++ 编译工具链（macOS: Xcode Command Line Tools / Linux: build-essential / Windows: VS Build Tools）

```bash
npm i mini-next-cpp
```

## 快速开始（代码方式）

创建 `server.js`：

```js
const path = require('path');
const { startMiniNextDevServer } = require('mini-next-cpp');

startMiniNextDevServer({
  port: Number(process.env.PORT || 3000),
  pagesDir: path.join(__dirname, 'pages'),
  publicDir: path.join(__dirname, 'public'),
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
```

创建 `pages/index.js`：

```js
function Page(props) {
  return 'hello ' + String(props && props.name ? props.name : 'mini-next-cpp');
}

Page.getServerSideProps = async () => {
  return { props: { name: 'mini-next-cpp' } };
};

module.exports = Page;
```

启动：

```bash
node server.js
```

## 脚手架（create-mini-next-app）

```bash
npx create-mini-next-app my-app
cd my-app
npm run dev
```

常用参数：

```bash
npx create-mini-next-app my-app --template music --db sqlite --css tailwind --ui daisyui
```

可选项：

- `--template <basic|music>`
- `--db <none|sqlite>`（默认 `none`）
- `--css <none|tailwind|pico|bootstrap>`（默认 `tailwind`）
- `--ui <none|daisyui|preline|flowbite>`（默认 `daisyui`）
- `--no-install`

## C++ CLI（mn）

安装后可用 `mn` 简化脚手架命令：

```bash
mn create my-app --template music --db sqlite --css tailwind --ui daisyui
```

## C++ 静态部署服务器（mini-next-serve）

`mini-next-serve` 是一个极简静态文件服务器（用于部署静态产物/导出目录），示例：

```bash
mini-next-serve --dir ./dist --port 3000
```

访问规则：

- 直接读取 `--dir` 下的文件
- `GET /public/*` 会映射到 `--dir/public/*`
- 当请求文件不存在时，尝试回退到 `--dir/index.html`（适合 SPA/静态导出）

## 渲染模式

默认渲染走 JS（React DOM Server）。可通过 `SSR_MODE` 切换：

- `SSR_MODE=js`（默认）
- `SSR_MODE=native`（使用原生 addon 的 `renderToString`）

示例：

```bash
SSR_MODE=native node server.js
```

## 页面数据获取

支持 Next 风格的数据函数：

- `getServerSideProps(ctx)`：每次请求执行（SSR）
- `getStaticProps(ctx)`：生产模式下启用 SSG/ISR（根据 `revalidate` 控制刷新）

`getStaticProps` 返回格式示例：

```js
Page.getStaticProps = async () => {
  return { props: { n: 1 }, revalidate: 1 };
};
```

## 插件系统

在 `startMiniNextDevServer`/`createMiniNextServer` 中传入 `plugins`：

```js
startMiniNextDevServer({
  pagesDir,
  publicDir,
  plugins: [
    {
      onRequest(ctx) {
        if (ctx.urlPath === '/health') {
          return { handled: true, status: 200, body: 'ok' };
        }
      },
      extendPageProps(props, ctx) {
        return { ...props, now: Date.now(), urlPath: ctx.urlPath };
      },
      transformHtml(html) {
        return html.replace('</head>', '<meta name="x" content="y" /></head>');
      },
      getClientScripts() {
        return ['https://example.com/a.js'];
      },
      onNotFound(ctx) {
        return { handled: true, status: 404, body: 'custom 404' };
      },
      onError(ctx) {
        return { handled: true, status: 500, body: 'custom error' };
      },
    },
  ],
});
```

常见 hook：

- `apply(api)`：可拿到 Express `app` 并注册自定义路由
- `onStart(api)`：服务启动后回调
- `onRequest(ctx)`：请求进入渲染/静态处理前（支持“控制返回值”短路响应）
- `extendPageProps(props, ctx)`：注入页面 props（SSR/SSG 都生效）
- `transformHtml(html, ctx)`：最终 HTML 转换
- `getClientScripts(ctx)`：注入 `<script>` 列表
- `onNotFound(ctx)` / `onError(ctx)`：404/500 自定义处理
- `onDevFileChange(ev)`：开发模式文件变化

## Edge（createMiniNextEdgeHandler）

可将 pages + plugins 以 Edge 形式运行（fetch(Request) 风格）。示例：

```js
const path = require('path');
const { createMiniNextEdgeHandler } = require('mini-next-cpp');

const handler = createMiniNextEdgeHandler({
  pagesDir: path.join(process.cwd(), 'pages'),
  publicDir: path.join(process.cwd(), 'public'),
  plugins: [],
});

addEventListener('fetch', (event) => {
  event.respondWith(handler(event.request));
});
```

## API

从包中导出：

- `startMiniNextDevServer`
- `createMiniNextServer`
- `createMiniNextEdgeHandler`
- `css` / `runWithStyleRegistry`
- `renderPage` / `renderDocument`

## License

MIT

