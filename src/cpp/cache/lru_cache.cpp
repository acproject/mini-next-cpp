#include "lru_cache.hpp"

#include <string>

template class ConcurrentLRUCache<std::string, std::string>;
