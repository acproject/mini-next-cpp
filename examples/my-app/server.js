const path = require('path');
const { startMiniNextDevServer } = require('mini-next-cpp');
const appPlugin = require('./plugins/app');

startMiniNextDevServer({
  port: Number(process.env.PORT || 3000),
  pagesDir: path.join(__dirname, 'pages'),
  publicDir: path.join(__dirname, 'public'),
  plugins: [appPlugin],
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
