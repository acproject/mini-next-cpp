#include <cctype>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

namespace mini_next {

static bool isSpace(char c) {
  return c == ' ' || c == '\t' || c == '\n' || c == '\r';
}

static bool isTagNameStart(char c) {
  return (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '_' ||
         c == '$';
}

static bool isTagNameChar(char c) {
  return isTagNameStart(c) || (c >= '0' && c <= '9') || c == '.' || c == '-' ||
         c == ':';
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

struct JsxAttr {
  std::string name;
  std::string valueExpr;
  bool hasValue = false;
};

class JsxParser {
public:
  explicit JsxParser(std::string_view input) : input_(input) {}

  bool parseElement(size_t start, std::string &outExpr, size_t &outEnd) {
    size_t i = start;
    if (i >= input_.size() || input_[i] != '<') {
      return false;
    }
    i++;

    bool isFragment = false;
    std::string tagName;
    if (i < input_.size() && input_[i] == '>') {
      isFragment = true;
      i++;
    } else {
      if (i < input_.size() && input_[i] == '/') {
        return false;
      }
      if (i >= input_.size() || !isTagNameStart(input_[i])) {
        return false;
      }
      size_t nameStart = i;
      i++;
      while (i < input_.size() && isTagNameChar(input_[i])) {
        i++;
      }
      tagName = std::string(input_.substr(nameStart, i - nameStart));
    }

    std::vector<JsxAttr> attrs;
    if (!isFragment) {
      skipSpaces(i);
      while (i < input_.size()) {
        if (startsWith(i, "/>")) {
          i += 2;
          outExpr = buildCreateElement(tagName, attrs, {});
          outEnd = i;
          return true;
        }
        if (input_[i] == '>') {
          i++;
          break;
        }
        JsxAttr a;
        if (!parseAttribute(i, a)) {
          return false;
        }
        attrs.push_back(std::move(a));
        skipSpaces(i);
      }
    } else {
      skipSpaces(i);
    }

    std::vector<std::string> children;
    while (i < input_.size()) {
      if (startsWith(i, "</")) {
        size_t closeEnd = 0;
        if (!parseClosingTag(i, isFragment, tagName, closeEnd)) {
          return false;
        }
        i = closeEnd;
        outExpr = buildCreateElement(tagName, attrs, children, isFragment);
        outEnd = i;
        return true;
      }

      if (input_[i] == '<') {
        std::string childExpr;
        size_t childEnd = 0;
        if (!parseElement(i, childExpr, childEnd)) {
          return false;
        }
        children.push_back(std::move(childExpr));
        i = childEnd;
        continue;
      }

      if (input_[i] == '{') {
        std::string expr;
        size_t end = 0;
        if (!consumeBalancedBraces(i, expr, end)) {
          return false;
        }
        if (!trimSpaces(expr).empty()) {
          children.push_back(expr);
        }
        i = end;
        continue;
      }

      std::string text;
      size_t end = i;
      while (end < input_.size() && input_[end] != '<' && input_[end] != '{') {
        end++;
      }
      text.assign(input_.substr(i, end - i));
      std::string normalized = normalizeText(text);
      if (!normalized.empty()) {
        std::string lit;
        appendJsStringLiteral(lit, normalized);
        children.push_back(std::move(lit));
      }
      i = end;
    }

    return false;
  }

private:
  std::string_view input_;

  static std::string trimSpaces(std::string_view s) {
    size_t a = 0;
    while (a < s.size() && isSpace(s[a])) {
      a++;
    }
    size_t b = s.size();
    while (b > a && isSpace(s[b - 1])) {
      b--;
    }
    return std::string(s.substr(a, b - a));
  }

  static std::string normalizeText(std::string_view s) {
    std::string out;
    out.reserve(s.size());
    bool inSpace = false;
    for (char c : s) {
      if (c == '\r') {
        continue;
      }
      if (isSpace(c)) {
        inSpace = true;
        continue;
      }
      if (inSpace) {
        if (!out.empty()) {
          out.push_back(' ');
        }
        inSpace = false;
      }
      out.push_back(c);
    }
    return out;
  }

  void skipSpaces(size_t &i) const {
    while (i < input_.size() && isSpace(input_[i])) {
      i++;
    }
  }

  bool startsWith(size_t i, std::string_view p) const {
    return i + p.size() <= input_.size() && input_.substr(i, p.size()) == p;
  }

  bool parseAttribute(size_t &i, JsxAttr &out) {
    skipSpaces(i);
    if (i >= input_.size()) {
      return false;
    }
    if (!isTagNameStart(input_[i])) {
      return false;
    }
    size_t nameStart = i;
    i++;
    while (i < input_.size() && isTagNameChar(input_[i])) {
      i++;
    }
    out.name = std::string(input_.substr(nameStart, i - nameStart));
    skipSpaces(i);
    if (i < input_.size() && input_[i] == '=') {
      i++;
      skipSpaces(i);
      std::string valueExpr;
      size_t end = 0;
      if (!parseAttributeValue(i, valueExpr, end)) {
        return false;
      }
      out.hasValue = true;
      out.valueExpr = std::move(valueExpr);
      i = end;
      return true;
    }
    out.hasValue = true;
    out.valueExpr = "true";
    return true;
  }

  bool parseAttributeValue(size_t start, std::string &outExpr, size_t &outEnd) {
    if (start >= input_.size()) {
      return false;
    }
    const char c = input_[start];
    if (c == '"' || c == '\'') {
      char quote = c;
      size_t i = start + 1;
      std::string value;
      while (i < input_.size()) {
        char ch = input_[i];
        if (ch == '\\') {
          if (i + 1 < input_.size()) {
            value.push_back(input_[i + 1]);
            i += 2;
            continue;
          }
          return false;
        }
        if (ch == quote) {
          std::string lit;
          appendJsStringLiteral(lit, value);
          outExpr = std::move(lit);
          outEnd = i + 1;
          return true;
        }
        value.push_back(ch);
        i++;
      }
      return false;
    }

    if (c == '{') {
      std::string expr;
      size_t end = 0;
      if (!consumeBalancedBraces(start, expr, end)) {
        return false;
      }
      outExpr = expr;
      outEnd = end;
      return true;
    }

    size_t i = start;
    while (i < input_.size() && !isSpace(input_[i]) && input_[i] != '>' &&
           !startsWith(i, "/>")) {
      i++;
    }
    outExpr = std::string(input_.substr(start, i - start));
    outEnd = i;
    return true;
  }

  bool consumeBalancedBraces(size_t start, std::string &outExpr,
                             size_t &outEnd) const {
    if (start >= input_.size() || input_[start] != '{') {
      return false;
    }
    size_t i = start + 1;
    int depth = 1;
    enum class Mode {
      Normal,
      Single,
      Double,
      Template,
      LineComment,
      BlockComment
    };
    Mode mode = Mode::Normal;
    while (i < input_.size()) {
      char c = input_[i];
      if (mode == Mode::LineComment) {
        if (c == '\n') {
          mode = Mode::Normal;
        }
        i++;
        continue;
      }
      if (mode == Mode::BlockComment) {
        if (c == '*' && i + 1 < input_.size() && input_[i + 1] == '/') {
          i += 2;
          mode = Mode::Normal;
          continue;
        }
        i++;
        continue;
      }
      if (mode == Mode::Single) {
        if (c == '\\') {
          i += (i + 1 < input_.size() ? 2 : 1);
          continue;
        }
        if (c == '\'') {
          mode = Mode::Normal;
        }
        i++;
        continue;
      }
      if (mode == Mode::Double) {
        if (c == '\\') {
          i += (i + 1 < input_.size() ? 2 : 1);
          continue;
        }
        if (c == '"') {
          mode = Mode::Normal;
        }
        i++;
        continue;
      }
      if (mode == Mode::Template) {
        if (c == '\\') {
          i += (i + 1 < input_.size() ? 2 : 1);
          continue;
        }
        if (c == '`') {
          mode = Mode::Normal;
          i++;
          continue;
        }
        i++;
        continue;
      }

      if (c == '/' && i + 1 < input_.size()) {
        char n = input_[i + 1];
        if (n == '/') {
          mode = Mode::LineComment;
          i += 2;
          continue;
        }
        if (n == '*') {
          mode = Mode::BlockComment;
          i += 2;
          continue;
        }
      }
      if (c == '\'') {
        mode = Mode::Single;
        i++;
        continue;
      }
      if (c == '"') {
        mode = Mode::Double;
        i++;
        continue;
      }
      if (c == '`') {
        mode = Mode::Template;
        i++;
        continue;
      }
      if (c == '{') {
        depth++;
        i++;
        continue;
      }
      if (c == '}') {
        depth--;
        if (depth == 0) {
          outExpr = std::string(input_.substr(start + 1, i - (start + 1)));
          outEnd = i + 1;
          return true;
        }
        i++;
        continue;
      }
      i++;
    }
    return false;
  }

  bool parseClosingTag(size_t start, bool isFragmentOpen,
                       const std::string &openName, size_t &outEnd) const {
    if (!startsWith(start, "</")) {
      return false;
    }
    size_t i = start + 2;
    skipSpaces(i);
    if (isFragmentOpen) {
      if (i < input_.size() && input_[i] == '>') {
        outEnd = i + 1;
        return true;
      }
      return false;
    }
    size_t nameStart = i;
    while (i < input_.size() && isTagNameChar(input_[i])) {
      i++;
    }
    if (nameStart == i) {
      return false;
    }
    std::string closeName =
        std::string(input_.substr(nameStart, i - nameStart));
    skipSpaces(i);
    if (i >= input_.size() || input_[i] != '>') {
      return false;
    }
    outEnd = i + 1;
    return closeName == openName;
  }

  static bool isComponentTag(std::string_view name) {
    if (name.empty()) {
      return false;
    }
    char c = name[0];
    return (c >= 'A' && c <= 'Z') || c == '_' || c == '$';
  }

  static std::string buildPropsObject(const std::vector<JsxAttr> &attrs) {
    if (attrs.empty()) {
      return "null";
    }
    std::string out;
    out.push_back('{');
    for (size_t i = 0; i < attrs.size(); i++) {
      if (i > 0) {
        out.append(", ");
      }
      appendJsStringLiteral(out, attrs[i].name);
      out.append(": ");
      out.append(attrs[i].hasValue ? attrs[i].valueExpr : "true");
    }
    out.push_back('}');
    return out;
  }

  static std::string buildCreateElement(
      const std::string &tagName, const std::vector<JsxAttr> &attrs,
      const std::vector<std::string> &children, bool isFragment = false) {
    std::string out;
    out.append("React.createElement(");
    if (isFragment) {
      out.append("React.Fragment");
    } else if (isComponentTag(tagName) ||
               tagName.find('.') != std::string::npos) {
      out.append(tagName);
    } else {
      appendJsStringLiteral(out, tagName);
    }
    out.append(", ");
    out.append(buildPropsObject(attrs));
    for (const auto &c : children) {
      out.append(", ");
      out.append(c);
    }
    out.push_back(')');
    return out;
  }
};

static std::string transformJsxInSource(std::string_view src) {
  std::string out;
  out.reserve(src.size() + 64);

  enum class Mode {
    Normal,
    Single,
    Double,
    Template,
    LineComment,
    BlockComment
  };
  Mode mode = Mode::Normal;

  JsxParser parser(src);
  size_t i = 0;
  while (i < src.size()) {
    char c = src[i];
    if (mode == Mode::LineComment) {
      out.push_back(c);
      if (c == '\n') {
        mode = Mode::Normal;
      }
      i++;
      continue;
    }
    if (mode == Mode::BlockComment) {
      out.push_back(c);
      if (c == '*' && i + 1 < src.size() && src[i + 1] == '/') {
        out.push_back('/');
        i += 2;
        mode = Mode::Normal;
        continue;
      }
      i++;
      continue;
    }
    if (mode == Mode::Single) {
      out.push_back(c);
      if (c == '\\') {
        if (i + 1 < src.size()) {
          out.push_back(src[i + 1]);
          i += 2;
          continue;
        }
      } else if (c == '\'') {
        mode = Mode::Normal;
      }
      i++;
      continue;
    }
    if (mode == Mode::Double) {
      out.push_back(c);
      if (c == '\\') {
        if (i + 1 < src.size()) {
          out.push_back(src[i + 1]);
          i += 2;
          continue;
        }
      } else if (c == '"') {
        mode = Mode::Normal;
      }
      i++;
      continue;
    }
    if (mode == Mode::Template) {
      out.push_back(c);
      if (c == '\\') {
        if (i + 1 < src.size()) {
          out.push_back(src[i + 1]);
          i += 2;
          continue;
        }
      } else if (c == '`') {
        mode = Mode::Normal;
      }
      i++;
      continue;
    }

    if (c == '/' && i + 1 < src.size()) {
      char n = src[i + 1];
      if (n == '/') {
        out.append("//");
        i += 2;
        mode = Mode::LineComment;
        continue;
      }
      if (n == '*') {
        out.append("/*");
        i += 2;
        mode = Mode::BlockComment;
        continue;
      }
    }
    if (c == '\'') {
      out.push_back(c);
      mode = Mode::Single;
      i++;
      continue;
    }
    if (c == '"') {
      out.push_back(c);
      mode = Mode::Double;
      i++;
      continue;
    }
    if (c == '`') {
      out.push_back(c);
      mode = Mode::Template;
      i++;
      continue;
    }

    if (c == '<') {
      std::string expr;
      size_t end = 0;
      if (parser.parseElement(i, expr, end)) {
        out.append(expr);
        i = end;
        continue;
      }
    }

    out.push_back(c);
    i++;
  }

  return out;
}

static bool hasReactBinding(std::string_view s) {
  return s.find("require('react')") != std::string_view::npos ||
         s.find("require(\"react\")") != std::string_view::npos ||
         s.find("from 'react'") != std::string_view::npos ||
         s.find("from \"react\"") != std::string_view::npos;
}

std::string jsxToJsModule(const std::string &input) {
  std::string transformed = transformJsxInSource(std::string_view(input));
  if (hasReactBinding(transformed)) {
    return transformed;
  }
  return std::string("const __mini_next_main=(typeof require==='function'&&require.main)?require.main:null;\n"
                     "const __mini_next_req=(__mini_next_main&&typeof __mini_next_main.require==='function')?__mini_next_main.require.bind(__mini_next_main):require;\n"
                     "const React=(globalThis&&globalThis.__MINI_NEXT_REACT__)?globalThis.__MINI_NEXT_REACT__:__mini_next_req('react');\n"
                     "if(globalThis){globalThis.__MINI_NEXT_REACT__=React;}\n") +
         transformed;
}

} // namespace mini_next
