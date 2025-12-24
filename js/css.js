const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

function hash(text) {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex').slice(0, 10);
}

function normalizeCssText(cssText) {
  return String(cssText == null ? '' : cssText)
    .replace(/\s+/g, ' ')
    .trim();
}

function toCssText(strings, values) {
  if (Array.isArray(strings) && Object.prototype.hasOwnProperty.call(strings, 'raw')) {
    let out = '';
    for (let i = 0; i < strings.length; i++) {
      out += String(strings[i] == null ? '' : strings[i]);
      if (i < values.length) {
        out += String(values[i] == null ? '' : values[i]);
      }
    }
    return out;
  }
  return String(strings == null ? '' : strings);
}

function ensureRule(cssText) {
  const normalized = normalizeCssText(cssText);
  const className = `mn_${hash(normalized)}`;
  const store = storage.getStore();
  if (store && store.rules instanceof Map) {
    if (!store.rules.has(className)) {
      store.rules.set(className, normalized);
    }
  }
  return className;
}

function css(strings, ...values) {
  return ensureRule(toCssText(strings, values));
}

function cssTextToRules(rules) {
  if (!(rules instanceof Map) || rules.size === 0) return '';
  let out = '';
  for (const [className, decls] of rules.entries()) {
    const safeDecls = String(decls || '').replaceAll('</style', '<\\/style');
    out += `.${className}{${safeDecls}}\n`;
  }
  return out;
}

function buildStyleTag(cssText) {
  const text = String(cssText || '').trim();
  if (!text) return '';
  return `<style data-mini-next-css="1">${text}</style>`;
}

async function runWithStyleRegistry(fn) {
  const store = { rules: new Map() };
  const result = await storage.run(store, fn);
  const cssText = cssTextToRules(store.rules);
  const stylesHtml = buildStyleTag(cssText);
  return { result, cssText, stylesHtml };
}

module.exports = { css, runWithStyleRegistry };
