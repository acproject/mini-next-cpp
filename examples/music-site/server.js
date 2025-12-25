const path = require('path');
const { startMiniNextDevServer } = require('mini-next-cpp');
const appPlugin = require('./plugins/app');
const { createAuthPlugin } = require('./plugins/auth');

startMiniNextDevServer({
  port: Number(process.env.PORT || 3000),
  pagesDir: path.join(__dirname, 'pages'),
  publicDir: path.join(__dirname, 'public'),
  plugins: [
    appPlugin,
    createAuthPlugin({
      dbPath: path.join(__dirname, 'data', 'app.db'),
    }),
  ],
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
