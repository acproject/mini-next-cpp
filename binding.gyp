{
  "targets": [
    {
      "target_name": "mini_next",
      "sources": [
        "src/node/addon.cpp",
        "src/cpp/router/route_matcher.cpp",
        "src/cpp/renderer/react_renderer.cpp",
        "src/cpp/renderer/template_engine.cpp",
        "src/cpp/parser/markdown_parser.cpp",
        "src/cpp/parser/jsx_parser.cpp",
        "src/cpp/utils/string_utils.cpp",
        "src/cpp/utils/perf_counter.cpp",
        "src/cpp/cache/lru_cache.cpp",
        "src/cpp/cache/ssr_cache.cpp",
        "src/cpp/router/filesystem_watcher.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "src/cpp"
      ],
      "dependencies": [
        "<!(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [
        "NODE_ADDON_API_DISABLE_CPP_EXCEPTIONS",
        "NAPI_VERSION=8"
      ],
      "cflags_cc": [
        "-std=c++17",
        "-O3",
        "-Wall",
        "-Wextra",
        "-Wpedantic"
      ]
    },
    {
      "target_name": "mn",
      "type": "executable",
      "sources": [
        "src/cpp/cli/mn.cpp"
      ],
      "cflags_cc": [
        "-std=c++17",
        "-O3",
        "-Wall",
        "-Wextra",
        "-Wpedantic"
      ]
    },
    {
      "target_name": "mini_next_serve",
      "type": "executable",
      "sources": [
        "src/cpp/prod_server/mini_next_serve.cpp"
      ],
      "cflags_cc": [
        "-std=c++17",
        "-O3",
        "-Wall",
        "-Wextra",
        "-Wpedantic"
      ]
    }
  ]
}
