#include <napi.h>

#include "../cpp/cache/lru_cache.hpp"
#include "../cpp/renderer/react_renderer.hpp"
#include "../cpp/router/route_matcher.hpp"

#include <uv.h>

#include <filesystem>
#include <memory>
#include <string>
#include <unordered_map>

namespace mini_next {
std::string markdownToHtml(const std::string &markdown);
std::string
renderTemplate(const std::string &tpl,
               const std::unordered_map<std::string, std::string> &ctx,
               bool escape);
std::string jsxToJsModule(const std::string &input);
} // namespace mini_next

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
      if (kv.second.has_value()) {
        params.Set(kv.first, Napi::String::New(env, kv.second.value()));
      } else {
        params.Set(kv.first, env.Undefined());
      }
    }
    out.Set("params", params);
    return out;
  }
};

Napi::FunctionReference RouteMatcherWrapper::constructor;

struct FileEventPayload {
  std::string path;
  std::string filename;
  int events;
  int status;
};

class FileWatcherWrapper : public Napi::ObjectWrap<FileWatcherWrapper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func =
        DefineClass(env, "FileWatcher",
                    {InstanceMethod("start", &FileWatcherWrapper::Start),
                     InstanceMethod("stop", &FileWatcherWrapper::Stop)});

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();
    exports.Set("FileWatcher", func);
    return exports;
  }

  FileWatcherWrapper(const Napi::CallbackInfo &info)
      : Napi::ObjectWrap<FileWatcherWrapper>(info), env_(info.Env()) {}

  ~FileWatcherWrapper() { stopInternal(); }

  FileWatcherWrapper(const FileWatcherWrapper &) = delete;
  FileWatcherWrapper &operator=(const FileWatcherWrapper &) = delete;

private:
  static Napi::FunctionReference constructor;

  Napi::Env env_;
  std::string watchPath_;
  uv_fs_event_t *handle_{nullptr};
  bool started_{false};
  Napi::ThreadSafeFunction tsfn_;

  static void OnEvent(uv_fs_event_t *handle, const char *filename, int events,
                      int status) {
    auto *self = static_cast<FileWatcherWrapper *>(handle->data);
    if (!self || !self->started_) {
      return;
    }

    std::string filenameStr = filename ? std::string(filename) : std::string();
    std::string fullPath;
    if (!filenameStr.empty()) {
      fullPath =
          (std::filesystem::path(self->watchPath_) / filenameStr).string();
    } else {
      fullPath = self->watchPath_;
    }

    auto *payload = new FileEventPayload{
        std::move(fullPath), std::move(filenameStr), events, status};
    napi_status st = self->tsfn_.NonBlockingCall(
        payload,
        [](Napi::Env env, Napi::Function jsCallback, FileEventPayload *value) {
          Napi::Object ev = Napi::Object::New(env);
          ev.Set("path", Napi::String::New(env, value->path));
          ev.Set("filename", Napi::String::New(env, value->filename));
          ev.Set("events", Napi::Number::New(env, value->events));
          ev.Set("status", Napi::Number::New(env, value->status));
          jsCallback.Call({ev});
          delete value;
        });
    if (st != napi_ok) {
      delete payload;
    }
  }

  void stopInternal() {
    started_ = false;
    if (handle_) {
      uv_fs_event_stop(handle_);
      uv_close(reinterpret_cast<uv_handle_t *>(handle_), [](uv_handle_t *h) {
        delete reinterpret_cast<uv_fs_event_t *>(h);
      });
      handle_ = nullptr;
    }
    if (tsfn_) {
      tsfn_.Abort();
      tsfn_.Release();
      tsfn_ = Napi::ThreadSafeFunction();
    }
  }

  Napi::Value Stop(const Napi::CallbackInfo &info) {
    stopInternal();
    return info.Env().Undefined();
  }

  Napi::Value Start(const Napi::CallbackInfo &info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsFunction()) {
      Napi::TypeError::New(env, "Expected (path: string, callback: function)")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }

    stopInternal();

    watchPath_ = info[0].As<Napi::String>().Utf8Value();
    Napi::Function cb = info[1].As<Napi::Function>();
    bool recursive = true;
    if (info.Length() >= 3 && info[2].IsObject()) {
      Napi::Object opts = info[2].As<Napi::Object>();
      if (opts.Has("recursive")) {
        recursive = opts.Get("recursive").ToBoolean().Value();
      }
    }

    tsfn_ =
        Napi::ThreadSafeFunction::New(env, cb, "FileWatcherCallback", 64, 1);

    uv_loop_t *loop = nullptr;
    napi_status nst = napi_get_uv_event_loop(env, &loop);
    if (nst != napi_ok || loop == nullptr) {
      stopInternal();
      Napi::Error::New(env, "Failed to get libuv event loop")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }

    handle_ = new uv_fs_event_t();
    handle_->data = this;
    int rc = uv_fs_event_init(loop, handle_);
    if (rc != 0) {
      stopInternal();
      Napi::Error::New(env, uv_strerror(rc)).ThrowAsJavaScriptException();
      return env.Undefined();
    }

    unsigned int flags = 0;
#ifdef UV_FS_EVENT_RECURSIVE
    if (recursive) {
      flags |= UV_FS_EVENT_RECURSIVE;
    }
#else
    (void)recursive;
#endif

    rc = uv_fs_event_start(handle_, &FileWatcherWrapper::OnEvent,
                           watchPath_.c_str(), flags);
    if (rc != 0) {
      stopInternal();
      Napi::Error::New(env, uv_strerror(rc)).ThrowAsJavaScriptException();
      return env.Undefined();
    }

    started_ = true;
    return env.Undefined();
  }
};

Napi::FunctionReference FileWatcherWrapper::constructor;

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

static Napi::Value MarkdownToHtml(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected markdown string")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const std::string markdown = info[0].As<Napi::String>().Utf8Value();
  return Napi::String::New(env, mini_next::markdownToHtml(markdown));
}

static Napi::Value RenderTemplate(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsObject()) {
    Napi::TypeError::New(env, "Expected (template: string, data: object)")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  const std::string tpl = info[0].As<Napi::String>().Utf8Value();
  const Napi::Object data = info[1].As<Napi::Object>();
  const bool escape = info.Length() >= 3 ? info[2].ToBoolean().Value() : true;

  std::unordered_map<std::string, std::string> ctx;
  Napi::Array keys = data.GetPropertyNames();
  ctx.reserve(keys.Length());
  for (uint32_t i = 0; i < keys.Length(); i++) {
    Napi::Value k = keys.Get(i);
    std::string key = k.ToString().Utf8Value();
    Napi::Value v = data.Get(k);
    ctx.emplace(std::move(key), v.ToString().Utf8Value());
  }

  std::string rendered = mini_next::renderTemplate(tpl, ctx, escape);
  return Napi::String::New(env, rendered);
}

static Napi::Value RenderToString(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected modulePath string")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const std::string modulePath = info[0].As<Napi::String>().Utf8Value();
  const std::string propsJson = info.Length() >= 2 && info[1].IsString()
                                    ? info[1].As<Napi::String>().Utf8Value()
                                    : std::string("{}");
  std::string html = mini_next::reactRenderToString(env, modulePath, propsJson);
  return Napi::String::New(env, html);
}

static Napi::Value JsxToJsModule(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected source string")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  const std::string src = info[0].As<Napi::String>().Utf8Value();
  return Napi::String::New(env, mini_next::jsxToJsModule(src));
}

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  RouteMatcherWrapper::Init(env, exports);
  FileWatcherWrapper::Init(env, exports);
  SSRCacheWrapper::Init(env, exports);
  exports.Set("markdownToHtml", Napi::Function::New(env, MarkdownToHtml));
  exports.Set("renderTemplate", Napi::Function::New(env, RenderTemplate));
  exports.Set("renderToString", Napi::Function::New(env, RenderToString));
  exports.Set("jsxToJsModule", Napi::Function::New(env, JsxToJsModule));
  return exports;
}

NODE_API_MODULE(mini_next, InitAll)
