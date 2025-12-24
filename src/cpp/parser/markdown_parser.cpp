#include <string>
#include <string_view>
#include <vector>

namespace mini_next {

std::string htmlEscape(std::string_view s);
std::string trim(std::string_view s);
bool startsWith(std::string_view s, std::string_view prefix);

static std::string renderInline(std::string_view line) {
  std::string out;
  out.reserve(line.size());

  for (size_t i = 0; i < line.size(); i++) {
    if (line[i] == '`') {
      size_t j = line.find('`', i + 1);
      if (j != std::string_view::npos) {
        out.append("<code>");
        out.append(htmlEscape(line.substr(i + 1, j - (i + 1))));
        out.append("</code>");
        i = j;
        continue;
      }
    }

    if (i + 1 < line.size() && line[i] == '*' && line[i + 1] == '*') {
      size_t j = line.find("**", i + 2);
      if (j != std::string_view::npos) {
        out.append("<strong>");
        out.append(htmlEscape(line.substr(i + 2, j - (i + 2))));
        out.append("</strong>");
        i = j + 1;
        continue;
      }
    }

    if (line[i] == '*') {
      size_t j = line.find('*', i + 1);
      if (j != std::string_view::npos) {
        out.append("<em>");
        out.append(htmlEscape(line.substr(i + 1, j - (i + 1))));
        out.append("</em>");
        i = j;
        continue;
      }
    }

    if (line[i] == '[') {
      size_t mid = line.find(']', i + 1);
      if (mid != std::string_view::npos && mid + 1 < line.size() &&
          line[mid + 1] == '(') {
        size_t end = line.find(')', mid + 2);
        if (end != std::string_view::npos) {
          auto text = line.substr(i + 1, mid - (i + 1));
          auto url = line.substr(mid + 2, end - (mid + 2));
          out.append("<a href=\"");
          out.append(htmlEscape(url));
          out.append("\">");
          out.append(htmlEscape(text));
          out.append("</a>");
          i = end;
          continue;
        }
      }
    }

    out.append(htmlEscape(line.substr(i, 1)));
  }

  return out;
}

std::string markdownToHtml(const std::string &markdown) {
  std::string out;
  out.reserve(markdown.size() * 2);

  bool inCodeBlock = false;
  bool inList = false;

  size_t start = 0;
  while (start <= markdown.size()) {
    size_t end = markdown.find('\n', start);
    if (end == std::string::npos) {
      end = markdown.size();
    }

    std::string_view line(markdown.data() + start, end - start);
    if (!line.empty() && line.back() == '\r') {
      line.remove_suffix(1);
    }

    auto raw = trim(line);

    if (startsWith(raw, "```")) {
      if (!inCodeBlock) {
        if (inList) {
          out.append("</ul>");
          inList = false;
        }
        out.append("<pre><code>");
        inCodeBlock = true;
      } else {
        out.append("</code></pre>");
        inCodeBlock = false;
      }
      out.push_back('\n');
      start = end + 1;
      continue;
    }

    if (inCodeBlock) {
      out.append(htmlEscape(line));
      out.push_back('\n');
      start = end + 1;
      continue;
    }

    if (raw.empty()) {
      if (inList) {
        out.append("</ul>");
        inList = false;
      }
      start = end + 1;
      continue;
    }

    size_t headingLevel = 0;
    while (headingLevel < raw.size() && raw[headingLevel] == '#') {
      headingLevel++;
    }
    if (headingLevel > 0 && headingLevel <= 6 && headingLevel < raw.size() &&
        raw[headingLevel] == ' ') {
      if (inList) {
        out.append("</ul>");
        inList = false;
      }
      out.append("<h");
      out.append(std::to_string(headingLevel));
      out.append(">");
      out.append(renderInline(std::string_view(raw).substr(headingLevel + 1)));
      out.append("</h");
      out.append(std::to_string(headingLevel));
      out.append(">");
      start = end + 1;
      continue;
    }

    if (startsWith(raw, "- ") || startsWith(raw, "* ")) {
      if (!inList) {
        out.append("<ul>");
        inList = true;
      }
      out.append("<li>");
      out.append(renderInline(std::string_view(raw).substr(2)));
      out.append("</li>");
      start = end + 1;
      continue;
    }

    if (inList) {
      out.append("</ul>");
      inList = false;
    }

    out.append("<p>");
    out.append(renderInline(raw));
    out.append("</p>");

    start = end + 1;
  }

  if (inList) {
    out.append("</ul>");
  }
  if (inCodeBlock) {
    out.append("</code></pre>");
  }

  return out;
}

} // namespace mini_next
