const React = require('react');

function BlogIndexPage(props) {
  return React.createElement(
    'main',
    { style: { fontFamily: 'system-ui', padding: 24 } },
    React.createElement('h1', null, 'Blog'),
    React.createElement('p', null, `Query: ${JSON.stringify(props.query || {})}`),
  );
}

module.exports = BlogIndexPage;

module.exports.getServerSideProps = async ({ query }) => ({ props: { query } });

