#include <regex>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

enum class RouteSegmentKind {
  Static,
  Dynamic,
  CatchAll,
  OptionalCatchAll,
};

struct RouteSegment {
  RouteSegmentKind kind;
  std::string text;
};

struct Route {
  std::string path;
  std::string filePath;
  bool isDynamic;
  std::vector<RouteSegment> segments;
  std::vector<std::string> paramNames;
  std::regex regexPattern;
};

struct MatchResult {
  bool matched;
  std::string filePath;
  std::unordered_map<std::string, std::string> params;
};

class RouteMatcher {
public:
  RouteMatcher(const std::string &pagesDir);
  void addRoute(const std::string &route, const std::string &filePath);
  std::pair<bool, std::unordered_map<std::string, std::string>>
  match(const std::string &url);
  MatchResult matchRoute(const std::string &url);
  void scanFilesystem();

private:
  std::regex compileRoutePattern(const std::string &route,
                                 std::vector<RouteSegment> &outSegments,
                                 std::vector<std::string> &outParamNames,
                                 bool &outValid);

  std::string pagesDir_;
  std::vector<Route> routes_;
  std::unordered_map<std::string, Route> routeCache_;
};
