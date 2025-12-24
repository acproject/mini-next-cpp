#include <node_api.h>

#include <string>
#include <string_view>

namespace mini_next {

static bool getValueString(napi_env env, napi_value value, std::string &out) {
  size_t len = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &len) != napi_ok) {
    return false;
  }
  out.resize(len);
  if (len == 0) {
    return true;
  }
  size_t written = 0;
  if (napi_get_value_string_utf8(env, value, out.data(), len + 1, &written) !=
      napi_ok) {
    return false;
  }
  if (written != len) {
    out.resize(written);
  }
  return true;
}

std::string reactRenderToString(napi_env env, const std::string &modulePath,
                                const std::string &propsJson) {
  std::string script;
  script.reserve(modulePath.size() + propsJson.size() + 256);
  script.append("(() => {");
  script.append("const "
                "req=(process&&process.mainModule&&process.mainModule.require)?"
                "process.mainModule.require.bind(process.mainModule):null;");
  script.append(
      "if(!req){throw new Error('require is not available in this context');}");
  script.append("const React=req('react');");
  script.append("const ReactDOMServer=req('react-dom/server');");
  script.append("globalThis.__MINI_NEXT_REACT__=React;");
  script.append("const mod=req(");
  script.push_back('`');
  for (char c : modulePath) {
    if (c == '`' || c == '\\') {
      script.push_back('\\');
    }
    script.push_back(c);
  }
  script.push_back('`');
  script.append(");");
  script.append(
      "const "
      "C=(mod&&mod.__esModule&&mod.default)?mod.default:(mod.default||mod);");
  script.append("const props=JSON.parse(");
  script.push_back('`');
  for (char c : propsJson.empty() ? std::string("{}") : propsJson) {
    if (c == '`' || c == '\\') {
      script.push_back('\\');
    }
    script.push_back(c);
  }
  script.push_back('`');
  script.append(");");
  script.append(
      "return ReactDOMServer.renderToString(React.createElement(C, props));");
  script.append("})()");

  napi_value jsScript;
  if (napi_create_string_utf8(env, script.c_str(), script.size(), &jsScript) !=
      napi_ok) {
    return {};
  }

  napi_value result;
  if (napi_run_script(env, jsScript, &result) != napi_ok) {
    return {};
  }

  std::string out;
  if (!getValueString(env, result, out)) {
    return {};
  }
  return out;
}

} // namespace mini_next
