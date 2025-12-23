function getInitialPageData() {
  const el = globalThis.document?.getElementById('__MINI_NEXT_DATA__');
  if (!el) return null;
  try {
    return JSON.parse(el.textContent || 'null');
  } catch {
    return null;
  }
}

module.exports = { getInitialPageData };
