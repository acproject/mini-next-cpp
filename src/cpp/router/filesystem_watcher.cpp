#include <atomic>
#include <chrono>
#include <filesystem>
#include <functional>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

namespace mini_next {

class FilesystemWatcher {
public:
  using Callback = std::function<void(const std::vector<std::string> &)>;

  FilesystemWatcher(std::string rootDir, int intervalMs)
      : rootDir_(std::move(rootDir)), intervalMs_(intervalMs), running_(false) {
  }

  ~FilesystemWatcher() { stop(); }

  FilesystemWatcher(const FilesystemWatcher &) = delete;
  FilesystemWatcher &operator=(const FilesystemWatcher &) = delete;

  void start(Callback cb) {
    stop();
    callback_ = std::move(cb);
    running_ = true;
    thread_ = std::thread([this]() { loop(); });
  }

  void stop() {
    running_ = false;
    if (thread_.joinable()) {
      thread_.join();
    }
  }

private:
  std::string rootDir_;
  int intervalMs_;
  std::atomic<bool> running_;
  std::thread thread_;
  Callback callback_;
  std::unordered_map<std::string, std::filesystem::file_time_type> times_;
  std::mutex mutex_;

  void scanOnce(std::vector<std::string> &changed) {
    std::error_code ec;
    if (!std::filesystem::exists(rootDir_, ec)) {
      return;
    }
    for (const auto &entry :
         std::filesystem::recursive_directory_iterator(rootDir_, ec)) {
      if (ec) {
        break;
      }
      if (!entry.is_regular_file(ec)) {
        continue;
      }
      auto path = entry.path().string();
      auto t = entry.last_write_time(ec);
      if (ec) {
        continue;
      }

      std::lock_guard<std::mutex> lock(mutex_);
      auto it = times_.find(path);
      if (it == times_.end()) {
        times_[path] = t;
        continue;
      }
      if (it->second != t) {
        it->second = t;
        changed.push_back(path);
      }
    }
  }

  void loop() {
    while (running_) {
      std::vector<std::string> changed;
      scanOnce(changed);
      if (!changed.empty() && callback_) {
        callback_(changed);
      }
      std::this_thread::sleep_for(std::chrono::milliseconds(intervalMs_));
    }
  }
};

} // namespace mini_next
