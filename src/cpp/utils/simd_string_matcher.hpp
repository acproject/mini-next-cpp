#pragma once

#include <cstddef>
#include <string_view>

#ifdef __AVX2__
#include <immintrin.h>
#endif

namespace mini_next {

class SIMDStringMatcher {
public:
  static size_t find(std::string_view haystack, std::string_view needle,
                     size_t from = 0) {
    if (needle.empty()) {
      return from <= haystack.size() ? from : std::string_view::npos;
    }
    if (from >= haystack.size()) {
      return std::string_view::npos;
    }

#ifdef __AVX2__
    if (needle.size() == 1) {
      const unsigned char target = static_cast<unsigned char>(needle[0]);
      const char *data = haystack.data();
      size_t i = from;
      __m256i t = _mm256_set1_epi8(static_cast<char>(target));
      while (i + 32 <= haystack.size()) {
        __m256i v =
            _mm256_loadu_si256(reinterpret_cast<const __m256i *>(data + i));
        __m256i eq = _mm256_cmpeq_epi8(v, t);
        unsigned mask = static_cast<unsigned>(_mm256_movemask_epi8(eq));
        if (mask != 0) {
          unsigned offset = static_cast<unsigned>(__builtin_ctz(mask));
          return i + offset;
        }
        i += 32;
      }
      for (; i < haystack.size(); i++) {
        if (static_cast<unsigned char>(data[i]) == target) {
          return i;
        }
      }
      return std::string_view::npos;
    }
#endif

    return haystack.find(needle, from);
  }

  static bool contains(std::string_view haystack, std::string_view needle) {
    return find(haystack, needle, 0) != std::string_view::npos;
  }
};

} // namespace mini_next
