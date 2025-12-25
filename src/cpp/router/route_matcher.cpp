#include "route_matcher.hpp"
#include <algorithm>
#include <chrono>
#include <cstddef>
#include <filesystem>
#include <fstream>
#include <regex>
#include <string>
#include <unordered_map>
#include <utility>

RouteMatcher::RouteMatcher(const std::string &pagesDir) : pagesDir_(pagesDir) {
  scanFilesystem();
}

static int segmentRank(RouteSegmentKind k) {
  switch (k) {
  case RouteSegmentKind::Static:
    return 3;
  case RouteSegmentKind::Dynamic:
    return 2;
  case RouteSegmentKind::CatchAll:
    return 1;
  case RouteSegmentKind::OptionalCatchAll:
    return 0;
  }
  return 0;
}

static void appendRegexEscaped(std::string &out, const std::string &s) {
  for (char c : s) {
    switch (c) {
    case '\\':
    case '.':
    case '^':
    case '$':
    case '|':
    case '(':
    case ')':
    case '[':
    case ']':
    case '{':
    case '}':
    case '*':
    case '+':
    case '?':
      out.push_back('\\');
      out.push_back(c);
      break;
    default:
      out.push_back(c);
      break;
    }
  }
}

void RouteMatcher::addRoute(const std::string &route,
                            const std::string &filePath) {
  Route r;
  r.path = route;
  r.filePath = filePath;
  r.isDynamic = route.find('[') != std::string::npos;

  bool valid = true;
  r.regexPattern = compileRoutePattern(route, r.segments, r.paramNames, valid);
  if (!valid) {
    return;
  }
  routes_.push_back(r);
}

std::pair<bool, std::unordered_map<std::string, std::string>>
RouteMatcher::match(const std::string &url) {
  auto result = matchRoute(url);
  return {result.matched, std::move(result.params)};
}

MatchResult RouteMatcher::matchRoute(const std::string &url) {
  MatchResult result;
  result.matched = false;

  auto cacheIt = routeCache_.find(url);
  if (cacheIt != routeCache_.end()) {
    const auto &route = cacheIt->second;
    if (!route.isDynamic) {
      if (route.path == url) {
        result.matched = true;
        result.filePath = route.filePath;
        return result;
      }
    } else {
      std::smatch matches;
      if (std::regex_match(url, matches, route.regexPattern)) {
        result.matched = true;
        result.filePath = route.filePath;
        for (size_t i = 0; i < route.paramNames.size(); i++) {
          if (i + 1 < matches.size()) {
            if (matches[i + 1].matched) {
              result.params[route.paramNames[i]] = matches[i + 1].str();
            }
          }
        }
        return result;
      }
    }
    routeCache_.erase(cacheIt);
  }

  for (const auto &route : routes_) {
    if (!route.isDynamic) {
      if (route.path == url) {
        result.matched = true;
        result.filePath = route.filePath;
        routeCache_[url] = route;
        return result;
      }
      continue;
    }

    std::smatch matches;
    if (!std::regex_match(url, matches, route.regexPattern)) {
      continue;
    }

    result.matched = true;
    result.filePath = route.filePath;
    for (size_t i = 0; i < route.paramNames.size(); i++) {
      if (i + 1 < matches.size()) {
        if (matches[i + 1].matched) {
          result.params[route.paramNames[i]] = matches[i + 1].str();
        }
      }
    }
    routeCache_[url] = route;
    return result;
  }

  return result;
}

void RouteMatcher::scanFilesystem() {
  routes_.clear();
  routeCache_.clear();

  std::error_code ec;
  if (!std::filesystem::exists(pagesDir_, ec)) {
    return;
  }

  for (const auto &entry :
       std::filesystem::recursive_directory_iterator(pagesDir_, ec)) {
    if (ec) {
      break;
    }
    if (!entry.is_regular_file(ec)) {
      continue;
    }

    const auto path = entry.path();
    const auto ext = path.extension().string();
    if (ext != ".js" && ext != ".jsx" && ext != ".ts" && ext != ".tsx") {
      continue;
    }

    std::filesystem::path rel = std::filesystem::relative(path, pagesDir_, ec);
    if (ec) {
      continue;
    }

    rel.replace_extension("");
    std::string route = rel.generic_string();
    if (route == "index") {
      route = "";
    }
    if (route.size() >= 6 && route.substr(route.size() - 6) == "/index") {
      route = route.substr(0, route.size() - 6);
    }

    route = "/" + route;
    if (route.size() > 1 && route.back() == '/') {
      route.pop_back();
    }

    addRoute(route, path.string());
  }

  std::sort(routes_.begin(), routes_.end(),
            [](const Route &a, const Route &b) -> bool {
              const size_t al = a.segments.size();
              const size_t bl = b.segments.size();
              const size_t ml = std::min(al, bl);
              for (size_t i = 0; i < ml; i++) {
                const auto ak = a.segments[i].kind;
                const auto bk = b.segments[i].kind;
                const int ar = segmentRank(ak);
                const int br = segmentRank(bk);
                if (ar != br) {
                  return ar > br;
                }
                if (ak == RouteSegmentKind::Static &&
                    bk == RouteSegmentKind::Static) {
                  if (a.segments[i].text != b.segments[i].text) {
                    return a.segments[i].text < b.segments[i].text;
                  }
                }
              }
              if (al != bl) {
                return al < bl;
              }
              return a.path < b.path;
            });
}

std::regex RouteMatcher::compileRoutePattern(const std::string &route,
                                             std::vector<RouteSegment> &outSegments,
                                             std::vector<std::string> &outParamNames,
                                             bool &outValid) {
  outSegments.clear();
  outParamNames.clear();
  outValid = true;

  if (route.empty() || route[0] != '/') {
    outValid = false;
    return std::regex();
  }

  std::vector<std::string> segs;
  {
    size_t i = 1;
    while (i <= route.size()) {
      size_t j = i;
      while (j < route.size() && route[j] != '/') {
        j++;
      }
      if (j > i) {
        segs.push_back(route.substr(i, j - i));
      }
      i = j + 1;
      if (j >= route.size()) {
        break;
      }
    }
  }

  std::string pattern;
  pattern.reserve(route.size() * 2 + 16);
  pattern.append("^");

  if (segs.empty()) {
    pattern.append("/$");
    return std::regex(pattern);
  }

  for (size_t idx = 0; idx < segs.size(); idx++) {
    const std::string &seg = segs[idx];
    const bool isLast = idx + 1 == segs.size();

    if (seg.size() >= 6 && seg.rfind("[[...", 0) == 0 &&
        seg.substr(seg.size() - 2) == "]]") {
      if (!isLast) {
        outValid = false;
        return std::regex();
      }
      const std::string inner = seg.substr(2, seg.size() - 4);
      const std::string name = inner.size() > 3 ? inner.substr(3) : std::string();
      if (name.empty()) {
        outValid = false;
        return std::regex();
      }
      outSegments.push_back({RouteSegmentKind::OptionalCatchAll, name});
      outParamNames.push_back(name);
      if (segs.size() == 1) {
        pattern.append("/(?:(.+))?");
      } else {
        pattern.append("(?:/(.+))?");
      }
      continue;
    }

    pattern.push_back('/');

    if (seg.size() >= 5 && seg.rfind("[...", 0) == 0 && seg.back() == ']') {
      if (!isLast) {
        outValid = false;
        return std::regex();
      }
      const std::string name = seg.substr(4, seg.size() - 5);
      if (name.empty()) {
        outValid = false;
        return std::regex();
      }
      outSegments.push_back({RouteSegmentKind::CatchAll, name});
      outParamNames.push_back(name);
      pattern.append("(.+)");
      continue;
    }

    if (seg.size() >= 3 && seg.front() == '[' && seg.back() == ']') {
      const std::string name = seg.substr(1, seg.size() - 2);
      if (name.empty()) {
        outValid = false;
        return std::regex();
      }
      outSegments.push_back({RouteSegmentKind::Dynamic, name});
      outParamNames.push_back(name);
      pattern.append("([^/]+)");
      continue;
    }

    outSegments.push_back({RouteSegmentKind::Static, seg});
    appendRegexEscaped(pattern, seg);
  }

  pattern.append("$");
  return std::regex(pattern);
}
