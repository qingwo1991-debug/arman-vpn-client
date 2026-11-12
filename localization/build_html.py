#!/usr/bin/env python3
"""Build the zh-CN static dashboard from the checksum-pinned v1.0.4 asset.

Only text nodes and explicitly localizable attributes may change. Existing
markup, form attributes, JavaScript hooks, SVG, URLs, and asset paths stay intact.
This script reads only the public upstream HTML and its generated HTML output;
it never opens application configuration, credentials, or core-data.
"""
from __future__ import annotations

from collections import Counter
from hashlib import sha256
from html import escape, unescape
from html.parser import HTMLParser
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "upstream" / "index.html"
OUTPUT = ROOT / "web" / "index.html"
EXPECTED_SHA256 = "aa4e677348abc60209663331f6b19b7a2bba387d21b4d7ce4a958ed52f399aa0"
LOCALIZABLE_ATTRIBUTES = frozenset({"title", "placeholder", "aria-label", "alt"})
PROTECTED_TAGS = frozenset({"script", "style", "svg"})
VOID_TAGS = frozenset({
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
})

# Exact whole-text-node matches only: these strings can never change an enum,
# form name, selector, URL, script, stylesheet, or SVG attribute.
TEXT = {
    "Sign in to the proxy console.": "登录代理控制台。",
    "Username": "用户名",
    "Password": "密码",
    "Sign in": "登录",
    "Proxy console": "代理控制台",
    "Overview": "概览",
    "Servers": "服务器",
    "Accounts": "账号",
    "Logs": "日志",
    "Settings": "设置",
    "Help": "帮助",
    "Status": "状态",
    "Test connection": "测试连接",
    "Restart": "重启",
    "Turn off": "关闭",
    "Active account": "当前账号",
    "Latency": "延迟",
    "Run a connection test": "请先测试连接",
    "Speed": "速度",
    "Uptime": "运行时间",
    "Manage": "管理",
    "Connection test": "连接测试",
    "Sends an HTTPS request through the tunnel and times each stage.": "通过隧道发送 HTTPS 请求，并测量各阶段的耗时。",
    "Proxy": "代理",
    "Recent activity": "最近活动",
    "All logs": "全部日志",
    "Add account": "添加账号",
    "Server selection": "服务器选择",
    "Auto (recommended)": "自动（推荐）",
    "Auto (fastest)": "自动（最快）",
    "Real delay": "实际延迟",
    "Name": "名称",
    "Test real delay": "测试实际延迟",
    "Server": "服务器",
    "Address": "地址",
    "All levels": "所有级别",
    "Info and above": "信息及以上",
    "Warnings and errors": "警告和错误",
    "Errors only": "仅错误",
    "Follow": "自动滚动",
    "Clear view": "清空视图",
    "Dashboard": "控制台",
    "Connection": "连接",
    "Local proxy": "本地代理",
    "Routing": "分流",
    "Advanced": "高级",
    "Access": "访问范围",
    "All networks: open it from other devices; set a login": "所有网络：允许其他设备访问；请设置登录凭据",
    "This device only (127.0.0.1)": "仅本机（127.0.0.1）",
    "All networks (0.0.0.0)": "所有网络（0.0.0.0）",
    "Port": "端口",
    "Login": "登录凭据",
    "A username and a password (at least 6 characters) require a login": "设置用户名和密码（至少 6 个字符）后，访问时需要登录",
    "An empty username removes the login": "用户名留空将取消登录验证",
    "An empty password keeps the current one": "密码留空将保留当前密码",
    "How this program reaches Mozilla, and where the traffic leaves from.": "设置本程序连接 Mozilla 的方式，以及流量的出口位置。",
    "Location": "地区",
    "Auto: Mozilla's recommended location": "自动：使用 Mozilla 推荐的地区",
    "Fastest: the lowest delay, chosen at each start": "最快：每次启动时选择延迟最低的地区",
    "Server address": "服务器地址",
    "host:port of a Mozilla proxy server": "Mozilla 代理服务器的地址，格式为 host:port",
    "Protocol": "协议",
    "Pause when unused": "闲置时暂停",
    "No traffic for this long: the connection to Mozilla closes and the account rests": "无流量达到此时长后，断开与 Mozilla 的连接，让账号休眠",
    "The next connection wakes it in a few seconds": "下次连接时会在几秒内唤醒",
    "Never": "从不",
    "After 5 minutes": "5 分钟后",
    "After 15 minutes": "15 分钟后",
    "After 30 minutes": "30 分钟后",
    "After 1 hour": "1 小时后",
    "Where applications connect: one port for SOCKS5 and HTTP.": "应用连接的入口：同一端口同时支持 SOCKS5 和 HTTP。",
    "Mode": "模式",
    "System proxy: Windows and most applications go through the VPN": "系统代理：让 Windows 和大多数应用通过 VPN 连接",
    "Proxy only": "仅提供代理",
    "System proxy": "系统代理",
    "All networks: other devices, or a VPS's clients, can use it too": "所有网络：其他设备或 VPS 的客户端也可以使用",
    "Optional: set both, or neither": "可选：用户名和密码须同时设置，或都不设置",
    "Open to the network without one, anyone who finds the port can use it": "向网络开放但未设置凭据时，任何发现此端口的人都可以使用",
    "How this program finds Mozilla's servers. Sites opened through the VPN are looked up by Mozilla's exit, never here.": "设置本程序如何解析 Mozilla 服务器的地址。通过 VPN 访问的网站由 Mozilla 出口解析，不在本机解析。",
    "Encrypted DNS avoids wrong answers on filtered networks": "加密 DNS 可避免受过滤网络返回错误的解析结果",
    "Automatic (Cloudflare, Google, Quad9)": "自动（Cloudflare、Google、Quad9）",
    "System DNS": "系统 DNS",
    "Custom…": "自定义…",
    "Custom servers": "自定义服务器",
    "One per line: https://host/dns-query, tls://host, or an IP address": "每行一个：https://host/dns-query、tls://host 或 IP 地址",
    "Fall back to the system DNS": "回退到系统 DNS",
    "When these servers do not answer": "当这些服务器无响应时使用",
    "Test": "测试",
    "Looks up Mozilla's addresses with the servers above and with the system DNS": "分别使用上述服务器和系统 DNS 解析 Mozilla 的地址",
    "Filtered: the network tampers with DNS": "受过滤：网络正在篡改 DNS 解析结果",
    "Test DNS": "测试 DNS",
    "Sends chosen sites straight through your own internet instead of Mozilla: they open faster and use no quota.": "让指定网站通过您自己的网络直连，而不经过 Mozilla：访问更快，也不消耗流量额度。",
    "Country": "国家或地区",
    "Its sites and addresses go directly": "该地区的网站和 IP 地址将直连",
    "Iran": "伊朗",
    "China": "中国",
    "Russia": "俄罗斯",
    "Afghanistan": "阿富汗",
    "Turkey": "土耳其",
    "Indonesia": "印度尼西亚",
    "Brazil": "巴西",
    "None (only private networks)": "无（仅私有网络）",
    "Use routing": "启用分流",
    "Block ads": "拦截广告",
    "Adds geosite:category-ads-all to the Block list": "将 geosite:category-ads-all 添加到拦截列表",
    "Rules": "规则",
    "Direct": "直连",
    "Sites and addresses in this list open without the VPN": "列表中的网站和 IP 地址不通过 VPN 访问",
    "The chosen country's rules are already here: add, change, or remove lines": "已填入所选地区的规则，可添加、修改或删除条目",
    "Choosing another country replaces them": "选择其他地区会替换这些规则",
    "Restore the country's rules": "恢复所选地区的规则",
    "Block": "拦截",
    "Sites and addresses in this list do not open at all, neither directly nor through the VPN": "列表中的网站和 IP 地址将被完全拦截，既不直连，也不通过 VPN 访问",
    "How to write a rule": "规则写法",
    "The site and its subdomains": "该域名及其所有子域名",
    "Exactly this name": "仅匹配此完整域名",
    "Names that contain the word": "包含该关键词的域名",
    "Names that match the expression": "匹配该正则表达式的域名",
    "Sites of a tag in the geo files": "地理数据文件中指定标签下的网站",
    "Addresses of a country in the geo files": "地理数据文件中指定国家或地区的 IP 地址",
    "A tag in another geo file": "另一个地理数据文件中的标签",
    "An address or a network": "IP 地址或网段",
    "Look up names for IP rules": "为 IP 规则解析域名",
    "Applies the IP rules to sites no name rule matched (an encrypted lookup through Mozilla)": "对未匹配域名规则的网站应用 IP 规则（通过 Mozilla 加密解析）",
    "Geo files": "地理数据文件",
    "Source": "来源",
    "Both cover every country": "两种来源均涵盖所有国家和地区",
    "By hand (the URLs below)": "手动（使用下方网址）",
    "Update every": "更新间隔",
    "days": "天",
    "File URLs": "文件网址",
    "Sites (geosite.dat)": "网站（geosite.dat）",
    "Addresses (geoip.dat)": "IP 地址（geoip.dat）",
    "Files": "文件",
    "Update now": "立即更新",
    "Test a destination": "测试目标地址",
    "A name, an address, or a URL: where it goes and which rule decides, with the saved rules": "输入域名、IP 地址或网址，按已保存的规则查看其访问方式及匹配的规则",
    "Switch accounts at": "账号切换阈值",
    "The next account takes over when the active one has used this share of its data, without dropping connections": "当前账号已用流量达到此比例时，由下一个账号接替，现有连接不会中断",
    "The defaults suit almost everyone.": "默认设置适合绝大多数用户。",
    "Log destinations": "记录访问目标",
    "Writes every site opened to the log (privacy sensitive)": "将每个访问的网站写入日志（涉及隐私）",
    "Connections to Mozilla": "与 Mozilla 的连接数",
    "Each device stays on one connection, so more only helps when several devices share the proxy": "每台设备固定使用一个连接，因此仅在多台设备共享代理时，增加连接数才有帮助",
    "Most connections at once": "最大并发连接数",
    "From applications to this proxy; 0 = no limit": "应用到本代理的连接数；0 表示不限制",
    "Unsaved changes": "有未保存的更改",
    "Discard": "放弃更改",
    "Save": "保存",
    "Connecting applications": "连接应用",
    "Any application that can use a SOCKS5 or HTTP proxy can use this one: v2rayN, v2rayNG, NekoBox, a browser, Telegram, and others. Their traffic to any website goes through Mozilla's VPN servers; it is not limited to Mozilla. The same address serves SOCKS5 and HTTP proxy clients.": "任何支持 SOCKS5 或 HTTP 代理的应用都可以使用本代理，例如 v2rayN、v2rayNG、NekoBox、浏览器和 Telegram 等。它们访问任何网站的流量都会经过 Mozilla 的 VPN 服务器，并不限于访问 Mozilla 网站。同一地址同时支持 SOCKS5 和 HTTP 代理客户端。",
    "SOCKS5 address": "SOCKS5 地址",
    "Copy": "复制",
    "Link for v2rayN, v2rayNG, NekoBox": "适用于 v2rayN、v2rayNG、NekoBox 的链接",
    "v2rayN, v2rayNG, NekoBox: copy the link and import it from the clipboard, or add a SOCKS server with the address above.": "v2rayN、v2rayNG、NekoBox：复制链接后从剪贴板导入，或使用上述地址添加 SOCKS 服务器。",
    "Another device, such as a phone: set the SOCKS5 listen address to": "在手机等其他设备上使用：在设置中将 SOCKS5 监听地址设为",
    "and a SOCKS5 username and password in Settings, then use this computer's network address instead of": "，并设置 SOCKS5 用户名和密码，然后使用本机的网络地址代替",
    ".": "。",
    "Mozilla's proxy connects to the web ports": "Mozilla 的代理仅允许连接以下网页端口：",
    "80, 443, 8080, and 8443": "80、443、8080 和 8443",
    "only. Every other port is refused by Mozilla's server, for example": "。Mozilla 服务器会拒绝其他所有端口，例如",
    ", SSH (22), or mail (25, 465, 587, 993). This program cannot change that, with two exceptions: git over SSH to GitHub goes to GitHub's SSH server on port 443 by itself, and DNS (53) sent through the proxy is answered by this program, with DNS over HTTPS through Mozilla.": "、SSH（22）或邮件服务（25、465、587、993）。本程序无法改变这一限制，但有两种例外：通过 SSH 连接 GitHub 的 git 请求会自动改用 GitHub SSH 服务器的 443 端口；发送到代理的 DNS（53）请求则由本程序通过 Mozilla 使用 DNS over HTTPS 解析并响应。",
    "Serve your own site on one of the four ports (8080 and 8443 are the usual choices).": "将您自己的网站部署在上述四个端口之一（通常选择 8080 或 8443）。",
    "Or let the browser reach that address directly: Firefox, Settings, Network Settings,": "或让浏览器直接访问该地址：Firefox → 设置 → 网络设置 →",
    "No proxy for": "不使用代理的地址",
    "The program's own connections come back to it": "本程序的连接被转回自身（代理回环）",
    "Your country's sites directly (routing)": "本国或本地区网站直连（分流）",
    "Optional, in Settings, Routing. The sites and networks of the chosen region (Iran by default; also China, Russia, Afghanistan, Turkey, Indonesia, or Brazil) then go directly through your own internet: faster, not refused for a foreign address, and without using the accounts' quota; everything else still goes through Mozilla. The lists of domains and networks are downloaded by themselves every 10 days. A site reached directly sees your real address.": "可在“设置 → 分流”中按需启用。所选地区（默认为伊朗，也支持中国、俄罗斯、阿富汗、土耳其、印度尼西亚和巴西）的网站和网段将通过您自己的网络直连：访问更快，不会因境外 IP 地址而遭到拒绝，也不消耗账号的流量额度；其他流量仍通过 Mozilla。域名和网段列表每 10 天自动下载更新。直连网站可以看到您的真实 IP 地址。",
    "The Logs page shows the live log. The files are in the data folder's": "“日志”页面显示实时日志。日志文件位于数据目录下的",
    "folder, one per day, kept for seven days.": "文件夹中，每天一个文件，保留七天。",
    "Add Firefox Account": "添加 Firefox 账号",
    "The account joins the rotation at the end of the list.": "该账号将添加到列表末尾并参与轮换。",
    "This dashboard is not on this computer. The Firefox Account password is sent over the network without encryption.": "此控制台不在本机上。Firefox 账号密码将在网络上以未加密的方式发送。",
    "Email": "电子邮箱",
    "Code": "验证码",
    "Cancel": "取消",
    # v1.0.18 additions and rewording.
    "Create account": "创建账号",
    "Save a backup": "保存备份",
    "Import a backup": "导入备份",
    "Log": "日志",
    "Connections": "连接",
    "Clear": "清空",
    "Time": "时间",
    "Destination": "目标",
    "Rule": "规则",
    "Traffic": "流量",
    "Duration": "时长",
    "No connections yet.": "暂无连接。",
    "If Mozilla is blocked": "当 Mozilla 被封锁时",
    "TLS fragmentation": "TLS 分片",
    "Upstream proxy": "上游代理",
    "HTTP/3 falls back to HTTP/2 where QUIC is blocked; HTTP/1.1 opens a TLS connection per site connection, for networks that slow or cut long connections": "QUIC 受阻时，HTTP/3 会回退到 HTTP/2；HTTP/1.1 会为每个网站连接单独建立一条 TLS 连接，适合会限速或中断长连接的网络",
    "IP version": "IP 版本",
    "The connection to Mozilla's servers only": "仅用于连接 Mozilla 的服务器",
    "Auto (IPv4, then IPv6)": "自动（先 IPv4，再 IPv6）",
    "Both at once (dual-stack)": "同时使用（双栈）",
    "IPv6 first, then IPv4": "先 IPv6，再 IPv4",
    "IPv4 only": "仅 IPv4",
    "IPv6 only": "仅 IPv6",
    "Shared relay": "共享中继",
    "Use the app's shared relays if Mozilla blocks your region. An enabled personal relay takes priority.": "如果 Mozilla 封锁了您所在的地区，可使用应用内置的共享中继。已启用的个人中继优先。",
    "Personal relay": "个人中继",
    "Turning this off keeps your address and does not disable shared relays.": "关闭后仍会保留已填写的地址，且不会停用共享中继。",
    "Relay server": "中继服务器",
    "Your own Cloudflare Worker, or relay.php on your own host.": "您自己的 Cloudflare Worker，或自建主机上的 relay.php。",
    "Used only when Mozilla doesn't answer directly: the sign-in, accounts, and server list go through it, not the VPN traffic.": "仅在无法直连 Mozilla 时使用：登录、账号和服务器列表经由它转发，VPN 流量不经过它。",
    "Relay health": "中继可用性",
    "Test the entered address without saving it or enabling the relay.": "测试已填写的地址，不会保存，也不会启用中继。",
    "Test relay health": "测试中继可用性",
    "Fragmentation": "分片方式",
    "Off: Normal TLS connection": "关闭：常规 TLS 连接",
    "First byte: Splits the TLS header at the first byte (0x16)": "首字节：在首字节（0x16）处拆分 TLS 头",
    "Server name (SNI): Splits the server name (SNI) across TCP packets": "服务器名称（SNI）：将服务器名称（SNI）拆分到多个 TCP 数据包",
    "Off": "关闭",
    "First byte": "首字节",
    "Server name (SNI)": "服务器名称（SNI）",
    "TLS record": "TLS 记录",
    "Use the upstream proxy": "使用上游代理",
    "The connection to Mozilla goes through this proxy, for networks that block or slow Mozilla.": "与 Mozilla 的连接将通过此代理，适用于封锁或限速 Mozilla 的网络。",
    "If the proxy runs on this device, leave it out of the VPN.": "如果代理运行在本机，请将其排除在 VPN 之外。",
    "SOCKS5 proxy address": "SOCKS5 代理地址",
    "Optional: set both, or neither.": "可选：用户名和密码须同时填写，或都不填写。",
    "TCP: ports 80, 443, 8080, and 8443": "TCP：端口 80、443、8080 和 8443",
    "UDP: ports 80, 443, 3478, 8080, 8443, and 49152-65534": "UDP：端口 80、443、3478、8080、8443 和 49152-65534",
    "Calls and online games on other UDP ports do not work through this proxy. In the VPN, QUIC (UDP to port 443) is turned away on purpose: browsers use HTTP/2 over TCP instead.": "其他 UDP 端口的通话和在线游戏无法通过此代理使用。在 VPN 中，QUIC（UDP 443 端口）会被有意拒绝：浏览器会改用基于 TCP 的 HTTP/2。",
    "Another program sends this program's own traffic into its proxy, so it cannot reach Mozilla and nothing connects. In PassWall2 on a router, turn Localhost Proxy off. In another VPN program's TUN mode (v2rayN, Clash, sing-box), let arman-vpn-core connect directly, with a process rule.": "其他程序将本程序自身的流量又转入本代理，导致无法连接 Mozilla，所有连接都失败。在路由器的 PassWall2 中，请关闭本机代理（Localhost Proxy）。若使用其他 VPN 程序的 TUN 模式（v2rayN、Clash、sing-box），请添加进程规则，让 arman-vpn-core 直连。",
    "Don't have a Firefox Account?": "还没有 Firefox 账号？",
    "Create one": "创建一个",
    "The password is saved encrypted in the data folder for when you choose Sign in again.": "密码会加密保存在数据目录中，供您选择「重新登录」时使用。",
    "Relay health test": "中继可用性测试",
    "Checks only the relay. No Mozilla request or account information is sent.": "仅检查中继，不会向 Mozilla 发送请求，也不会上传账号信息。",
    "Testing…": "测试中…",
    "Copy report": "复制报告",
    "Retry": "重试",
    "Close": "关闭",
}

ATTRIBUTE_TEXT = {
    "Open the menu": "打开菜单",
    "Close the menu": "关闭菜单",
    "Program version": "程序版本",
    "Switch between dark and light": "切换深色与浅色主题",
    "Sign out": "退出登录",
    "Off: the proxy port closes and nothing connects to Mozilla until it is turned on again (here or in the app)": "关闭：代理端口将关闭，不再连接 Mozilla，直到再次在此处或应用中开启",
    "Sort": "排序",
    "Search servers": "搜索服务器",
    "Filter text": "筛选文本",
    "Username": "用户名",
    "Dashboard username": "控制台用户名",
    "New password": "新密码",
    "New dashboard password": "控制台新密码",
    "Protocol": "协议",
    "Mode": "模式",
    "Proxy username": "代理用户名",
    "Password": "密码",
    "Proxy password": "代理密码",
    "Destination": "目标地址",
    "CAPTCHA": "图形验证码",
    # v1.0.18 additions.
    "More": "更多",
    "Log or connections": "日志或连接",
    "Filter destinations": "筛选目标",
    "Upstream proxy username": "上游代理用户名",
    "Upstream proxy password": "上游代理密码",
}

# Brands, protocol labels, filenames, and copyable/configuration examples are
# intentionally not translated. Every non-Chinese English node must match one
# of these explicit allowances; newly introduced English fails the build.
PRESERVED_TEXT = frozenset({
    "Arman VPN", "GitHub", "HTTP/1.1", "Firefox VPN", "DNS", "HTTP/2", "HTTP/3",
    "Cloudflare, HTTPS (1.1.1.1)", "Google, HTTPS (8.8.8.8)",
    "Quad9, HTTPS (9.9.9.9)", "Cloudflare, TLS (1.1.1.1:853)",
    "domain:example.com", "full:www.example.com", "keyword:bank", r"regexp:\.ir$",
    "geosite:ir", "geoip:ir", "ext:iran.dat:ir", "logs",
    "socks://Og@127.0.0.1:10810", "http://203.0.113.5:9898/",
})
PRESERVED_ATTRIBUTES = frozenset({
    "127.0.0.1", "1080", "https://relay.NAME.workers.dev/?secret=…",
    "host:443", "https://1.1.1.1/dns-query\ntls://9.9.9.9\n8.8.8.8",
    "domain:example.com\n192.0.2.0/24", "domain:example.com", "digikala.com",
    "https://relay.NAME.workers.dev/?key=…",
})


def require(condition: bool, message: str) -> None:
    """Do not silently disable validation under python -O."""
    if not condition:
        raise AssertionError(message)


class Localizer(HTMLParser):
    def __init__(self, source: str):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.line_starts = [0]
        for match in re.finditer("\n", source):
            self.line_starts.append(match.end())
        self.stack: list[str] = []
        self.patches: list[tuple[int, int, str]] = []
        self.text_count = 0
        self.attribute_count = 0
        self.title_count = 0
        self.language_count = 0
        self.seen_text: set[str] = set()
        self.seen_attributes: set[str] = set()
        self.preserved_text: Counter[str] = Counter()
        self.preserved_attributes: Counter[str] = Counter()

    def position(self) -> int:
        line, column = self.getpos()
        return self.line_starts[line - 1] + column

    def process_start(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in PROTECTED_TAGS or any(t in PROTECTED_TAGS for t in self.stack):
            return
        raw = self.get_starttag_text()
        offset = self.position()
        for key, value in attrs:
            if tag == "html" and key == "lang":
                require(value == "en", "Unexpected upstream language")
                translated = "zh-CN"
                self.language_count += 1
            elif key in LOCALIZABLE_ATTRIBUTES and value:
                if value in ATTRIBUTE_TEXT:
                    translated = ATTRIBUTE_TEXT[value]
                    self.seen_attributes.add(value)
                    self.attribute_count += 1
                else:
                    require(value in PRESERVED_ATTRIBUTES,
                            f"Unmapped {key} attribute at line {self.getpos()[0]}: {value!r}")
                    self.preserved_attributes[value] += 1
                    continue
            else:
                continue
            # Locate just this quoted attribute's value inside this specific
            # parsed start tag. Do not serialize or replace the whole document.
            pattern = re.compile(
                r"\s" + re.escape(key) + r"\s*=\s*(?P<quote>[\"'])(?P<value>.*?)(?P=quote)",
                re.DOTALL | re.IGNORECASE,
            )
            matches = list(pattern.finditer(raw))
            require(len(matches) == 1, f"Expected exactly one {key} attribute on {tag}")
            match = matches[0]
            require(unescape(match.group("value")) == value, "Attribute parsing mismatch")
            self.patches.append((offset + match.start("value"), offset + match.end("value"),
                                 escape(translated, quote=True)))

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.process_start(tag, attrs)
        if tag not in VOID_TAGS:
            self.stack.append(tag)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.process_start(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        require(bool(self.stack) and self.stack[-1] == tag,
                f"Unexpected closing tag {tag} at line {self.getpos()[0]}")
        self.stack.pop()

    def handle_data(self, data: str) -> None:
        if any(tag in PROTECTED_TAGS for tag in self.stack):
            return
        text = data.strip()
        if not text:
            return
        if self.stack and self.stack[-1] == "title":
            require(text == "Arman VPN", "Unexpected upstream page title")
            translated = "Arman VPN 代理控制台"
            self.title_count += 1
        elif text in TEXT:
            translated = TEXT[text]
            self.seen_text.add(text)
        else:
            require(not re.search(r"[A-Za-z]", text) or text in PRESERVED_TEXT,
                    f"Unmapped visible text at line {self.getpos()[0]}: {text!r}")
            if re.search(r"[A-Za-z]", text):
                self.preserved_text[text] += 1
            return
        start = self.position() + len(data) - len(data.lstrip())
        end = self.position() + len(data.rstrip())
        self.patches.append((start, end, escape(translated, quote=False)))
        self.text_count += 1

    def result(self) -> str:
        self.feed(self.source)
        self.close()
        require(not self.stack, "Unclosed upstream tags")
        require(self.language_count == 1 and self.title_count == 1,
                "Expected one document language and page title")
        require(self.seen_text == set(TEXT), "Unused text translation entries")
        require(self.seen_attributes == set(ATTRIBUTE_TEXT), "Unused attribute translation entries")
        patches = sorted(self.patches)
        require(all(a[1] <= b[0] for a, b in zip(patches, patches[1:])),
                "Overlapping localization patches")
        result = self.source
        for start, end, replacement in reversed(patches):
            result = result[:start] + replacement + result[end:]
        return result


class Structure(HTMLParser):
    """Collect immutable structure and readable leftover-English inventory."""
    def __init__(self, source: str):
        super().__init__(convert_charrefs=False)
        self.events: list[tuple] = []
        self.ids: list[str] = []
        self.names: list[str] = []
        self.values: list[str] = []
        self.hrefs: list[str] = []
        self.external_hrefs: list[str] = []
        self.localized_attributes: list[tuple[str, str, str | None]] = []
        self.english: Counter[str] = Counter()
        self.stack: list[str] = []
        self.language: str | None = None
        self.title = ""
        self.feed(source)
        self.close()
        require(not self.stack, "Unclosed HTML in structural check")

    def start(self, tag: str, attrs: list[tuple[str, str | None]], self_closing: bool) -> None:
        protected = tag in PROTECTED_TAGS or any(t in PROTECTED_TAGS for t in self.stack)
        immutable = []
        for key, value in attrs:
            if key == "id":
                self.ids.append(value)
            if key == "name":
                self.names.append(value)
            if key == "value":
                self.values.append(value)
            if key == "href":
                self.hrefs.append(value)
                if value and re.match(r"(?:https?:)?//", value):
                    self.external_hrefs.append(value)
            if tag == "html" and key == "lang":
                self.language = value
            elif not protected and key in LOCALIZABLE_ATTRIBUTES:
                self.localized_attributes.append((tag, key, value))
                if value and re.search(r"[A-Za-z]", value) and not re.search(r"[\u3400-\u9fff]", value):
                    self.english[value] += 1
            else:
                immutable.append((key, value))
        self.events.append(("empty" if self_closing else "start", tag, immutable))
        if not self_closing and tag not in VOID_TAGS:
            self.stack.append(tag)

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.start(tag, attrs, False)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.start(tag, attrs, True)

    def handle_endtag(self, tag: str) -> None:
        require(bool(self.stack) and self.stack[-1] == tag, "Changed HTML nesting")
        self.stack.pop()
        self.events.append(("end", tag))

    def handle_comment(self, data: str) -> None:
        self.events.append(("comment", data))

    def handle_decl(self, decl: str) -> None:
        self.events.append(("declaration", decl))

    def handle_entityref(self, name: str) -> None:
        self.events.append(("entity", name))

    def handle_charref(self, name: str) -> None:
        self.events.append(("charref", name))

    def handle_data(self, data: str) -> None:
        if any(tag in PROTECTED_TAGS for tag in self.stack):
            self.events.append(("protected-data", data))
            return
        text = data.strip()
        if self.stack and self.stack[-1] == "title":
            self.title += data
        if re.search(r"[A-Za-z]", text) and not re.search(r"[\u3400-\u9fff]", text):
            self.english[text] += 1


def validate(source: str, localized: str) -> tuple[Structure, Structure]:
    original, output = Structure(source), Structure(localized)
    require(original.events == output.events, "HTML topology or immutable attributes changed")
    for key in ("ids", "names", "values", "hrefs", "external_hrefs"):
        require(getattr(original, key) == getattr(output, key), f"Changed {key}")
    require(len(original.localized_attributes) == len(output.localized_attributes),
            "Localizable attributes were added or removed")
    require(output.language == "zh-CN", "Missing Chinese document language")
    require(output.title == "Arman VPN 代理控制台", "Unexpected localized page title")
    require(bool(re.search(r"[\u3400-\u9fff]", localized)), "Chinese text missing")
    allowed = PRESERVED_TEXT | PRESERVED_ATTRIBUTES
    unexpected = sorted(set(output.english) - allowed)
    require(not unexpected, f"Unexpected English-only UI strings: {unexpected!r}")
    # Check the entire SVG sprite byte-for-byte, not merely parsed attributes.
    original_svg = re.findall(r"<svg\b[^>]*>.*?</svg>", source, flags=re.DOTALL)
    output_svg = re.findall(r"<svg\b[^>]*>.*?</svg>", localized, flags=re.DOTALL)
    require(original_svg == output_svg, "SVG content changed")
    return original, output


def main() -> None:
    upstream_bytes = SOURCE.read_bytes()
    require(sha256(upstream_bytes).hexdigest() == EXPECTED_SHA256,
            "Upstream HTML checksum mismatch; review the new public asset before updating translations")
    source = upstream_bytes.decode("utf-8")
    builder = Localizer(source)
    localized = builder.result()
    original, output = validate(source, localized)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(localized, encoding="utf-8")
    require(OUTPUT.read_text(encoding="utf-8") == localized, "Generated HTML readback mismatch")
    require(SOURCE.read_bytes() == upstream_bytes, "Upstream HTML was modified")
    print(
        f"HTML zh-CN coverage: {builder.text_count} translated text nodes "
        f"({len(builder.seen_text) + builder.title_count} unique), "
        f"{builder.attribute_count} translated attributes; lang=zh-CN."
    )
    print(
        f"Structure OK: {len(output.ids)} IDs, {len(output.names)} names, "
        f"{len(output.values)} value attributes, {len(output.hrefs)} hrefs "
        f"({len(output.external_hrefs)} external); all unchanged; SVG/assets/forms preserved."
    )
    print(
        f"English-only leftovers: {sum(output.english.values())} occurrences / "
        f"{len(output.english)} unique, all allowlisted brands/protocols/filenames/examples; "
        "unexpected=0."
    )
    print("Allowed leftovers: " + "; ".join(sorted(value.replace("\n", " | ") for value in output.english)))
    print("Generated: localization/web/index.html")


if __name__ == "__main__":
    main()
