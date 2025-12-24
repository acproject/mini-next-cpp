#pragma once

#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <memory>
#include <new>
#include <vector>

namespace mini_next {

class MemoryPool {
public:
  explicit MemoryPool(size_t blockSize = 1 << 20) : blockSize_(blockSize) {
    addBlock(blockSize_);
  }

  MemoryPool(const MemoryPool &) = delete;
  MemoryPool &operator=(const MemoryPool &) = delete;

  void *allocate(size_t size, size_t alignment = alignof(std::max_align_t)) {
    if (size == 0) {
      size = 1;
    }
    if ((alignment & (alignment - 1)) != 0) {
      alignment = alignof(std::max_align_t);
    }

    auto &block = blocks_.back();
    size_t alignedOffset =
        (block.offset + alignment - 1) & ~(alignment - 1);
    if (alignedOffset + size > block.size) {
      addBlock(std::max(blockSize_, size + alignment));
      return allocate(size, alignment);
    }

    void *ptr = block.data.get() + alignedOffset;
    block.offset = alignedOffset + size;
    return ptr;
  }

  void reset() {
    if (blocks_.empty()) {
      addBlock(blockSize_);
      return;
    }

    for (auto &b : blocks_) {
      b.offset = 0;
    }
    if (blocks_.size() > 1) {
      blocks_.erase(blocks_.begin() + 1, blocks_.end());
    }
  }

private:
  struct Block {
    std::unique_ptr<std::byte[]> data;
    size_t size = 0;
    size_t offset = 0;
  };

  size_t blockSize_;
  std::vector<Block> blocks_;

  void addBlock(size_t size) {
    Block b;
    b.data = std::unique_ptr<std::byte[]>(new (std::nothrow) std::byte[size]);
    if (!b.data) {
      throw std::bad_alloc();
    }
    b.size = size;
    b.offset = 0;
    blocks_.push_back(std::move(b));
  }
};

template <typename T> class PoolAllocator {
public:
  using value_type = T;

  explicit PoolAllocator(MemoryPool *pool) noexcept : pool_(pool) {}

  template <typename U>
  PoolAllocator(const PoolAllocator<U> &other) noexcept : pool_(other.pool_) {}

  T *allocate(size_t n) {
    return static_cast<T *>(pool_->allocate(sizeof(T) * n, alignof(T)));
  }

  void deallocate(T *, size_t) noexcept {}

  template <typename U> bool operator==(const PoolAllocator<U> &o) const noexcept {
    return pool_ == o.pool_;
  }
  template <typename U> bool operator!=(const PoolAllocator<U> &o) const noexcept {
    return pool_ != o.pool_;
  }

  MemoryPool *pool() const noexcept { return pool_; }

  template <typename> friend class PoolAllocator;

private:
  MemoryPool *pool_;
};

} // namespace mini_next
