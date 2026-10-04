"""Start the Shizrah birthday site and open it in the default browser.

Serves the project folder on http://127.0.0.1:8765 with no-cache headers,
so ES module edits appear on refresh. If the same site is already running,
just open it again instead of starting a duplicate server.
"""
import http.server
import socketserver
import urllib.error
import urllib.request
import webbrowser

PORT = 8765
URL = f"http://127.0.0.1:{PORT}/index.html"


def site_is_running():
    try:
        with urllib.request.urlopen(URL, timeout=1.5) as response:
            page = response.read(65536)
        return b"Happy Birthday, Shizrah" in page
    except (urllib.error.URLError, TimeoutError, OSError):
        return False


class Handler(http.server.SimpleHTTPRequestHandler):
    # no-store: preview + hard refresh always fetch fresh modules
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        super().end_headers()

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".ics": "text/calendar; charset=utf-8",
    }

    def log_message(self, fmt, *args):  # quieter default logging
        print("%s - %s" % (self.address_string(), fmt % args))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    if site_is_running():
        print("Birthday website is already running; opening it in your browser.", flush=True)
        webbrowser.open(URL)
    else:
        try:
            # Serves files relative to the current working directory (project root).
            httpd = Server(("127.0.0.1", PORT), Handler)
        except OSError as error:
            if site_is_running():
                print("Birthday website is already running; opening it in your browser.", flush=True)
                webbrowser.open(URL)
            else:
                raise SystemExit(f"Could not start the birthday website on port {PORT}: {error}") from error
        else:
            print("Starting the Shizrah birthday website server...", flush=True)
            print(f"Serving {URL} (no-cache)", flush=True)
            webbrowser.open(URL)
            try:
                httpd.serve_forever()
            except KeyboardInterrupt:
                print("\nBirthday website server stopped.", flush=True)
            finally:
                httpd.server_close()
