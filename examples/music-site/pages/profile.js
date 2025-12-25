const React = require('react');
const { css } = require('mini-next-cpp');

function Page(props) {
  const auth = props && props.auth ? props.auth : null;
  const wrap = css`min-height:100vh;background:#0b0b0d;color:#fff;padding:22px;`;
  const card = css`max-width:720px;margin:0 auto;border-radius:18px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);padding:18px;`;
  const title = css`font-size:18px;font-weight:800;`;
  const sub = css`margin-top:10px;font-size:12px;opacity:.75;`;
  const row = css`margin-top:12px;display:flex;gap:10px;flex-wrap:wrap;`;
  const chip = css`display:inline-flex;align-items:center;justify-content:center;padding:8px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);font-size:12px;`;

  return React.createElement(
    'div',
    { className: wrap },
    React.createElement(
      'div',
      { className: card },
      React.createElement('div', { className: title }, '个人中心'),
      auth ? React.createElement(
        React.Fragment,
        null,
        React.createElement('div', { className: sub }, '此页面通过服务端插件 onRequest 做访问控制，已登录才可进入。'),
        React.createElement('div', { className: row },
          React.createElement('div', { className: chip }, 'ID: ' + String(auth.id)),
          React.createElement('div', { className: chip }, 'Email: ' + String(auth.email)),
          React.createElement('div', { className: chip }, 'Name: ' + String(auth.name))
        ),
        React.createElement('a', { className: css`display:inline-flex;margin-top:16px;color:#fff;text-decoration:none;`, href: '/' }, '回到首页')
      ) : React.createElement(
        React.Fragment,
        null,
        React.createElement('div', { className: sub }, '未登录'),
        React.createElement('a', { className: css`display:inline-flex;margin-top:16px;color:#fff;text-decoration:none;`, href: '/login' }, '去登录')
      )
    )
  );
}

module.exports = Page;
