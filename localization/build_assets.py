#!/usr/bin/env python3
"""Rebuild pinned v1.0.4 frontend assets; never touches Core or user data."""
from pathlib import Path
import hashlib
import subprocess
import sys
ROOT = Path(__file__).resolve().parent
subprocess.run([sys.executable, str(ROOT/'build_html.py')], check=True)
subprocess.run([sys.executable, str(ROOT/'build_js.py')], check=True)
css = (ROOT/'upstream/app.css').read_bytes()
assert hashlib.sha256(css).hexdigest() == '4d4410ed45f0c1aebf75a9f151a60ac85dd5d454acf7be7672c5c1c6006fe012'
icon = (ROOT/'upstream/icon.png').read_bytes()
assert hashlib.sha256(icon).hexdigest() == 'ca9f5858db9bb5b969b79cda78b852f561dde863ca258867f7ec66bb13f17bd2'
# Keep the original responsive layout and provide system Chinese fonts, no CDN.
css += b'\n/* zh-CN: system fonts only; no external font requests. */\n'
css += ':root { --sans: "Inter", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, -apple-system, sans-serif; }\nhtml[lang="zh-CN"] .eyebrow, html[lang="zh-CN"] .kpi-label { letter-spacing: .02em; }\n'.encode()
(ROOT/'web/app.css').write_bytes(css)
(ROOT/'web/icon.png').write_bytes(icon)
subprocess.run(['node','--check',str(ROOT/'web/app.js')], check=True)
print('中文面板构建完成：4 个静态资源；Core 二进制和账号目录未修改。')
