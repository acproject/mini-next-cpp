function BlogPostPage(props) {
  return (
    <main style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: 24 }}>
      <h1>Blog: {props.id}</h1>
      <p>SSR Mode: {props.ssrMode}</p>
      <p>
        Back: <a href="/">/</a>
      </p>
    </main>
  );
}

BlogPostPage.getServerSideProps = async (ctx) => {
  return {
    props: {
      id: ctx.params?.id ?? null,
      ssrMode: process.env.SSR_MODE || 'js',
    },
  };
};

module.exports = BlogPostPage;

