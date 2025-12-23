#include "route_matcher.hpp"
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

void RouteMatcher::addRoute(const std::string &route,
                            const std::string &filePath) {
  Route r;
  r.path = route;
  r.filePath = filePath;
  r.isDynamic = route.find('[') != std::string::npos;
  if (r.isDynamic) {
    std::regex paramRegex("\\[([^\\]]+)\\]");
    std::smatch matches;
    std::string pattern = route;

    while (std::regex_search(pattern, matches, paramRegex)) {
      r.paramNames.push_back(matches[1]);
      pattern = matches.suffix().str();
    }
    r.regexPattern = compileRoutePattern(route);
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
            result.params[route.paramNames[i]] = matches[i + 1];
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
        result.params[route.paramNames[i]] = matches[i + 1];
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
}

std::regex RouteMatcher::compileRoutePattern(const std::string &route) {
  std::string regexStr =
      std::regex_replace(route, std::regex("\\[([^\\]]+)\\]"), "([^/]+)");
  regexStr = "^" + regexStr + "$";
  return std::regex(regexStr);
}
