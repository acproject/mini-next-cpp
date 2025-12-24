#include "lru_cache.hpp"

#include <optional>
#include <string>

namespace mini_next {

class SSRCache {
public:
  explicit SSRCache(size_t capacity) : cache_(capacity) {}

  std::optional<std::string> get(const std::string &key) { return cache_.get(key); }
  void set(const std::string &key, const std::string &value) { cache_.put(key, value); }
  void erase(const std::string &key) { cache_.erase(key); }
  void clear() { cache_.clear(); }

private:
  ConcurrentLRUCache<std::string, std::string> cache_;
};

} // namespace mini_next
