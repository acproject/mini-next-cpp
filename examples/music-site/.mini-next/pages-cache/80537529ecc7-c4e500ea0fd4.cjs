"use strict";

const React = require('react');
const {
  css
} = require('mini-next-cpp');
function Field({
  label,
  name,
  type,
  placeholder
}) {
  const wrap = css`display:flex;flex-direction:column;gap:8px;`;
  const lab = css`font-size:12px;opacity:.82;`;
  const input = css`height:40px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;padding:0 12px;outline:none;`;
  return React.createElement('label', {
    className: wrap
  }, React.createElement('div', {
    className: lab
  }, label), React.createElement('input', {
    className: input,
    name,
    type,
    placeholder,
    required: true
  }));
}
function Page(props) {
  const auth = props && props.auth ? props.auth : null;
  const box = css`min-height:100vh;background:#0b0b0d;color:#fff;display:flex;align-items:center;justify-content:center;padding:22px;`;
  const card = css`width:100%;max-width:420px;border-radius:18px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.03);padding:18px;`;
  const title = css`font-size:18px;font-weight:800;`;
  const sub = css`margin-top:6px;font-size:12px;opacity:.72;line-height:1.5;`;
  const form = css`margin-top:16px;display:flex;flex-direction:column;gap:12px;`;
  const btn = css`margin-top:4px;height:42px;border-radius:12px;border:0;background:rgba(255,70,120,.92);color:#fff;font-weight:800;cursor:pointer;`;
  const link = css`margin-top:12px;font-size:12px;opacity:.85;`;
  const a = css`color:#fff;`;
  if (auth) {
    return React.createElement('div', {
      className: box
    }, React.createElement('div', {
      className: card
    }, React.createElement('div', {
      className: title
    }, '已登录'), React.createElement('div', {
      className: sub
    }, '你已登录为 ' + String(auth.name || auth.email || '')), React.createElement('a', {
      className: css`display:inline-flex;margin-top:16px;color:#fff;text-decoration:none;`,
      href: '/'
    }, '回到首页')));
  }
  return React.createElement('div', {
    className: box
  }, React.createElement('div', {
    className: card
  }, React.createElement('div', {
    className: title
  }, '注册'), React.createElement('div', {
    className: sub
  }, '注册后将自动登录，并创建一个 SQLite 会话。'), React.createElement('form', {
    className: form,
    method: 'POST',
    action: '/api/register'
  }, React.createElement(Field, {
    label: '昵称',
    name: 'name',
    type: 'text',
    placeholder: '你的名字'
  }), React.createElement(Field, {
    label: '邮箱',
    name: 'email',
    type: 'email',
    placeholder: 'you@example.com'
  }), React.createElement(Field, {
    label: '密码',
    name: 'password',
    type: 'password',
    placeholder: '至少 6 位'
  }), React.createElement('button', {
    className: btn,
    type: 'submit'
  }, '创建账号')), React.createElement('div', {
    className: link
  }, '已有账号？ ', React.createElement('a', {
    className: a,
    href: '/login'
  }, '去登录'))));
}
module.exports = Page;