const React = require('react');
const ReactDOMServer = require('react-dom/server');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function renderDocument({ bodyHtml, pageData, title, stylesHtml, scriptsHtml }) {
  const safeTitle = title ? escapeHtml(title) : 'mini-next-cpp';
  const data = escapeJsonForHtml(pageData ?? {});
  const styles = stylesHtml ? String(stylesHtml) : '';
  const scripts = scriptsHtml ? String(scriptsHtml) : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
${styles}
  </head>
  <body>
    <div id="__next">${bodyHtml}</div>
    <script id="__MINI_NEXT_DATA__" type="application/json">${data}</script>
${scripts}
  </body>
</html>`;
}

function renderPage(Component, props, options = {}) {
  const element = React.createElement(Component, props);
  const bodyHtml = ReactDOMServer.renderToString(element);

  return renderDocument({
    bodyHtml,
    pageData: { props, route: options.route ?? null },
    title: options.title ?? null,
    stylesHtml: options.stylesHtml ?? null,
    scriptsHtml: options.scriptsHtml ?? null,
  });
}

module.exports = { renderDocument, renderPage };
