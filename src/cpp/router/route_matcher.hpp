#include <regex>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

struct Route {
  std::string path;
  std::string filePath;
  bool isDynamic;
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
  // 添加路由
  void addRoute(const std::string &route, const std::string &filePath);
  // 匹配路由
  std::pair<bool, std::unordered_map<std::string, std::string>>
  match(const std::string &url);
  MatchResult matchRoute(const std::string &url);
  // 动态扫描文件系统
  void scanFilesystem();
  // 编译路由为正在表达式
  std::regex compileRoutePattern(const std::string &route);

private:
  std::string pagesDir_;
  std::vector<Route> routes_;
  std::unordered_map<std::string, Route> routeCache_;
};
