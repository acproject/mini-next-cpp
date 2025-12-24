"use strict";

var _jsxRuntime = require("react/jsx-runtime");
function HomePage(props) {
  return (0, _jsxRuntime.jsxs)("main", {
    style: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: 24
    },
    children: [(0, _jsxRuntime.jsx)("h1", {
      children: "mini-next-cpp"
    }), (0, _jsxRuntime.jsxs)("p", {
      children: ["Now: ", new Date(props.now).toISOString()]
    }), (0, _jsxRuntime.jsxs)("p", {
      children: ["Try dynamic route: ", (0, _jsxRuntime.jsx)("a", {
        href: "/blog/hello",
        children: "/blog/hello"
      })]
    }), (0, _jsxRuntime.jsx)("pre", {
      style: {
        background: '#111',
        color: '#fff',
        padding: 12,
        borderRadius: 8
      },
      children: JSON.stringify({
        params: props.params,
        query: props.query
      }, null, 2)
    })]
  });
}
HomePage.getServerSideProps = async ctx => {
  return {
    props: {
      now: Date.now(),
      params: ctx.params || {},
      query: ctx.query || {}
    }
  };
};
module.exports = HomePage;