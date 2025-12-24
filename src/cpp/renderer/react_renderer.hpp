#pragma once

#include <node_api.h>

#include <string>

namespace mini_next {

std::string reactRenderToString(napi_env env, const std::string &modulePath,
                               const std::string &propsJson);

} // namespace mini_next
