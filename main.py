import os
import sys
import time
import socket
import threading
import subprocess
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

def get_game_dir():
    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable)
        if os.path.exists(os.path.join(exe_dir, "game.js")):
            return exe_dir
        parent_dir = os.path.dirname(exe_dir)
        if os.path.exists(os.path.join(parent_dir, "game.js")):
            return parent_dir
        if hasattr(sys, '_MEIPASS'):
            return sys._MEIPASS
        return exe_dir
    return os.path.dirname(os.path.abspath(__file__))

GAME_DIR = get_game_dir()

class NoCacheHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=GAME_DIR, **kwargs)
    def log_message(self, format, *args):
        pass
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]

def launch_window(url):
    try:
        import webview
        class JSApi:
            def __init__(self, win_holder):
                self.win_holder = win_holder
            def toggle_fullscreen(self):
                win = self.win_holder[0]
                if win:
                    win.toggle_fullscreen()

        win_holder = [None]
        api = JSApi(win_holder)
        window = webview.create_window(
            "Jelly Slicer Pro — ASMR 3D",
            url,
            width=1440,
            height=900,
            resizable=True,
            background_color="#1f6f54",
            js_api=api
        )
        win_holder[0] = window
        webview.start()
        return True
    except Exception:
        pass

    candidates = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LocalAppData%\Microsoft\Edge\Application\msedge.exe"),
        os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
    ]
    profile_dir = os.path.join(os.environ.get("TEMP", "."), f"JellySlicerProfile_{int(time.time())}")
    for exe in candidates:
        if os.path.exists(exe):
            proc = subprocess.Popen([
                exe,
                f"--app={url}",
                f"--user-data-dir={profile_dir}",
                "--window-size=1440,900",
                "--disable-http-cache",
                "--disable-features=Translate",
                "--no-first-run"
            ])
            proc.wait()
            return True

    webbrowser.open(url)
    return False

def main():
    os.chdir(GAME_DIR)
    port = find_free_port()
    server = ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{port}/index.html?v={int(time.time())}"
    if not launch_window(url):
        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            pass
    server.shutdown()

if __name__ == "__main__":
    main()
