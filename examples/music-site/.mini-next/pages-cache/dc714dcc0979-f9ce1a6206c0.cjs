"use strict";

const React = require('react');
const fs = require('fs');
const path = require('path');
const {
  css
} = require('mini-next-cpp');
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function Icon({
  name
}) {
  const cls = css`display:inline-block;width:18px;height:18px;opacity:.9;`;
  const box = css`display:inline-flex;align-items:center;justify-content:center;border-radius:999px;width:32px;height:32px;background:rgba(255,255,255,.08);`;
  const text = name === 'search' ? '⌕' : name === 'globe' ? '🌐' : name === 'play' ? '▶' : '•';
  return React.createElement('span', {
    className: box
  }, React.createElement('span', {
    className: cls
  }, text));
}
function Button({
  href,
  children,
  primary
}) {
  const cls = css`display:inline-flex;align-items:center;justify-content:center;height:36px;padding:0 14px;border-radius:999px;font-size:13px;letter-spacing:.2px;text-decoration:none;border:1px solid rgba(255,255,255,.16);color:#fff;background:${primary ? "rgba(255,70,120,.92)" : "rgba(255,255,255,.06)"};`;
  return React.createElement('a', {
    className: cls,
    href
  }, children);
}
function Chip({
  children
}) {
  const cls = css`display:inline-flex;align-items:center;justify-content:center;padding:6px 10px;border-radius:999px;background:rgba(0,0,0,.35);backdrop-filter: blur(6px);font-size:12px;color:#fff;`;
  return React.createElement('span', {
    className: cls
  }, children);
}
function Page(props) {
  const data = props && props.data ? props.data : null;
  const auth = props && props.auth ? props.auth : null;
  const layout = css`min-height:100vh;background:#0b0b0d;color:#fff;`;
  const topBar = css`position:sticky;top:0;z-index:10;background:rgba(11,11,13,.72);backdrop-filter:blur(10px);border-bottom:1px solid rgba(255,255,255,.06);`;
  const topInner = css`max-width:1120px;margin:0 auto;padding:14px 18px;display:flex;align-items:center;gap:14px;`;
  const logo = css`font-weight:700;letter-spacing:.6px;font-size:16px;`;
  const nav = css`display:flex;gap:16px;opacity:.9;font-size:13px;`;
  const navA = css`color:rgba(255,255,255,.86);text-decoration:none;`;
  const spacer = css`flex:1;`;
  const right = css`display:flex;align-items:center;gap:10px;`;
  const lang = css`font-size:12px;opacity:.8;`;
  const container = css`max-width:1120px;margin:0 auto;padding:18px;`;
  const heroWrap = css`display:grid;grid-template-columns:1fr 380px;gap:18px;align-items:stretch;`;
  const carousel = css`border-radius:18px;overflow:hidden;position:relative;min-height:310px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(135deg,#8b5cf6,#0f172a);`;
  const slide = css`position:absolute;inset:0;display:flex;align-items:center;justify-content:center;`;
  const slideInner = css`width:100%;height:100%;padding:22px;display:flex;gap:18px;align-items:center;`;
  const cover = css`width:240px;height:240px;border-radius:18px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);display:flex;align-items:center;justify-content:center;overflow:hidden;`;
  const coverImg = css`width:100%;height:100%;object-fit:cover;`;
  const meta = css`display:flex;flex-direction:column;gap:10px;`;
  const hTitle = css`font-size:40px;font-weight:800;line-height:1.05;letter-spacing:1px;`;
  const hArtist = css`font-size:18px;opacity:.9;`;
  const ssgNote = css`margin-top:8px;font-size:12px;opacity:.65;`;
  const sideCard = css`border-radius:18px;overflow:hidden;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);padding:16px;display:flex;flex-direction:column;gap:14px;`;
  const sideTitle = css`font-size:16px;font-weight:700;`;
  const songCard = css`display:flex;gap:12px;align-items:flex-start;`;
  const songImg = css`width:120px;height:120px;border-radius:14px;background:rgba(255,255,255,.08);overflow:hidden;border:1px solid rgba(255,255,255,.1);`;
  const songImgEl = css`width:100%;height:100%;object-fit:cover;`;
  const songName = css`font-weight:700;`;
  const songArtist = css`opacity:.85;font-size:12px;margin-top:4px;`;
  const songDesc = css`opacity:.75;font-size:12px;line-height:1.5;margin-top:10px;`;
  const likes = css`display:inline-flex;align-items:center;gap:6px;font-size:12px;opacity:.8;margin-top:10px;`;
  const grid = css`margin-top:18px;display:grid;grid-template-columns:1fr;gap:18px;`;
  const section = css`border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);overflow:hidden;`;
  const sectionHead = css`display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.06);`;
  const sectionTitle = css`font-size:16px;font-weight:800;`;
  const sectionRight = css`display:flex;gap:10px;align-items:center;`;
  const pill = css`height:30px;border-radius:999px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);font-size:12px;color:#fff;text-decoration:none;`;
  const list = css`padding:8px;`;
  const row = css`display:grid;grid-template-columns:42px 44px 1fr 90px 92px;align-items:center;gap:12px;padding:10px 10px;border-radius:14px;`;
  const rowHover = css`background:rgba(255,255,255,.02);`;
  const idxCls = css`opacity:.7;font-size:12px;text-align:right;`;
  const tinyCover = css`width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,.08);overflow:hidden;border:1px solid rgba(255,255,255,.08);`;
  const tinyImg = css`width:100%;height:100%;object-fit:cover;`;
  const songMain = css`display:flex;flex-direction:column;gap:2px;`;
  const songT = css`font-weight:700;font-size:13px;`;
  const songA = css`opacity:.75;font-size:12px;`;
  const likeCls = css`opacity:.75;font-size:12px;display:flex;align-items:center;gap:6px;justify-content:flex-end;`;
  const actions = css`display:flex;justify-content:flex-end;gap:8px;`;
  const actionBtn = css`height:30px;width:30px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;display:inline-flex;align-items:center;justify-content:center;`;
  const player = css`position:fixed;left:0;right:0;bottom:0;z-index:20;background:rgba(20,20,24,.78);backdrop-filter:blur(10px);border-top:1px solid rgba(255,255,255,.06);`;
  const playerInner = css`max-width:1120px;margin:0 auto;padding:12px 18px;display:flex;align-items:center;gap:14px;`;
  const playerNow = css`display:flex;flex-direction:column;gap:2px;`;
  const playerTitle = css`font-weight:700;font-size:13px;`;
  const playerArtist = css`opacity:.75;font-size:12px;`;
  const playBtn = css`margin-left:auto;height:42px;width:42px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,70,120,.92);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;`;
  const heroList = (data && Array.isArray(data.hero) ? data.hero : []).slice(0, 3);
  const hero0 = heroList[0] || {
    title: 'Music',
    artist: 'demo',
    tag: '推荐'
  };
  const songOfDay = data && data.songOfDay ? data.songOfDay : null;
  const ranking = data && Array.isArray(data.ranking) ? data.ranking : [];
  return React.createElement('div', {
    className: layout
  }, React.createElement('div', {
    className: topBar
  }, React.createElement('div', {
    className: topInner
  }, React.createElement('div', {
    className: logo
  }, data && data.site && data.site.name || 'StreetVoice'), React.createElement('nav', {
    className: nav
  }, React.createElement('a', {
    className: navA,
    href: '/'
  }, '音乐人指南'), React.createElement('a', {
    className: navA,
    href: '/'
  }, '流派'), React.createElement('a', {
    className: navA,
    href: '/'
  }, '歌单')), React.createElement('div', {
    className: spacer
  }), React.createElement('div', {
    className: right
  }, React.createElement('span', {
    className: lang
  }, '中文（简体）'), React.createElement(Icon, {
    name: 'search'
  }), React.createElement(Icon, {
    name: 'globe'
  }), auth ? React.createElement(React.Fragment, null, React.createElement('a', {
    className: navA,
    href: '/profile'
  }, '你好，' + String(auth.name || auth.email || '')), React.createElement('form', {
    method: 'POST',
    action: '/api/logout',
    style: {
      display: 'inline'
    }
  }, React.createElement('button', {
    className: css`margin-left:8px;height:36px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;cursor:pointer;`,
    type: 'submit'
  }, '退出'))) : React.createElement(React.Fragment, null, React.createElement(Button, {
    href: '/login',
    primary: false
  }, '登录'), React.createElement(Button, {
    href: '/register',
    primary: true
  }, '注册'))))), React.createElement('div', {
    className: container
  }, React.createElement('div', {
    className: heroWrap
  }, React.createElement('div', {
    className: carousel
  }, React.createElement('div', {
    className: slide
  }, React.createElement('div', {
    className: slideInner
  }, React.createElement('div', {
    className: cover
  }, React.createElement('img', {
    className: coverImg,
    alt: hero0.title,
    src: hero0.cover || ''
  })), React.createElement('div', {
    className: meta
  }, React.createElement(Chip, null, hero0.tag || '推荐'), React.createElement('div', {
    className: hTitle
  }, hero0.title || ''), React.createElement('div', {
    className: hArtist
  }, hero0.artist || ''), React.createElement('div', {
    className: ssgNote
  }, '首页使用 getStaticProps（生产环境走 SSG/ISR 缓存）'))))), React.createElement('aside', {
    className: sideCard
  }, React.createElement('div', {
    className: sideTitle
  }, 'Song of the Day'), songOfDay ? React.createElement('div', {
    className: songCard
  }, React.createElement('div', {
    className: songImg
  }, React.createElement('img', {
    className: songImgEl,
    alt: songOfDay.title,
    src: songOfDay.cover || ''
  })), React.createElement('div', null, React.createElement('div', {
    className: songName
  }, songOfDay.title), React.createElement('div', {
    className: songArtist
  }, songOfDay.artist), React.createElement('div', {
    className: likes
  }, '♥', String(songOfDay.likes || 0)), React.createElement('div', {
    className: songDesc
  }, songOfDay.desc || ''))) : null)), React.createElement('div', {
    className: grid
  }, React.createElement('section', {
    className: section
  }, React.createElement('div', {
    className: sectionHead
  }, React.createElement('div', {
    className: sectionTitle
  }, '即时排行'), React.createElement('div', {
    className: sectionRight
  }, React.createElement('a', {
    className: pill,
    href: '/'
  }, '更多排行榜'), React.createElement('a', {
    className: pill,
    href: '/'
  }, '全部播放'))), React.createElement('div', {
    className: list
  }, ranking.map(s => React.createElement('div', {
    key: String(s.idx),
    className: row + ' ' + rowHover
  }, React.createElement('div', {
    className: idxCls
  }, String(clamp(Number(s.idx) || 0, 0, 999))), React.createElement('div', {
    className: tinyCover
  }, React.createElement('img', {
    className: tinyImg,
    alt: s.title,
    src: s.cover || ''
  })), React.createElement('div', {
    className: songMain
  }, React.createElement('div', {
    className: songT
  }, s.title), React.createElement('div', {
    className: songA
  }, s.artist)), React.createElement('div', {
    className: likeCls
  }, '♥', String(s.likes || 0)), React.createElement('div', {
    className: actions
  }, React.createElement('button', {
    className: actionBtn,
    type: 'button',
    title: 'play'
  }, '▶'), React.createElement('button', {
    className: actionBtn,
    type: 'button',
    title: 'add'
  }, '+'), React.createElement('button', {
    className: actionBtn,
    type: 'button',
    title: 'next'
  }, '→')))))))), React.createElement('div', {
    className: player
  }, React.createElement('div', {
    className: playerInner
  }, React.createElement('div', {
    className: css`width:44px;height:44px;border-radius:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08);overflow:hidden;`
  }, songOfDay ? React.createElement('img', {
    className: css`width:100%;height:100%;object-fit:cover;`,
    alt: songOfDay.title,
    src: songOfDay.cover || ''
  }) : null), React.createElement('div', {
    className: playerNow
  }, React.createElement('div', {
    className: playerTitle
  }, songOfDay ? songOfDay.title : '—'), React.createElement('div', {
    className: playerArtist
  }, songOfDay ? songOfDay.artist : '')), React.createElement('div', {
    className: playBtn
  }, React.createElement(Icon, {
    name: 'play'
  })))));
}
Page.getStaticProps = async () => {
  const file = path.join(__dirname, '..', 'data', 'songs.json');
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  return {
    props: {
      data
    },
    revalidate: 60
  };
};
module.exports = Page;