#include <chrono>
#include <cstdint>

namespace mini_next {

class PerfCounter {
public:
  PerfCounter();

  void start();
  uint64_t stop();
  void reset();

  uint64_t elapsedNs() const;
  double elapsedMs() const;

private:
  uint64_t startNs_;
  uint64_t elapsedNs_;
  bool running_;
};

class ScopedTimer {
public:
  explicit ScopedTimer(PerfCounter &counter);
  ~ScopedTimer();

private:
  PerfCounter &counter_;
};

uint64_t nowNs() {
  using Clock = std::chrono::steady_clock;
  auto t = Clock::now().time_since_epoch();
  return static_cast<uint64_t>(
      std::chrono::duration_cast<std::chrono::nanoseconds>(t).count());
}

PerfCounter::PerfCounter() : startNs_(0), elapsedNs_(0), running_(false) {}

void PerfCounter::start() {
  running_ = true;
  startNs_ = nowNs();
}

uint64_t PerfCounter::stop() {
  if (!running_) {
    return elapsedNs_;
  }
  uint64_t end = nowNs();
  elapsedNs_ += end - startNs_;
  running_ = false;
  return elapsedNs_;
}

void PerfCounter::reset() {
  startNs_ = 0;
  elapsedNs_ = 0;
  running_ = false;
}

uint64_t PerfCounter::elapsedNs() const { return elapsedNs_; }

double PerfCounter::elapsedMs() const {
  return static_cast<double>(elapsedNs_) / 1e6;
}

ScopedTimer::ScopedTimer(PerfCounter &counter) : counter_(counter) {
  counter_.start();
}

ScopedTimer::~ScopedTimer() { counter_.stop(); }

} // namespace mini_next
