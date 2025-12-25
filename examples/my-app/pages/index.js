function Page(props) {
  return 'hello ' + String(props && props.name ? props.name : 'mini-next-cpp');
}

Page.getServerSideProps = async () => {
  return { props: { name: 'mini-next-cpp' } };
};

module.exports = Page;
