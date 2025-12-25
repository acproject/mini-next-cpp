function injectBeforeHeadClose(html, extra) {
  const s = String(html || "");
  const x = String(extra || "");
  if (!x) return s;
  const idx = s.lastIndexOf("</head>");
  if (idx >= 0) return s.slice(0, idx) + x + s.slice(idx);
  return x + s;
}

module.exports = {
  transformHtml(html) {
    return injectBeforeHeadClose(html, "<link rel=\"stylesheet\" href=\"/tailwind.css\" />");
  },
  extendPageProps(props) {
    const base = props && typeof props === "object" ? props : {};
    return { ...base, enableAuth: false };
  },
};
