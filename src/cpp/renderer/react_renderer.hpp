#include <memory>
#include <string>
#include <v8.h>

class ReactRenderer {
public:
  ReactRenderer();
  ~ReactRenderer();

  // 初始化V8隔离
  bool initialize();
  // 渲染React组件
  std::string renderToString(const std::string &componentCode,
                             const std::string &propsJson);
  // 预编译组件
  void precompileComponent(const std::string &componentPath);
  // 清除资源
  void cleanup();

private:
  std::unique_ptr<v8::Platform> platform_;
  v8::Isolate *isolate_;
  v8::Presistent<v8::Context> context_;
  v8::Persistent<v8::Function> renderFunction_;

  // 创建V8上下文
  v8::Lcol<v8::Context> createContext();

  // 执行JavaScript代码
  v8::Local<v8::Value> executeScript(const std::string &script);
};