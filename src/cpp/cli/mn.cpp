#include <cstring>
#include <filesystem>
#include <string>
#include <vector>

#if defined(_WIN32)
#include <process.h>
#else
#include <unistd.h>
#endif

static std::filesystem::path getExecutablePath(const char *argv0) {
  if (!argv0 || !*argv0)
    return std::filesystem::current_path();
  std::filesystem::path p = std::filesystem::path(argv0);
  if (p.is_absolute())
    return p;
  return std::filesystem::absolute(p);
}

static std::filesystem::path
findPackageRootFromExecutable(const std::filesystem::path &exePath) {
  auto cur = exePath.parent_path();
  for (int i = 0; i < 3; i++) {
    if (cur.has_parent_path())
      cur = cur.parent_path();
  }
  return cur;
}

static void writeUsage() {
  const char *msg = "Usage:\n"
                    "  mn create <dir> [options]\n"
                    "  mn <dir> [options]\n"
                    "\n"
                    "Options:\n"
                    "  --template <basic|music>\n"
                    "  --music\n"
                    "  --db <none|sqlite>\n"
                    "  --css <none|tailwind|pico|bootstrap>\n"
                    "  --ui <none|daisyui|preline>\n"
                    "  --no-install\n"
                    "  --help\n"
                    "\n";
#if defined(_WIN32)
  _write(1, msg, (unsigned int)strlen(msg));
#else
  ::write(1, msg, strlen(msg));
#endif
}

static int execNode(const std::filesystem::path &scriptPath,
                    const std::vector<std::string> &args) {
  std::vector<std::string> argv;
  argv.reserve(args.size() + 3);
  argv.push_back("node");
  argv.push_back(scriptPath.string());
  for (const auto &a : args)
    argv.push_back(a);

#if defined(_WIN32)
  std::vector<const char *> cargs;
  cargs.reserve(argv.size() + 1);
  for (auto &s : argv)
    cargs.push_back(s.c_str());
  cargs.push_back(nullptr);
  return _execvp("node", (char *const *)cargs.data());
#else
  std::vector<char *> cargs;
  cargs.reserve(argv.size() + 1);
  for (auto &s : argv)
    cargs.push_back(const_cast<char *>(s.c_str()));
  cargs.push_back(nullptr);
  ::execvp("node", cargs.data());
  return 127;
#endif
}

int main(int argc, char **argv) {
  if (argc < 2) {
    writeUsage();
    return 1;
  }

  std::vector<std::string> outArgs;
  outArgs.reserve((size_t)argc);

  int i = 1;
  std::string cmd = argv[i] ? std::string(argv[i]) : std::string();
  if (cmd == "-h" || cmd == "--help") {
    writeUsage();
    return 0;
  }

  if (cmd == "create") {
    i++;
    if (i >= argc) {
      writeUsage();
      return 1;
    }
  }

  for (; i < argc; i++) {
    if (!argv[i])
      continue;
    outArgs.push_back(std::string(argv[i]));
  }

  const auto exe = getExecutablePath(argv[0]);
  const auto root = findPackageRootFromExecutable(exe);
  const auto script = root / "js" / "create-mini-next-app.js";
  if (!std::filesystem::exists(script)) {
    const auto fallback = std::filesystem::path(argv[0]).parent_path() / ".." /
                          ".." / ".." / "js" / "create-mini-next-app.js";
    if (std::filesystem::exists(fallback)) {
      return execNode(std::filesystem::canonical(fallback), outArgs);
    }
    writeUsage();
    return 2;
  }

  return execNode(std::filesystem::canonical(script), outArgs);
}
