#include <string>
#include <string_view>
#include <unordered_map>

namespace mini_next {

std::string htmlEscape(std::string_view s);

static bool isIdentChar(char c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
         (c >= '0' && c <= '9') || c == '_' || c == '.';
}

std::string
renderTemplate(const std::string &tpl,
               const std::unordered_map<std::string, std::string> &ctx,
               bool escape) {
  std::string out;
  out.reserve(tpl.size());

  size_t i = 0;
  while (i < tpl.size()) {
    size_t open = tpl.find("{{", i);
    if (open == std::string::npos) {
      out.append(tpl.substr(i));
      break;
    }
    out.append(tpl.substr(i, open - i));

    size_t keyStart = open + 2;
    bool raw = false;
    if (keyStart < tpl.size() && tpl[keyStart] == '{') {
      raw = true;
      keyStart++;
    }

    const char *closeToken = raw ? "}}}" : "}}";
    const size_t closeTokenLen = raw ? 3 : 2;
    size_t close = tpl.find(closeToken, open + 2);
    if (close == std::string::npos) {
      out.append(tpl.substr(open));
      break;
    }

    size_t keyEnd = close;

    std::string key;
    key.reserve(keyEnd - keyStart);
    for (size_t k = keyStart; k < keyEnd; k++) {
      if (isIdentChar(tpl[k])) {
        key.push_back(tpl[k]);
      }
    }

    auto it = ctx.find(key);
    if (it != ctx.end()) {
      if (raw || !escape) {
        out.append(it->second);
      } else {
        out.append(htmlEscape(it->second));
      }
    }

    i = close + closeTokenLen;
  }

  return out;
}

} // namespace mini_next
