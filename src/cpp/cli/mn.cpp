#include <cstring>
#include <filesystem>
#include <string>
#include <vector>

#include <ftxui/component/component.hpp>
#include <ftxui/component/screen_interactive.hpp>
#include <ftxui/dom/elements.hpp>

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
  for (int i = 0; i < 2; i++) {
    if (cur.has_parent_path())
      cur = cur.parent_path();
  }
  return cur;
}

static void writeUsage() {
  const char *msg = "Usage:\n"
                    "  mn create <dir> [options]\n"
                    "  mn <dir> [options]\n"
                    "  mn\n"
                    "\n"
                    "Options:\n"
                    "  --template <basic|music>\n"
                    "  --music\n"
                    "  --db <none|sqlite>\n"
                    "  --css <none|tailwind|pico|bootstrap>\n"
                    "  --ui <none|daisyui|preline|flowbite>\n"
                    "  --ts\n"
                    "  --no-install\n"
                    "  --help\n"
                    "\n";
#if defined(_WIN32)
  _write(1, msg, (unsigned int)strlen(msg));
#else
  ::write(1, msg, strlen(msg));
#endif
}

struct MnInteractiveResult {
  bool ok = false;
  std::vector<std::string> args;
};

static MnInteractiveResult runInteractiveTui() {
  using namespace ftxui;

  MnInteractiveResult result;

  std::string dir = "mini-next-app";
  bool typescript = false;
  bool install = true;

  std::vector<std::string> templates = {"basic", "music"};
  int template_index = 0;

  std::vector<std::string> css_list = {"tailwind", "pico", "bootstrap", "none"};
  int css_index = 0;

  std::vector<std::string> ui_list = {"daisyui", "preline", "flowbite", "none"};
  int ui_index = 0;

  std::vector<std::string> db_list = {"none", "sqlite"};
  int db_index = 0;

  auto screen = ScreenInteractive::Fullscreen();

  auto dir_input = Input(&dir, "mini-next-app");
  auto ts_checkbox = Checkbox("TypeScript (--ts)", &typescript);
  auto install_checkbox = Checkbox("Auto install (npm install)", &install);

  auto template_box = Radiobox(&templates, &template_index);
  auto css_box = Radiobox(&css_list, &css_index);
  auto ui_box = Radiobox(&ui_list, &ui_index);
  auto db_box = Radiobox(&db_list, &db_index);

  bool submitted = false;
  bool canceled = false;
  auto on_submit = [&] {
    submitted = true;
    screen.ExitLoopClosure()();
  };
  auto on_cancel = [&] {
    canceled = true;
    screen.ExitLoopClosure()();
  };

  auto create_btn = Button("Create", on_submit);
  auto cancel_btn = Button("Exit", on_cancel);

  auto container = Container::Vertical({
      dir_input,
      ts_checkbox,
      template_box,
      css_box,
      ui_box,
      db_box,
      install_checkbox,
      Container::Horizontal({create_btn, cancel_btn}),
  });

  auto renderer = Renderer(container, [&] {
    const int h_template = static_cast<int>(templates.size());
    const int h_css = static_cast<int>(css_list.size());
    const int h_ui = static_cast<int>(ui_list.size());
    const int h_db = static_cast<int>(db_list.size());

    auto left = vbox({
        window(text("Project directory") | bold, dir_input->Render()),
        ts_checkbox->Render(),
        window(text("Template") | bold,
               template_box->Render() | size(HEIGHT, EQUAL, h_template) | frame),
        window(text("CSS") | bold,
               css_box->Render() | size(HEIGHT, EQUAL, h_css) | frame),
    });

    auto right = vbox({
        window(text("UI") | bold,
               ui_box->Render() | size(HEIGHT, EQUAL, h_ui) | frame),
        window(text("Database") | bold,
               db_box->Render() | size(HEIGHT, EQUAL, h_db) | frame),
        install_checkbox->Render(),
    });

    auto buttons = hbox({
        create_btn->Render() | border,
        text(" "),
        cancel_btn->Render() | border,
    });

    auto tip = text("Tip: Tab to focus • Arrow keys • Space to toggle • Esc to exit") | dim;

    return vbox({
               text("mini-next-cpp CLI") | bold,
               separator(),
               hbox({
                   left | flex,
                   separator(),
                   right | flex,
               }) | border | flex,
               separator(),
               buttons,
               tip,
           }) |
           flex;
  });

  dir_input->TakeFocus();
  auto app = CatchEvent(renderer, [&](Event e) {
    if (e == Event::Escape) {
      on_cancel();
      return true;
    }
    return false;
  });
  screen.Loop(app);

  if (canceled || !submitted)
    return result;

  std::string dir_trim = dir;
  while (!dir_trim.empty() &&
         (dir_trim.back() == ' ' || dir_trim.back() == '\n' ||
          dir_trim.back() == '\r' || dir_trim.back() == '\t')) {
    dir_trim.pop_back();
  }
  size_t start = 0;
  while (start < dir_trim.size() &&
         (dir_trim[start] == ' ' || dir_trim[start] == '\n' ||
          dir_trim[start] == '\r' || dir_trim[start] == '\t')) {
    start++;
  }
  if (start > 0)
    dir_trim = dir_trim.substr(start);
  if (dir_trim.empty())
    dir_trim = "mini-next-app";

  result.ok = true;
  result.args.push_back(dir_trim);
  if (typescript)
    result.args.push_back("--ts");

  result.args.push_back("--template");
  result.args.push_back(templates[(size_t)template_index]);

  result.args.push_back("--css");
  result.args.push_back(css_list[(size_t)css_index]);

  result.args.push_back("--ui");
  result.args.push_back(ui_list[(size_t)ui_index]);

  result.args.push_back("--db");
  result.args.push_back(db_list[(size_t)db_index]);

  if (!install)
    result.args.push_back("--no-install");

  return result;
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
  std::vector<std::string> outArgs;
  outArgs.reserve((size_t)argc);

  int i = 1;
  std::string cmd =
      (argc >= 2 && argv[i]) ? std::string(argv[i]) : std::string();
  if (cmd == "-h" || cmd == "--help") {
    writeUsage();
    return 0;
  }

  if (argc < 2) {
    auto picked = runInteractiveTui();
    if (!picked.ok)
      return 1;
    outArgs = std::move(picked.args);
  } else if (cmd == "create" && argc == 2) {
    auto picked = runInteractiveTui();
    if (!picked.ok)
      return 1;
    outArgs = std::move(picked.args);
  } else {
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
