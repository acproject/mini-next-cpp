#include <algorithm>
#include <cctype>
#include <sstream>
#include <string>
#include <string_view>
#include <unordered_map>
#include <vector>

namespace mini_next {

static inline bool isSpace(unsigned char c) { return std::isspace(c) != 0; }

std::string trim(std::string_view s) {
  size_t start = 0;
  while (start < s.size() && isSpace(static_cast<unsigned char>(s[start]))) {
    start++;
  }
  size_t end = s.size();
  while (end > start && isSpace(static_cast<unsigned char>(s[end - 1]))) {
    end--;
  }
  return std::string(s.substr(start, end - start));
}

bool startsWith(std::string_view s, std::string_view prefix) {
  return s.size() >= prefix.size() &&
         s.substr(0, prefix.size()) == prefix;
}

bool endsWith(std::string_view s, std::string_view suffix) {
  return s.size() >= suffix.size() &&
         s.substr(s.size() - suffix.size()) == suffix;
}

std::vector<std::string> split(std::string_view s, char delim) {
  std::vector<std::string> out;
  size_t start = 0;
  for (size_t i = 0; i <= s.size(); i++) {
    if (i == s.size() || s[i] == delim) {
      out.emplace_back(s.substr(start, i - start));
      start = i + 1;
    }
  }
  return out;
}

std::string replaceAll(std::string_view s, std::string_view from,
                       std::string_view to) {
  if (from.empty()) {
    return std::string(s);
  }

  std::string out;
  out.reserve(s.size());

  size_t pos = 0;
  while (true) {
    size_t idx = s.find(from, pos);
    if (idx == std::string_view::npos) {
      out.append(s.substr(pos));
      break;
    }
    out.append(s.substr(pos, idx - pos));
    out.append(to);
    pos = idx + from.size();
  }
  return out;
}

std::string htmlEscape(std::string_view s) {
  std::string out;
  out.reserve(s.size());
  for (char ch : s) {
    switch (ch) {
    case '&':
      out.append("&amp;");
      break;
    case '<':
      out.append("&lt;");
      break;
    case '>':
      out.append("&gt;");
      break;
    case '"':
      out.append("&quot;");
      break;
    case '\'':
      out.append("&#39;");
      break;
    default:
      out.push_back(ch);
      break;
    }
  }
  return out;
}

std::string urlDecode(std::string_view s) {
  std::string out;
  out.reserve(s.size());
  for (size_t i = 0; i < s.size(); i++) {
    char c = s[i];
    if (c == '%' && i + 2 < s.size()) {
      auto hex = [](char x) -> int {
        if (x >= '0' && x <= '9')
          return x - '0';
        if (x >= 'a' && x <= 'f')
          return 10 + (x - 'a');
        if (x >= 'A' && x <= 'F')
          return 10 + (x - 'A');
        return -1;
      };
      int hi = hex(s[i + 1]);
      int lo = hex(s[i + 2]);
      if (hi >= 0 && lo >= 0) {
        out.push_back(static_cast<char>((hi << 4) | lo));
        i += 2;
        continue;
      }
    }
    if (c == '+') {
      out.push_back(' ');
      continue;
    }
    out.push_back(c);
  }
  return out;
}

} // namespace mini_next
