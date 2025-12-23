#include <cstddef>
#include <list>
#include <mutex>
#include <optional>
#include <unordered_map>
#include <utility>

template <typename K, typename V> class ConcurrentLRUCache {
public:
  explicit ConcurrentLRUCache(size_t capacity) : capacity_(capacity) {}
  // 获取值
  std::optional<V> get(const K &key) {
    std::lock_guard<std::mutex> lock(mutex_);

    auto it = cache_.find(key);
    if (it == cache_.end()) {
      return std::nullopt;
    }
    // 移动到链表头部（最近使用）
    lruList_.splice(lruList_.begin(), lruList_, it->second.second);
    return it->second.first;
  }
  // 设置值
  void put(const K &key, const V &value) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = cache_.find(key);
    if (it != cache_.end()) {
      // 更新现有值并移动到头部
      lruList_.splice(lruList_.begin(), lruList_, it->second.second);
      it->second.first = value;
      return;
    }

    if (cache_.size() >= capacity_) {
      // 移动最久未使用的
      auto last = lruList_.end();
      last--;
      cache_.erase(*last);
      lruList_.pop_back();
    }

    // 插入新值
    lruList_.push_front(key);
    cache_[key] = {value, lruList_.begin()};
  }

  // 删除值
  void erase(const K &key) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = cache_.find(key);
    if (it != cache_.end()) {
      lruList_.erase(it->second.second);
      cache_.erase(it);
    }
  }

  void clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    cache_.clear();
    lruList_.clear();
  }

private:
  size_t capacity_;
  std::mutex mutex_;
  std::list<K> lruList_;
  std::unordered_map<K, std::pair<V, typename std::list<K>::iterator>> cache_;
};
