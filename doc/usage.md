# 使用说明

## 能力概览

- SSR：默认使用 JS（`react-dom/server`）渲染；可切换原生渲染（`SSR_MODE=native`）
- SSG/ISR：生产模式下 `getStaticProps` + `revalidate` 支持增量静态刷新
- 路由：基于 `pages/` 文件系统路由，支持动态/多段参数与 Next.js 风格优先级
- 插件系统：支持请求改写、注入 props、HTML 变换、脚本注入、404/500 处理等
- Edge 运行时：提供 `createMiniNextEdgeHandler`（Fetch API 风格）
- CSS-in-JS：提供 `css` 与 `runWithStyleRegistry`
- 图片代理/可选优化：`/_mini_next/image`（可选用 `sharp` 输出 webp/avif 等）
- 开发体验：支持监听 `pages/` 变化并触发刷新

## 启动方式

### 代码方式启动（推荐）

```js
const path = require('path');
const { startMiniNextDevServer } = require('mini-next-cpp');

startMiniNextDevServer({
  port: Number(process.env.PORT || 3000),
  pagesDir: path.join(__dirname, 'pages'),
  publicDir: path.join(__dirname, 'public'),
});
```

### 脚手架创建项目

```bash
npx create-mini-next-app my-app
cd my-app
npm run dev
```

## 环境变量

- `PORT`：服务端口（默认 3000）
- `NODE_ENV`：`production` 时启用生产逻辑（影响 SSG/ISR、缓存等）
- `SSR_MODE`：`js`（默认）/ `native`
- `JSX_COMPILER`：`native` 时对 `pages/**/*.jsx` 启用原生 JSX 编译（实验）
- `SSR_CACHE_SIZE`：SSR LRU 缓存容量（默认 512）
- `ISR_CACHE_SIZE`：ISR LRU 缓存容量（默认 256）
- `IMAGE_CACHE_SIZE`：图片缓存容量（默认 128）

## 路由（pages 目录）

### 映射规则

- `pages/index.*` -> `/`
- `pages/blog/index.*` -> `/blog`
- `pages/a/b.*` -> `/a/b`
- 支持扩展名：`.js`、`.jsx`、`.ts`、`.tsx`

### 动态路由支持情况

| 语法 | 是否支持 | 说明 |
| --- | --- | --- |
| `[id]` | 支持 | 单段动态参数（`/user/123` -> `{ id: "123" }`） |
| `[...slug]`（catch-all） | 支持 | 多段参数（`/a/b` -> `{ slug: "a/b" }`），只能出现在最后一段 |
| `[[...slug]]`（可选 catch-all） | 支持 | 0 或多段参数（`/blog` 不产生参数；`/blog/a` -> `{ slug: "a" }`），只能出现在最后一段 |
| 可选段（如 `[[id]]`） | 不支持 | 未实现 |

### 路由优先级/冲突规则

路由会在扫描完成后进行一次排序，匹配时按优先级从高到低尝试（遇到第一个匹配即返回）：

- 静态段 > 单段动态 `[id]` > catch-all `[...slug]` > 可选 catch-all `[[...slug]]`
- 相同前缀下，更短的路径优先（例如 `/blog` 优先于 `/blog/[[...slug]]`）

## 页面模块与数据函数

### 导出格式

页面模块需要导出一个组件函数：

- CommonJS：`module.exports = Page`
- ESM：`export default Page`（会被自动识别）

### 数据获取

- `getServerSideProps(ctx)`：每次请求执行（SSR）
- `getStaticProps(ctx)`：生产模式下启用 SSG/ISR

`getStaticProps` 返回示例：

```js
Page.getStaticProps = async () => {
  return { props: { n: 1 }, revalidate: 1 };
};
```

## JSX 与 TypeScript

- 默认编译链路（Babel）支持 `.jsx` 与 `.tsx`
- `JSX_COMPILER=native` 仅对 `.jsx` 启用原生 JSX 编译（`.tsx` 仍走 Babel）

## 图片代理（/_mini_next/image）

示例：

- `/_mini_next/image?url=/a.png&width=200&height=200&quality=80&f=webp`

说明：

- 如果安装了可选依赖 `sharp`，会尽量输出目标格式（如 `webp`）
- 未安装 `sharp` 时会回退为原图输出
