function HomePage(props) {
  return (
    <main style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: 24 }}>
      <h1>mini-next-cpp</h1>
      <p>Now: {new Date(props.now).toISOString()}</p>
      <p>
        Try dynamic route: <a href="/blog/hello">/blog/hello</a>
      </p>
      <pre style={{ background: '#111', color: '#fff', padding: 12, borderRadius: 8 }}>
        {JSON.stringify({ params: props.params, query: props.query }, null, 2)}
      </pre>
    </main>
  );
}

HomePage.getServerSideProps = async (ctx) => {
  return {
    props: {
      now: Date.now(),
      params: ctx.params || {},
      query: ctx.query || {},
    },
  };
};

module.exports = HomePage;

