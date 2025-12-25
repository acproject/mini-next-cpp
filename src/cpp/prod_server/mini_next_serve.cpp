#include <arpa/inet.h>
#include <netinet/in.h>
#include <sys/socket.h>
#include <unistd.h>

#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <sstream>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

static std::string toLower(std::string s) {
  for (auto &c : s) {
    if (c >= 'A' && c <= 'Z')
      c = (char)(c - 'A' + 'a');
  }
  return s;
}

static bool startsWith(const std::string &s, const std::string &prefix) {
  if (s.size() < prefix.size())
    return false;
  return s.compare(0, prefix.size(), prefix) == 0;
}

static bool endsWith(const std::string &s, const std::string &suffix) {
  if (s.size() < suffix.size())
    return false;
  return s.compare(s.size() - suffix.size(), suffix.size(), suffix) == 0;
}

static std::string guessContentType(const std::string &path) {
  const auto p = toLower(path);
  if (endsWith(p, ".html") || endsWith(p, ".htm"))
    return "text/html; charset=utf-8";
  if (endsWith(p, ".css"))
    return "text/css; charset=utf-8";
  if (endsWith(p, ".js"))
    return "application/javascript; charset=utf-8";
  if (endsWith(p, ".mjs"))
    return "application/javascript; charset=utf-8";
  if (endsWith(p, ".json"))
    return "application/json; charset=utf-8";
  if (endsWith(p, ".svg"))
    return "image/svg+xml";
  if (endsWith(p, ".png"))
    return "image/png";
  if (endsWith(p, ".jpg") || endsWith(p, ".jpeg"))
    return "image/jpeg";
  if (endsWith(p, ".gif"))
    return "image/gif";
  if (endsWith(p, ".ico"))
    return "image/x-icon";
  if (endsWith(p, ".txt"))
    return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

static bool readFile(const std::filesystem::path &p, std::string &out) {
  std::ifstream f(p, std::ios::binary);
  if (!f)
    return false;
  std::ostringstream ss;
  ss << f.rdbuf();
  out = ss.str();
  return true;
}

static std::string urlDecode(const std::string &s) {
  std::string out;
  out.reserve(s.size());
  for (size_t i = 0; i < s.size(); i++) {
    const char c = s[i];
    if (c == '%' && i + 2 < s.size()) {
      const auto hex = s.substr(i + 1, 2);
      char *end = nullptr;
      const long v = std::strtol(hex.c_str(), &end, 16);
      if (end && *end == '\0') {
        out.push_back((char)v);
        i += 2;
        continue;
      }
    }
    if (c == '+') {
      out.push_back(' ');
      continue;
    }
    out.push_back(c);
  }
  return out;
}

static std::string sanitizePath(const std::string &raw) {
  std::string p = raw;
  const auto q = p.find('?');
  if (q != std::string::npos)
    p = p.substr(0, q);
  p = urlDecode(p);
  if (p.empty() || p[0] != '/')
    p = "/" + p;
  while (p.find("//") != std::string::npos) {
    p.replace(p.find("//"), 2, "/");
  }
  if (p.find("..") != std::string::npos)
    return "/";
  return p;
}

static std::string buildResponse(int status, const std::string &statusText,
                                 const std::string &contentType,
                                 const std::string &body) {
  std::ostringstream ss;
  ss << "HTTP/1.1 " << status << " " << statusText << "\r\n";
  ss << "content-type: " << contentType << "\r\n";
  ss << "content-length: " << body.size() << "\r\n";
  ss << "connection: close\r\n";
  ss << "\r\n";
  ss << body;
  return ss.str();
}

static void handleClient(int fd, const std::filesystem::path &rootDir,
                         const std::filesystem::path &publicDir) {
  std::string req;
  req.resize(8192);
  const ssize_t n = ::read(fd, req.data(), req.size());
  if (n <= 0) {
    ::close(fd);
    return;
  }
  req.resize((size_t)n);

  std::istringstream in(req);
  std::string method;
  std::string target;
  std::string version;
  in >> method >> target >> version;

  if (method != "GET" && method != "HEAD") {
    const auto resp =
        buildResponse(405, "Method Not Allowed", "text/plain; charset=utf-8",
                      "Method Not Allowed");
    ::write(fd, resp.data(), resp.size());
    ::close(fd);
    return;
  }

  const auto clean = sanitizePath(target);
  std::filesystem::path candidate;
  bool fromPublic = false;
  if (startsWith(clean, "/public/")) {
    candidate = publicDir / clean.substr(std::string("/public/").size());
    fromPublic = true;
  } else {
    candidate = rootDir / clean.substr(1);
  }

  if (std::filesystem::is_directory(candidate)) {
    candidate = candidate / "index.html";
  }

  std::string body;
  if (!std::filesystem::exists(candidate) ||
      !std::filesystem::is_regular_file(candidate) ||
      !readFile(candidate, body)) {
    std::string fallback;
    const auto fallbackIndex = rootDir / "index.html";
    if (readFile(fallbackIndex, fallback) && clean != "/favicon.ico") {
      const auto resp = buildResponse(200, "OK", "text/html; charset=utf-8",
                                      method == "HEAD" ? "" : fallback);
      ::write(fd, resp.data(), resp.size());
      ::close(fd);
      return;
    }
    const auto resp = buildResponse(404, "Not Found",
                                    "text/plain; charset=utf-8", "Not Found");
    ::write(fd, resp.data(), resp.size());
    ::close(fd);
    return;
  }

  const auto ct = guessContentType(candidate.string());
  const auto resp = buildResponse(200, "OK", ct, method == "HEAD" ? "" : body);
  ::write(fd, resp.data(), resp.size());
  ::close(fd);
  (void)fromPublic;
}

static int parsePort(const char *s) {
  if (!s)
    return 3000;
  try {
    const int p = std::stoi(std::string(s));
    if (p <= 0 || p > 65535)
      return 3000;
    return p;
  } catch (...) {
    return 3000;
  }
}

int main(int argc, char **argv) {
  std::filesystem::path dir = std::filesystem::current_path();
  int port = 3000;

  for (int i = 1; i < argc; i++) {
    const std::string a = argv[i] ? std::string(argv[i]) : std::string();
    if (a == "--dir" && i + 1 < argc) {
      dir = std::filesystem::path(argv[++i]);
      continue;
    }
    if (a == "--port" && i + 1 < argc) {
      port = parsePort(argv[++i]);
      continue;
    }
    if (a == "-h" || a == "--help") {
      std::fprintf(stdout,
                   "Usage: mini-next-serve --dir <staticDir> --port <port>\n");
      std::fflush(stdout);
      return 0;
    }
  }

  const auto rootDir = std::filesystem::absolute(dir);
  const auto publicDir = rootDir / "public";

  const int serverFd = ::socket(AF_INET, SOCK_STREAM, 0);
  if (serverFd < 0) {
    std::perror("socket");
    return 2;
  }

  int opt = 1;
  ::setsockopt(serverFd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_addr.s_addr = htonl(INADDR_ANY);
  addr.sin_port = htons((uint16_t)port);

  if (::bind(serverFd, (sockaddr *)&addr, sizeof(addr)) != 0) {
    std::perror("bind");
    ::close(serverFd);
    return 3;
  }

  if (::listen(serverFd, 128) != 0) {
    std::perror("listen");
    ::close(serverFd);
    return 4;
  }

  std::fprintf(stdout, "mini-next-serve listening on http://localhost:%d\n",
               port);
  std::fprintf(stdout, "dir: %s\n", rootDir.string().c_str());
  std::fflush(stdout);

  while (true) {
    sockaddr_in client{};
    socklen_t len = sizeof(client);
    const int fd = ::accept(serverFd, (sockaddr *)&client, &len);
    if (fd < 0) {
      if (errno == EINTR)
        continue;
      std::perror("accept");
      break;
    }

    std::thread t(
        [fd, rootDir, publicDir]() { handleClient(fd, rootDir, publicDir); });
    t.detach();
  }

  ::close(serverFd);
  return 0;
}
