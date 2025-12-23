{
  "targets": [
    {
      "target_name": "mini_next",
      "sources": [
        "src/node/addon.cpp",
        "src/cpp/router/route_matcher.cpp"
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
    }
  ]
}
