#include <napi.h>

#include "../cpp/cache/lru_cache.hpp"
#include "../cpp/router/route_matcher.hpp"

#include <memory>
#include <string>

class RouteMatcherWrapper : public Napi::ObjectWrap<RouteMatcherWrapper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func =
        DefineClass(env, "RouteMatcher",
                    {InstanceMethod("match", &RouteMatcherWrapper::Match),
                     InstanceMethod("rescan", &RouteMatcherWrapper::Rescan)});

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();
    exports.Set("RouteMatcher", func);
    return exports;
  }

  RouteMatcherWrapper(const Napi::CallbackInfo &info)
      : Napi::ObjectWrap<RouteMatcherWrapper>(info) {
    std::string pagesDir = "pages";
    if (info.Length() >= 1 && info[0].IsString()) {
      pagesDir = info[0].As<Napi::String>().Utf8Value();
    }
    matcher_ = std::make_unique<RouteMatcher>(pagesDir);
  }

private:
  static Napi::FunctionReference constructor;
  std::unique_ptr<RouteMatcher> matcher_;

  Napi::Value Rescan(const Napi::CallbackInfo &info) {
    matcher_->scanFilesystem();
    return info.Env().Undefined();
  }

  Napi::Value Match(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
      Napi::TypeError::New(env, "Expected url string")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }

    const std::string url = info[0].As<Napi::String>().Utf8Value();
    const auto result = matcher_->matchRoute(url);

    Napi::Object out = Napi::Object::New(env);
    out.Set("matched", Napi::Boolean::New(env, result.matched));
    out.Set("filePath", Napi::String::New(env, result.filePath));

    Napi::Object params = Napi::Object::New(env);
    for (const auto &kv : result.params) {
      params.Set(kv.first, kv.second);
    }
    out.Set("params", params);
    return out;
  }
};

Napi::FunctionReference RouteMatcherWrapper::constructor;

class SSRCacheWrapper : public Napi::ObjectWrap<SSRCacheWrapper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func =
        DefineClass(env, "SSRCache",
                    {InstanceMethod("get", &SSRCacheWrapper::Get),
                     InstanceMethod("set", &SSRCacheWrapper::Set),
                     InstanceMethod("erase", &SSRCacheWrapper::Erase),
                     InstanceMethod("clear", &SSRCacheWrapper::Clear)});

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();
    exports.Set("SSRCache", func);
    return exports;
  }

  SSRCacheWrapper(const Napi::CallbackInfo &info)
      : Napi::ObjectWrap<SSRCacheWrapper>(info) {
    size_t capacity = 256;
    if (info.Length() >= 1 && info[0].IsNumber()) {
      const auto cap = info[0].As<Napi::Number>().Uint32Value();
      capacity = cap == 0 ? 1 : static_cast<size_t>(cap);
    }
    cache_ = std::make_unique<ConcurrentLRUCache<std::string, std::string>>(
        capacity);
  }

private:
  static Napi::FunctionReference constructor;
  std::unique_ptr<ConcurrentLRUCache<std::string, std::string>> cache_;

  Napi::Value Get(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
      Napi::TypeError::New(env, "Expected key string")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }
    const std::string key = info[0].As<Napi::String>().Utf8Value();
    auto val = cache_->get(key);
    if (!val.has_value()) {
      return env.Undefined();
    }
    return Napi::String::New(env, val.value());
  }

  Napi::Value Set(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
      Napi::TypeError::New(env, "Expected (key: string, value: string)")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }
    const std::string key = info[0].As<Napi::String>().Utf8Value();
    const std::string value = info[1].As<Napi::String>().Utf8Value();
    cache_->put(key, value);
    return env.Undefined();
  }

  Napi::Value Erase(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
      Napi::TypeError::New(env, "Expected key string")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }
    const std::string key = info[0].As<Napi::String>().Utf8Value();
    cache_->erase(key);
    return env.Undefined();
  }

  Napi::Value Clear(const Napi::CallbackInfo &info) {
    cache_->clear();
    return info.Env().Undefined();
  }
};

Napi::FunctionReference SSRCacheWrapper::constructor;

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  RouteMatcherWrapper::Init(env, exports);
  SSRCacheWrapper::Init(env, exports);
  return exports;
}

NODE_API_MODULE(mini_next, InitAll)
