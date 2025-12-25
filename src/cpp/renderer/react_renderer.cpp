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

static std::string getAndClearJsExceptionMessage(napi_env env) {
  bool pending = false;
  if (napi_is_exception_pending(env, &pending) != napi_ok || !pending) {
    return {};
  }

  napi_value exc;
  if (napi_get_and_clear_last_exception(env, &exc) != napi_ok) {
    return {};
  }

  napi_value msgValue = exc;
  napi_valuetype t;
  if (napi_typeof(env, exc, &t) == napi_ok && t == napi_object) {
    napi_value m;
    if (napi_get_named_property(env, exc, "message", &m) == napi_ok) {
      msgValue = m;
    }
  }

  napi_value msgStr;
  if (napi_coerce_to_string(env, msgValue, &msgStr) != napi_ok) {
    return {};
  }

  std::string out;
  if (!getValueString(env, msgStr, out)) {
    return {};
  }
  return out;
}

static void appendJsStringLiteral(std::string &out, std::string_view s) {
  out.push_back('\'');
  for (unsigned char c : s) {
    switch (c) {
    case '\\':
      out.append("\\\\");
      break;
    case '\'':
      out.append("\\'");
      break;
    case '\n':
      out.append("\\n");
      break;
    case '\r':
      out.append("\\r");
      break;
    case '\t':
      out.append("\\t");
      break;
    case '\b':
      out.append("\\b");
      break;
    case '\f':
      out.append("\\f");
      break;
    default:
      if (c < 0x20) {
        const char hex[] = "0123456789abcdef";
        out.append("\\x");
        out.push_back(hex[(c >> 4) & 0x0F]);
        out.push_back(hex[c & 0x0F]);
      } else {
        out.push_back(static_cast<char>(c));
      }
      break;
    }
  }
  out.push_back('\'');
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
  appendJsStringLiteral(script, modulePath);
  script.append(");");
  script.append(
      "const "
      "C=(mod&&mod.__esModule&&mod.default)?mod.default:(mod.default||mod);");
  script.append("const props=JSON.parse(");
  if (propsJson.empty()) {
    appendJsStringLiteral(script, "{}");
  } else {
    appendJsStringLiteral(script, propsJson);
  }
  script.append(");");
  script.append(
      "return ReactDOMServer.renderToString(React.createElement(C, props));");
  script.append("})()");

  napi_value jsScript;
  if (napi_create_string_utf8(env, script.c_str(), script.size(), &jsScript) !=
      napi_ok) {
    napi_throw_error(env, nullptr, "Failed to create JS script string");
    return {};
  }

  napi_value result;
  if (napi_run_script(env, jsScript, &result) != napi_ok) {
    std::string msg = getAndClearJsExceptionMessage(env);
    if (msg.empty()) {
      msg = "Failed to run JS render script";
    }
    napi_throw_error(env, nullptr, msg.c_str());
    return {};
  }

  std::string out;
  if (!getValueString(env, result, out)) {
    napi_throw_error(env, nullptr, "Render script did not return a string");
    return {};
  }
  return out;
}

} // namespace mini_next
