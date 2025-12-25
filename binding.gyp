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
        "src/cpp/cli/mn.cpp",
        "third_party/ftxui/src/ftxui/component/animation.cpp",
        "third_party/ftxui/src/ftxui/component/button.cpp",
        "third_party/ftxui/src/ftxui/component/catch_event.cpp",
        "third_party/ftxui/src/ftxui/component/checkbox.cpp",
        "third_party/ftxui/src/ftxui/component/collapsible.cpp",
        "third_party/ftxui/src/ftxui/component/component.cpp",
        "third_party/ftxui/src/ftxui/component/component_options.cpp",
        "third_party/ftxui/src/ftxui/component/container.cpp",
        "third_party/ftxui/src/ftxui/component/dropdown.cpp",
        "third_party/ftxui/src/ftxui/component/event.cpp",
        "third_party/ftxui/src/ftxui/component/hoverable.cpp",
        "third_party/ftxui/src/ftxui/component/input.cpp",
        "third_party/ftxui/src/ftxui/component/loop.cpp",
        "third_party/ftxui/src/ftxui/component/maybe.cpp",
        "third_party/ftxui/src/ftxui/component/menu.cpp",
        "third_party/ftxui/src/ftxui/component/modal.cpp",
        "third_party/ftxui/src/ftxui/component/radiobox.cpp",
        "third_party/ftxui/src/ftxui/component/renderer.cpp",
        "third_party/ftxui/src/ftxui/component/resizable_split.cpp",
        "third_party/ftxui/src/ftxui/component/screen_interactive.cpp",
        "third_party/ftxui/src/ftxui/component/slider.cpp",
        "third_party/ftxui/src/ftxui/component/terminal_input_parser.cpp",
        "third_party/ftxui/src/ftxui/component/util.cpp",
        "third_party/ftxui/src/ftxui/component/window.cpp",
        "third_party/ftxui/src/ftxui/dom/automerge.cpp",
        "third_party/ftxui/src/ftxui/dom/blink.cpp",
        "third_party/ftxui/src/ftxui/dom/bold.cpp",
        "third_party/ftxui/src/ftxui/dom/border.cpp",
        "third_party/ftxui/src/ftxui/dom/box_helper.cpp",
        "third_party/ftxui/src/ftxui/dom/canvas.cpp",
        "third_party/ftxui/src/ftxui/dom/clear_under.cpp",
        "third_party/ftxui/src/ftxui/dom/color.cpp",
        "third_party/ftxui/src/ftxui/dom/composite_decorator.cpp",
        "third_party/ftxui/src/ftxui/dom/dbox.cpp",
        "third_party/ftxui/src/ftxui/dom/dim.cpp",
        "third_party/ftxui/src/ftxui/dom/flex.cpp",
        "third_party/ftxui/src/ftxui/dom/flexbox.cpp",
        "third_party/ftxui/src/ftxui/dom/flexbox_config.cpp",
        "third_party/ftxui/src/ftxui/dom/flexbox_helper.cpp",
        "third_party/ftxui/src/ftxui/dom/focus.cpp",
        "third_party/ftxui/src/ftxui/dom/frame.cpp",
        "third_party/ftxui/src/ftxui/dom/gauge.cpp",
        "third_party/ftxui/src/ftxui/dom/graph.cpp",
        "third_party/ftxui/src/ftxui/dom/gridbox.cpp",
        "third_party/ftxui/src/ftxui/dom/hbox.cpp",
        "third_party/ftxui/src/ftxui/dom/hyperlink.cpp",
        "third_party/ftxui/src/ftxui/dom/inverted.cpp",
        "third_party/ftxui/src/ftxui/dom/linear_gradient.cpp",
        "third_party/ftxui/src/ftxui/dom/node.cpp",
        "third_party/ftxui/src/ftxui/dom/node_decorator.cpp",
        "third_party/ftxui/src/ftxui/dom/paragraph.cpp",
        "third_party/ftxui/src/ftxui/dom/reflect.cpp",
        "third_party/ftxui/src/ftxui/dom/scroll_indicator.cpp",
        "third_party/ftxui/src/ftxui/dom/separator.cpp",
        "third_party/ftxui/src/ftxui/dom/size.cpp",
        "third_party/ftxui/src/ftxui/dom/spinner.cpp",
        "third_party/ftxui/src/ftxui/dom/strikethrough.cpp",
        "third_party/ftxui/src/ftxui/dom/table.cpp",
        "third_party/ftxui/src/ftxui/dom/text.cpp",
        "third_party/ftxui/src/ftxui/dom/underlined.cpp",
        "third_party/ftxui/src/ftxui/dom/underlined_double.cpp",
        "third_party/ftxui/src/ftxui/dom/util.cpp",
        "third_party/ftxui/src/ftxui/dom/vbox.cpp",
        "third_party/ftxui/src/ftxui/screen/box.cpp",
        "third_party/ftxui/src/ftxui/screen/color.cpp",
        "third_party/ftxui/src/ftxui/screen/color_info.cpp",
        "third_party/ftxui/src/ftxui/screen/screen.cpp",
        "third_party/ftxui/src/ftxui/screen/string.cpp",
        "third_party/ftxui/src/ftxui/screen/terminal.cpp"
      ],
      "include_dirs": [
        "third_party/ftxui/include",
        "third_party/ftxui/src"
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
