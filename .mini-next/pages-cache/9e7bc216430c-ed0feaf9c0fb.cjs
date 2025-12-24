"use strict";

var _jsxRuntime = require("react/jsx-runtime");
function BlogPostPage(props) {
  return (0, _jsxRuntime.jsxs)("main", {
    style: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: 24
    },
    children: [(0, _jsxRuntime.jsxs)("h1", {
      children: ["Blog: ", props.id]
    }), (0, _jsxRuntime.jsxs)("p", {
      children: ["SSR Mode: ", props.ssrMode]
    }), (0, _jsxRuntime.jsxs)("p", {
      children: ["Back: ", (0, _jsxRuntime.jsx)("a", {
        href: "/",
        children: "/"
      })]
    })]
  });
}
BlogPostPage.getServerSideProps = async ctx => {
  return {
    props: {
      id: ctx.params?.id ?? null,
      ssrMode: process.env.SSR_MODE || 'js'
    }
  };
};
module.exports = BlogPostPage;