"""本地静态服务器（禁用缓存，供开发时热改文件立即生效）

用法: powershell -ExecutionPolicy Bypass -File server/serve.ps1 [-Port 8123]

根路径默认给开发版 index-dev.html —— 它外链 src/ 下的模块，改了立刻生效。
打包版 index.html 也能访问，但它是构建产物，改 src/ 后必须重新打包才会更新。
"""

import http.server
import os
import socketserver
import sys
from functools import partial

DEV_PAGE = "/index-dev.html"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # 只把「根路径」导向开发版：默认目录索引会命中 index.html（打包版），
        # 那样改完 src/ 会看不到效果。显式的 /index.html 保持原样，不去改写它，
        # 否则打包版就没法通过服务器访问了。
        if self.path in ("/", ""):
            self.path = DEV_PAGE
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    socketserver.TCPServer.allow_reuse_address = True
    handler = partial(NoCacheHandler, directory=root)
    with socketserver.ThreadingTCPServer(("127.0.0.1", port), handler) as httpd:
        print("serving %s" % root)
        print("  开发版（改 src/ 立即生效）  http://127.0.0.1:%d/" % port)
        print("  打包版（需先重新打包）      http://127.0.0.1:%d/index.html" % port)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
