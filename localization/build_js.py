#!/usr/bin/env python3
"""Build the zh-CN dashboard JS without changing the pinned upstream asset.

Only exact, count-guarded presentation edits are permitted. All original API
calls, JSON operations, protocol/settings helpers, comparison values, selectors,
CSS classes, and functional object keys are checked again before writing output.
Unknown upstream messages and raw logs intentionally keep their technical detail.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "upstream" / "app.js"
OUTPUT = ROOT / "web" / "app.js"
EXPECTED_SHA256 = "678fdc1cb05cef714ecc6e875d2c13946233e1c0b5ce0b0ee60b4d974498c4e0"
raw = SOURCE.read_bytes()
assert hashlib.sha256(raw).hexdigest() == EXPECTED_SHA256, "Upstream app.js changed; review translations before rebuilding"
original = raw.decode("utf-8")
text = original
edits: list[tuple[str, str, int]] = []


def replace(old: str, new: str, expected: int = 1) -> None:
    global text
    actual = text.count(old)
    assert actual == expected, f"Expected {expected} occurrences, got {actual}: {old!r}"
    text = text.replace(old, new)
    edits.append((old, new, expected))


def literal(old: str, new: str, expected: int = 1) -> None:
    replace(json.dumps(old, ensure_ascii=False), json.dumps(new, ensure_ascii=False), expected)


# Only display literals: never substitute lower-case protocol/state/settings
# values, selector strings, arbitrary DOM text, or user/server object contents.
for old, new, count in [
    ("Overview", "概览", 1),
    ("Servers", "服务器", 1),
    ("Mozilla's exit locations", "Mozilla 出口位置", 1),
    ("Accounts", "账户", 1),
    ("Firefox Accounts used in rotation", "按顺序轮换使用的 Firefox 账户", 1),
    ("Logs", "日志", 1),
    ("Live service log", "实时服务日志", 1),
    ("Settings", "设置", 1),
    ("Stored in config.json in the data folder", "保存在数据文件夹的 config.json 中", 1),
    ("Help", "帮助", 2),
    ("What this proxy can and cannot do", "此代理的功能与限制", 1),
    ("Copy is not available on this connection", "当前连接无法使用剪贴板复制", 1),
    ("Quota unknown until first use", "首次使用后才能获取流量额度", 1),
    ("Unlimited quota", "不限流量", 1),
    ("Ready", "可用", 2),
    ("Threshold reached", "已达到切换阈值", 2),
    ("Needs sign-in", "需要登录", 1),
    ("Unavailable", "暂不可用", 1),
    ("Disabled", "已禁用", 1),
    ("Connected", "已连接", 2),
    ("Waiting", "等待中", 1),
    ("Starting", "启动中", 1),
    ("Error", "错误", 1),
    ("Off", "已关闭", 2),
    ("Quota used up", "流量额度已用尽", 1),
    ("Recommended location", "推荐位置", 1),
    (" (recommended)", "（推荐）", 1),
    ("Recommended (anycast)", "推荐位置（任播）", 1),
    ("Hide", "隐藏", 2),
    ("Show", "显示", 1),
    ("Hide the password", "隐藏密码", 1),
    ("Show the password", "显示密码", 1),
    ("Public IP", "公网 IP", 1),
    ("Click to copy", "点击复制", 1),
    ("Public IP · what websites see", "公网 IP · 网站看到的地址", 1),
    ("Recommended", "推荐", 1),
    ("This dashboard is open to other devices and has no password.", "此控制台允许其他设备访问，且尚未设置密码。", 1),
    ("This dashboard is not protected by a password.", "此控制台尚未设置密码保护。", 1),
    ("Set a password", "设置密码", 1),
    ("The proxy is open to other devices and has no password.", "此代理允许其他设备连接，且尚未设置密码。", 1),
    ("Set a login", "设置登录凭据", 1),
    ("Open the web dashboard from the app (About, Web dashboard): it signs you in.", "请在应用中打开网页控制台（关于 → 网页控制台），即可自动登录。", 1),
    ("Sleeping", "休眠中", 2),
    ("wakes on use · ", "使用时唤醒 · ", 1),
    ("Sleeping: wakes on the next connection", "休眠中：下次连接时自动唤醒", 1),
    ("Connected through Mozilla VPN", "已通过 Mozilla VPN 连接", 1),
    ("Proxy status", "代理状态", 1),
    ("Turned off: the proxy port is closed and nothing connects to Mozilla. Turn it on here or in the app.", "代理已关闭：监听端口已关闭，不会连接 Mozilla。可在此处或应用中重新开启。", 1),
    ("Copy the proxy address (SOCKS5 and HTTP)", "复制代理地址（SOCKS5 和 HTTP）", 1),
    ("Proxy ", "代理 ", 1),
    ("Clients need the SOCKS5 username and password", "客户端需要填写 SOCKS5 用户名和密码", 1),
    ("Login required", "需要身份验证", 1),
    ("Turn on", "开启", 1),
    ("Turn off", "关闭", 1),
    ("No active account", "当前无使用中的账户", 1),
    ("Add an account to start", "添加账户以开始使用", 1),
    ("last test failed", "上次测试失败", 1),
    ("Run a connection test", "运行连接测试", 1),
    ("Asleep for", "已休眠", 1),
    ("Uptime", "运行时长", 1),
    ("No account is active right now.", "目前没有正在使用的账户。", 1),
    ("No accounts yet. Add one on the Accounts page.", "尚未添加账户，请前往“账户”页面添加。", 1),
    (" (username and password required)", "（需要用户名和密码）", 1),
    ("Location", "位置", 1),
    ("Unknown", "未知", 1),
    ("Server", "服务器", 1),
    ("Selected by", "选择方式", 1),
    ("Running since", "启动时间", 1),
    ("State", "状态", 1),
    ("Proxy pass", "代理通行证", 1),
    ("Data folder", "数据文件夹", 2),
    ("It connects to ports 80, 443, 8080, and 8443 only; sites on other ports do not open through it.", "此代理仅支持连接 80、443、8080 和 8443 端口，使用其他端口的网站无法通过它访问。", 1),
    ("This program's own connections come back to it", "程序自身的连接被重新送回了代理", 1),
    ("Another program sends this program's traffic into its proxy, so nothing connects: in PassWall2, turn Localhost Proxy off.", "其他程序将本程序的流量转回此代理，导致连接循环。在 PassWall2 中，请关闭“本机代理（Localhost Proxy）”。", 1),
    ("Destinations: ", "目标地址：", 1),
    ("Destination: ", "目标地址：", 1),
    ("Hide this note", "隐藏此提示", 1),
    ("Everything goes through Mozilla", "所有流量均通过 Mozilla", 1),
    ("On", "已开启", 1),
    ("Not working", "未生效", 1),
    ("the files are loading", "规则文件正在加载", 1),
    ("Downloading…", "下载中…", 2),
    ("Not downloaded yet", "尚未下载", 1),
    ("Set by hand (the URLs below)", "手动设置（使用下方网址）", 1),
    ("The country's rules are back in the list; save to apply them", "已恢复该国家或地区的规则，请保存设置以应用", 1),
    ("Direct", "直连", 2),
    ("Through Mozilla", "通过 Mozilla", 1),
    ("Blocked", "已拦截", 2),
    ("Testing…", "测试中…", 4),
    ("no rule matches", "未匹配任何规则", 1),
    ("Routing lists updated", "分流规则列表已更新", 1),
    ("the link", "链接", 1),
    ("Failed", "失败", 2),
    ("Tunnel", "隧道", 1),
    ("Opening the tunnel through Mozilla's proxy server", "通过 Mozilla 代理服务器建立隧道", 1),
    ("The encrypted handshake with the test site", "与测试网站进行加密握手", 1),
    ("Response", "响应", 1),
    ("From sending the request to the first byte of the answer", "从发出请求到收到响应首字节的时间", 1),
    ("Connection test failed", "连接测试失败", 1),
    ("Turning the proxy on", "正在开启代理", 1),
    ("Proxy turned off", "代理已关闭", 1),
    ("Restarting the proxy", "正在重启代理", 1),
    ("No accounts yet", "尚未添加账户", 1),
    ("Use “Add account” to sign in with a Firefox Account.", "点击“添加账户”，使用 Firefox 账户登录。", 1),
    ("Active", "使用中", 3),
    ("Move up", "上移", 1),
    ("Move down", "下移", 1),
    ("Use now", "立即使用", 1),
    ("Switching to this account", "正在切换到此账户", 1),
    ("Quota refreshed", "流量额度已刷新", 1),
    ("Refresh quota", "刷新流量额度", 1),
    ("Sign in again", "重新登录", 2),
    ("Disable", "禁用", 1),
    ("Enable", "启用", 1),
    ("Remove", "移除", 1),
    ("Drag to change the order", "拖动以调整顺序", 1),
    ("Account removed", "账户已移除", 1),
    ("Loading…", "加载中…", 1),
    ("Auto (recommended)", "自动（推荐）", 3),
    ("Mozilla picks the server, as Firefox does by default.", "由 Mozilla 选择服务器，与 Firefox 的默认行为相同。", 1),
    ("Auto (fastest)", "自动（最快）", 2),
    ("The server with the lowest real delay is tested and chosen whenever the proxy starts.", "每次启动代理时，测试并选择实际延迟最低的服务器。", 1),
    ("Set in Settings.", "在“设置”中指定。", 1),
    ("The proxy always uses this server.", "代理始终使用此服务器。", 1),
    ("Test real delay to compare the servers. Each one is tested through the tunnel with the active account (the proxy must be running); this takes from a few seconds to a minute.", "测试实际延迟以比较服务器。将使用当前账户，通过隧道逐一测试（代理必须处于运行状态），耗时约数秒至一分钟。", 1),
    ("No location matches.", "没有匹配的位置。", 1),
    ("The server list is not loaded yet.", "服务器列表尚未加载。", 1),
    ("No answer", "无响应", 1),
    ("not tested", "未测试", 1),
    ("Use", "使用", 1),
    ("No location to test", "没有可测试的位置", 1),
    ("No location answered", "所有位置均无响应", 1),
    ("Verification code", "验证码", 1),
    ("Authenticator code", "身份验证器验证码", 1),
    ("Unblock code", "解锁验证码", 1),
    ("Characters in the image", "图片中的字符", 1),
    ("Sign in", "登录", 1),
    ("Cancel", "取消", 1),
    ("Working…", "处理中…", 1),
    ("I opened the link", "我已打开链接", 1),
    ("Added", "已添加", 1),
    ("The account joins the rotation at the end of the list.", "该账户已加入列表末尾，按顺序参与轮换。", 1),
    ("Close", "关闭", 1),
    ("Try again", "重试", 1),
    ("Continue", "继续", 1),
    ("No activity yet.", "暂无活动记录。", 1),
    ("Name", "域名", 1),
    ("Selected DNS", "所选 DNS", 1),
    ("System DNS", "系统 DNS", 1),
    ("The network answered with a filtering address: its DNS is tampered with", "网络返回了用于过滤的地址，DNS 可能已被篡改", 1),
    ("Filtered", "被过滤", 1),
    ("Every name resolved", "所有域名均解析成功", 1),
    ("Program folder", "程序文件夹", 1),
    ("All addresses (from config.json)", "所有地址（来自 config.json）", 1),
    ("Auto (fastest: lowest real delay at each start)", "自动（最快：每次启动时选择实际延迟最低的服务器）", 1),
    ("Custom server…", "自定义服务器…", 1),
    ("Set both the proxy username and password, or leave both empty.", "请同时填写代理用户名和密码，或将两者都留空。", 1),
    ("Saved. The proxy restarts with the new settings.", "已保存。代理将使用新设置重启。", 1),
    ("Settings saved", "设置已保存", 1),
]:
    literal(old, new, count)

# Complete template literals are guarded separately so their interpolated
# identifiers, country codes, addresses, and technical values stay unchanged.
for old, new in [
    ('`Copied ${label}`', '`已复制${label}`'),
    ('`Switches at ${threshold}%`', '`使用量达到 ${threshold}% 时切换账户`'),
    ('`resets ${formatDate(usage.reset_at)}`', '`于 ${formatDate(usage.reset_at)} 重置`'),
    ('`${minutes}m`', '`${minutes} 分钟`'),
    ('`${hours}h ${String(minutes).padStart(2, "0")}m`', '`${hours} 小时 ${String(minutes).padStart(2, "0")} 分钟`'),
    ('`${Math.floor(hours / 24)}d ${hours % 24}h`', '`${Math.floor(hours / 24)} 天 ${hours % 24} 小时`'),
    ('`Public IP, the address websites see: ${both} (${ipPlace(exit.country_code, exit.city, exit.network)}). Click to copy.`', '`公网 IP（网站看到的地址）：${both}（${ipPlace(exit.country_code, exit.city, exit.network)}）。点击复制。`'),
    ('` · next attempt ${relative(s.state.retry_at)}`', '` · 下次尝试：${relative(s.state.retry_at)}`'),
    ('` · last renewal error: ${s.pass.last_error}`', '` · 上次续期失败：${tError(s.pass.last_error)}`'),
    ('`No connection through Mozilla since ${relative(s.proxy.sleeping_since)}: the session is closed and the account is not used. The next connection, a connection test, or a real-delay test wakes it in a few seconds.`', '`自 ${relative(s.proxy.sleeping_since)} 起未通过 Mozilla 建立连接：会话已关闭，账户未被占用。下次连接、连接测试或实际延迟测试将在几秒内将其唤醒。`'),
    ('`${s.accounts.ready || 0} of ${s.accounts.total} accounts ready · the next one takes over at ${state.threshold}%`', '`${s.accounts.total} 个账户中有 ${s.accounts.ready || 0} 个可用 · 当前账户使用量达到 ${state.threshold}% 时切换到下一个`'),
    ('`tested ${relative(test.at)}`', '`测试于 ${relative(test.at)}`'),
    ('`no session · up ${duration(s.proxy.started_at)} in all`', '`无活动会话 · 累计运行 ${duration(s.proxy.started_at)}`'),
    ('`pass renews ${relative(s.pass.proxy_pass_expires_at)}`', '`通行证续期时间：${relative(s.pass.proxy_pass_expires_at)}`'),
    ('`${s.pass.accepting ? "valid" : "not accepting"}, renews before ${formatTime(s.pass.proxy_pass_expires_at)}`', '`${s.pass.accepting ? "有效" : "不接受新连接"}，将在 ${formatTime(s.pass.proxy_pass_expires_at)} 前续期`'),
    ("`Mozilla's proxy refused port ${n.detail}`", '`Mozilla 代理拒绝了 ${n.detail} 端口`'),
    ('`An application asked for ${n.detail}`', '`某个应用请求了 ${n.detail}`'),
    ('`${n.count} times, last ${relative(n.last)}`', '`${n.count} 次，最近一次：${relative(n.last)}`'),
    ('`Everything goes through Mozilla: ${view.error || "规则文件正在加载"}`', '`所有流量均通过 Mozilla：${tError(view.error) || "规则文件正在加载"}`'),
    ('`Updated ${relative(oldest)}`', '`更新于 ${relative(oldest)}`'),
    ('`The last update failed: ${view.last_error}`', '`上次更新失败：${tError(view.last_error)}`'),
    ('`by the rule ${r.rule}`', '`匹配规则：${r.rule}`'),
    ('` (looked up through Mozilla: ${r.resolved})`', '`（通过 Mozilla 解析：${r.resolved}）`'),
    ("`Mozilla's proxy does not connect to port ${r.port}; it connects to 80, 443, 8080, and 8443 only. A Direct rule for this destination would let it open.`", '`Mozilla 代理不支持连接 ${r.port} 端口；仅支持 80、443、8080 和 8443。为此目标添加直连规则后即可访问。`'),
    ('`Since the proxy started: ${formatBytes(traffic.down)} down and ${formatBytes(traffic.up)} up through Mozilla`', '`代理启动以来：通过 Mozilla 下载 ${formatBytes(traffic.down)}，上传 ${formatBytes(traffic.up)}`'),
    ('`, ${formatBytes(traffic.direct_down)} down and ${formatBytes(traffic.direct_up)} up directly (routing)`', '`；通过直连分流下载 ${formatBytes(traffic.direct_down)}，上传 ${formatBytes(traffic.direct_up)}`'),
    ('`Public IP check: ${result.exit_error}`', '`公网 IP 检测：${tError(result.exit_error)}`'),
    ('`Connection OK in ${result.total_ms} ms`', '`连接成功，耗时 ${result.total_ms} 毫秒`'),
    ('`Accounts are used top to bottom. The next one takes over when the active account has used ${state.threshold}% of its quota.`', '`账户按从上到下的顺序使用。当前账户已用流量达到额度的 ${state.threshold}% 时，将自动切换到下一个账户。`'),
    ('`until ${formatTime(account.retry_at)}`', '`等待至 ${formatTime(account.retry_at)}`'),
    ('`Remove ${account.name}? Its stored credentials are deleted.`', '`确定移除 ${account.name}？此账户已保存的登录凭据也将被删除。`'),
    ('`Custom server ${mode.value}`', '`自定义服务器 ${mode.value}`'),
    ('`Manual: ${match ? match.name : mode.value}`', '`手动选择：${match ? locationName(match) : mode.value}`'),
    ('` Now: ${placeName(state.status.proxy)}.`', '` 当前：${placeName(state.status.proxy)}。`'),
    ('`Server list as Firefox ${state.firefoxVersion} (the latest) sees it; updated automatically.`', '`服务器列表与最新版 Firefox ${state.firefoxVersion} 保持一致，自动更新。`'),
    ('`Real delay tested ${relative(state.pingedAt)}: the time to reach www.google.com through each server with the active account, so it covers the whole path to the exit. Test real delay checks every server.`', '`实际延迟测试于 ${relative(state.pingedAt)}：使用当前账户经各服务器访问 www.google.com 的耗时，涵盖到出口的完整路径。“测试实际延迟”会检查所有服务器。`'),
    ('`Server set: ${label}. The proxy restarts.`', '`服务器已设为：${label}。代理将重启。`'),
    ('`Testing ${codes.length}…`', '`正在测试 ${codes.length} 个位置…`'),
    ('`${answered.length} of ${codes.length} answered; fastest: ${locationName(answered[0])} (${answered[0].ping_ms} ms)`', '`${codes.length} 个位置中有 ${answered.length} 个响应；最快：${locationName(answered[0])}（${answered[0].ping_ms} 毫秒）`'),
    ('`${failed} of ${data.results.length} names failed`', '`${data.results.length} 个域名中有 ${failed} 个解析失败`'),
    ("`Every name resolved; the network's DNS is filtered for ${filtered}`", '`所有域名均解析成功；其中 ${filtered} 个受到网络 DNS 过滤`'),
    ('`Copy the ${label.toLowerCase()}`', '`复制${label.toLowerCase()}`'),
    ('`${host} (from config.json)`', '`${host}（来自 config.json）`'),
    ('`${loc.name} (${loc.code})${loc.ping_ms ? ` — ${loc.ping_ms} ms` : ""}`', '`${locationName(loc)} (${loc.code})${loc.ping_ms ? ` — ${loc.ping_ms} ms` : ""}`'),
    ('`The dashboard moved to ${target}`', '`控制台地址已变更为 ${target}`'),
]:
    replace(old, new, 2 if old == '`Copy the ${label.toLowerCase()}`' else 1)

# Locales change presentation only. Country/region code remains the API and
# <option> value; never overwrite raw server country_name/name fields.
replace('date.toLocaleString()', 'date.toLocaleString("zh-CN")')
replace('date.toLocaleDateString()', 'date.toLocaleDateString("zh-CN")')
replace('new Intl.RelativeTimeFormat(undefined,', 'new Intl.RelativeTimeFormat("zh-CN",')
replace('new Intl.DisplayNames(["en"],', 'new Intl.DisplayNames(["zh-CN"],')
replace('time.toLocaleTimeString(undefined,', 'time.toLocaleTimeString("zh-CN",')
replace('time.toLocaleString(undefined,', 'time.toLocaleString("zh-CN",')
replace('const country = exit.country_name || countryName(exit.country_code);', 'const country = countryName(exit.country_code) || exit.country_name;')
replace('const country = proxy.country_name || proxy.country_code || "";', 'const country = countryName(proxy.country_code) || proxy.country_name || "";')
replace('proxy.city_name !== country', 'proxy.city_name !== country && proxy.city_name !== proxy.country_name')
replace('return loc.recommended ? "推荐位置（任播）" : loc.name;', 'return loc.recommended ? "推荐位置（任播）" : countryName(loc.code) || loc.name;')
replace('l.name.toLowerCase().includes(query) || l.code.toLowerCase().includes(query)', 'l.name.toLowerCase().includes(query) || l.code.toLowerCase().includes(query) || locationName(l).toLowerCase().includes(query)')
replace('alt: code, title: code, loading:', 'alt: code, title: countryName(code), loading:')

# Frontend-only error/message formatting at explicit presentation surfaces.
# api(), server objects, status enums and sign-in comparisons are not changed.
for old, new, count in [
    ('toast(error.message || String(error), true);', 'toast(tError(error.message || String(error)), true);', 1),
    ('textContent = error.message;', 'textContent = tError(error.message);', 4),
    ('text: error.message', 'text: tError(error.message)', 1),
    ('? "" : view.error || "";', '? "" : tError(view.error) || "";', 1),
    ('text: result.error', 'text: tError(result.error)', 1),
    ('title: loc.ping_error || ""', 'title: tError(loc.ping_error)', 1),
    ('text: account.reason', 'text: tMessage(account.reason)', 1),
    ('text: error }', 'text: tError(error) }', 1),
    (': s.state.message;', ': tMessage(s.state.message);', 2),
    ('fact(facts, "状态", s.state.message);', 'fact(facts, "状态", tMessage(s.state.message));', 1),
    ('(s.proxy.selection_source || "").replaceAll("_", " ")', 'selectionLabel(s.proxy.selection_source)', 1),
    ('r.note || "未匹配任何规则"', 'tMessage(r.note) || "未匹配任何规则"', 1),
    ('text: r.role', 'text: dnsRole(r.role)', 1),
    ('text: view.message || "处理中…"', 'text: signInMessage(view) || "处理中…"', 1),
    ('message.textContent = view.message;', 'message.textContent = signInMessage(view);', 3),
]:
    replace(old, new, count)

HELPERS = r'''
// BEGIN ZH-CN PRESENTATION HELPERS
// Exact known-message translation only. No server/user data mutation and no
// observer/global DOM substitution. Unknown details remain visible verbatim.
const ZH_MESSAGES = new Map([
  ["login required", "请先登录"],
  ["wrong username or password", "用户名或密码错误"],
  ["requests must be JSON", "请求必须使用 JSON 格式"],
  ["cross-origin request refused", "已拒绝跨来源请求"],
  ["unauthorized", "未授权，请先登录"],
  ["forbidden", "没有执行此操作的权限"],
  ["not found", "未找到请求的资源"],
  ["method not allowed", "不支持此请求方式"],
  ["bad request", "请求参数无效"],
  ["internal server error", "服务器内部错误"],
  ["service unavailable", "服务暂时不可用"],
  ["too many requests", "请求过于频繁，请稍后重试"],
  ["failed to fetch", "网络请求失败，请检查连接"],
  ["networkerror when attempting to fetch resource.", "网络请求失败，请检查连接"],
  ["load failed", "网络加载失败，请检查连接"],
  ["context deadline exceeded", "操作超时（context deadline exceeded）"],
  ["context canceled", "操作已取消（context canceled）"],
  ["no accounts", "尚未添加账户"],
  ["no accounts configured", "尚未配置账户，请先添加 Firefox 账户"],
  ["no accounts available", "没有可用账户，请添加账户或检查登录状态"],
  ["no usable accounts", "没有可使用的账户，请检查账户状态"],
  ["no ready accounts", "没有就绪的账户，请检查账户状态"],
  ["no active account", "当前没有使用中的账户"],
  ["add an account to start", "请添加账户以开始使用"],
  ["waiting for an account", "正在等待可用账户"],
  ["waiting for accounts", "正在等待可用账户"],
  ["proxy is off", "代理已关闭"],
  ["proxy is not running", "代理未运行"],
  ["proxy not running", "代理未运行"],
  ["account not found", "未找到账户"],
  ["account is disabled", "账户已禁用"],
  ["account requires reauthentication", "账户需要重新登录"],
  ["quota exhausted", "流量额度已用尽"],
  ["quota threshold reached", "已达到流量切换阈值"],
  ["sign-in required", "需要登录"],
  ["sign in required", "需要登录"],
  ["invalid credentials", "登录凭据无效"],
  ["incorrect password", "密码错误"],
  ["invalid password", "密码无效"],
  ["invalid verification code", "验证码无效，请重试"],
  ["incorrect verification code", "验证码错误，请重试"],
  ["invalid code", "验证码无效，请重试"],
  ["invalid totp code", "身份验证器验证码无效，请重试"],
  ["sign-in expired", "登录流程已过期，请重新开始"],
  ["sign-in not found", "未找到登录流程，请重新开始"],
  ["sign-in cancelled", "登录已取消"],
  ["sign-in canceled", "登录已取消"],
  ["cancelled", "已取消"],
  ["canceled", "已取消"],
  ["signing in", "正在登录"],
  ["signing in…", "正在登录…"],
  ["signing in...", "正在登录…"],
  ["checking email", "正在检查邮箱"],
  ["checking verification", "正在检查验证状态"],
  ["checking the link", "正在检查链接确认状态"],
  ["checking the code", "正在验证验证码"],
  ["working…", "处理中…"],
  ["working...", "处理中…"],
  ["checking account", "正在检查账户"],
  ["sign-in failed", "登录失败"],
  ["sign-in complete", "登录完成"],
  ["account added", "账户已添加"],
  ["all accounts are unavailable", "所有账户目前均不可用"],
  ["all accounts have reached the quota threshold", "所有账户均已达到流量切换阈值"],
  ["no rule matches", "未匹配任何规则"],
  ["private address", "私有地址"],
  ["loopback address", "回环地址"],
  ["local address", "本地地址"],
  // Pinned daemon.go / engine.go ordinary and no-account state messages.
  ["Starting", "启动中"],
  ["Starting the proxy", "正在启动代理"],
  ["Proxy running", "代理运行中"],
  ["Proxy off", "代理已关闭"],
  ["Waiting for a network connection", "正在等待网络连接"],
  ["Add an account in the dashboard to start the proxy", "请在控制台中添加账户以启动代理"],
  ["no enabled accounts", "没有已启用的账户，请添加或启用账户"],
  ["no usable account", "目前没有可用账户，请检查流量额度或重新登录"],
  ["the proxy is off; turn it on first", "代理已关闭，请先开启代理"],
  ["the proxy is not running", "代理未运行"],
  // Pinned signin_flow.go instructions and friendly errors.
  ["email and password are required", "请填写邮箱地址和密码"],
  ["this sign-in is not waiting for input", "当前登录流程不在等待输入，请稍后重试"],
  ["Checking", "正在验证"],
  ["Getting the account token", "正在获取账户令牌"],
  ["The account was not added.", "账户未能添加。"],
  ["Firefox Accounts asks for a CAPTCHA. Type the characters shown.", "Firefox 账户要求完成人机验证，请输入图片中的字符。"],
  ["Enter the code from your authenticator app.", "请输入身份验证器应用当前显示的验证码。"],
  ["That unblock code was not accepted. Check it against the latest email from Mozilla and try again.", "解锁验证码未被接受。请核对 Mozilla 最新邮件中的验证码后重试。"],
  ["Wrong code. Enter the code the authenticator app shows now.", "验证码错误，请输入身份验证器应用当前显示的验证码。"],
  ["Wrong or expired code. Use the code from the latest email from Mozilla; an older code stops working when a new one is sent.", "验证码错误或已过期。请使用 Mozilla 最新邮件中的验证码；发送新验证码后，旧验证码将失效。"],
  ["No Firefox Account exists for this email.", "此邮箱地址尚未注册 Firefox 账户。"],
  ["Too many attempts. Wait a while and try again.", "尝试次数过多，请稍后再试。"],
  ["This account has no password: it was made with Google or Apple sign-in. Set one on accounts.firefox.com (Forgot password), then sign in with it.", "此账户通过 Google 或 Apple 登录创建，尚未设置密码。请在 accounts.firefox.com 使用“忘记密码”设置密码，然后使用该密码登录。"],
  ["The unblock code was not accepted.", "解锁验证码未被接受，请重试。"],
  ["Too many wrong codes. Start the sign-in again.", "验证码错误次数过多，请重新开始登录。"],
  ["The sign-in took too long. Start it again.", "登录操作超时，请重新开始。"],
  ["the sign-in timed out", "登录操作超时，请重新开始"],
  ["too many wrong codes; start the sign-in again", "验证码错误次数过多，请重新开始登录"],
  // Known config validation messages: keys and enum names in displayed
  // explanations remain technical originals, never rewritten in config/API.
  ["proxy.username and proxy.password must be set together", "必须同时填写代理用户名和密码，或将两者都留空"],
  ["proxy.username and proxy.password are limited to 255 bytes", "代理用户名和密码各自不得超过 255 字节"],
  ["proxy.country and proxy.server are mutually exclusive", "不能同时指定国家或地区和自定义服务器"],
  ["proxy.upstream_connections must be at least 1", "上游连接数至少为 1"],
  ["proxy.max_connections must not be negative (0 disables the limit)", "最大连接数不能为负数（0 表示不限制）"],
  ["proxy.idle_sleep must be 0 (off) or at least 1m", "空闲休眠时间应为 0（关闭）或至少 1 分钟"],
  ["accounts.switch_threshold_percent must be above 0 and at most 100", "账户流量切换阈值必须大于 0 且不超过 100%"],
  ["accounts.order contains an empty id", "账户顺序列表中存在空的账户 ID"],
  ["dashboard.username and dashboard.password_hash must be set together", "必须同时设置控制台用户名和密码"],
  ["dashboard username and password must be set together", "必须同时设置控制台用户名和密码"],
  ["dashboard password must be at least 6 characters", "控制台密码至少需要 6 个字符"],
  ["a password is required when setting a dashboard username", "设置控制台用户名时还必须设置密码"],
  ["routing.update_interval must be at least 1h", "分流规则更新间隔至少为 1 小时"],
  ["must be an https:// URL (the sign-in and the account tokens cross it)", "必须使用 https:// 网址，因为登录信息和账户令牌会经过此地址"],
  ["durations are strings such as \"10s\" or \"5m\"", "时间长度必须为字符串，例如 \"10s\" 或 \"5m\""],
].map(([source, translated]) => [source.trim().replace(/[.!]$/, "").toLowerCase(), translated]));

function retryDurationLabel(value) {
  // Format only the Go duration carried by this known display message.
  // Preserve every numeric component; leave an unfamiliar duration unchanged.
  if (!/^(?:\d+(?:\.\d+)?(?:ns|µs|μs|us|ms|s|m|h|d))+$/.test(value)) return value;
  const units = { ns: "纳秒", "µs": "微秒", "μs": "微秒", us: "微秒", ms: "毫秒", s: "秒", m: "分钟", h: "小时", d: "天" };
  return value.replace(/(\d+(?:\.\d+)?)(ns|µs|μs|us|ms|s|m|h|d)/g, (_, number, unit) => `${number} ${units[unit]} `).trim();
}

function tMessage(value) {
  if (value === undefined || value === null) return "";
  const raw = String(value);
  const known = ZH_MESSAGES.get(raw.trim().replace(/[.!]$/, "").toLowerCase());
  if (known) return known;
  // Only exact upstream message templates are formatted. Captured values
  // (email/technical detail) are retained; arbitrary server text is untouched.
  let match;
  if ((match = raw.match(/^connecting to Mozilla failed (\S+) ago; trying again in (\S+): ([\s\S]+)$/i))) return `连接 Mozilla 于 ${retryDurationLabel(match[1])}前失败；将在 ${retryDurationLabel(match[2])}后重试：${tMessage(match[3])}`;
  if ((match = raw.match(/^connecting to Mozilla failed (\S+) ago: ([\s\S]+)$/i))) return `连接 Mozilla 于 ${retryDurationLabel(match[1])}前失败：${tMessage(match[2])}`;
  if ((match = raw.match(/^connecting to Mozilla failed: ([\s\S]+)$/i))) return `连接 Mozilla 失败：${tMessage(match[1])}`;
  // Recognize only the known HTTP 451 region refusal, retaining its entire
  // original technical response (including JSON) for troubleshooting.
  if (/^guardian returned HTTP 451\b/i.test(raw) && /Guardian does not serve this region|unavailable_in_region/i.test(raw)) return `当前请求出口地区不受支持（HTTP 451）。技术详情：${raw}`;
  if ((match = raw.match(/^Enter the verification code sent to (.+)\.$/))) return `请输入发送到 ${match[1]} 的验证码。`;
  if ((match = raw.match(/^Open the confirmation link sent to (.+), then continue\.$/))) return `请打开已发送到 ${match[1]} 的确认链接，然后继续。`;
  if ((match = raw.match(/^Firefox Accounts blocked this sign-in as unusual and emailed an unblock code to (.+)\. Enter it\.$/))) return `Firefox 账户认为此次登录异常，已向 ${match[1]} 发送解锁验证码。请输入该验证码。`;
  if ((match = raw.match(/^no usable account: (.+?)(?:; earliest retry (.+))?$/))) {
    const counts = match[1].split(", ").map((part) => {
      const item = part.match(/^(\d+) (reserved|unavailable|reauth_required|ready)$/);
      return item ? `${item[1]} 个${({reserved: "已达流量阈值", unavailable: "暂不可用", reauth_required: "需要重新登录", ready: "可用"})[item[2]]}` : tMessage(part);
    }).join("，");
    return `目前没有可用账户：${counts}${match[2] ? `；最早重试时间：${formatTime(match[2]) || match[2]}` : ""}`;
  }
  return raw;
}

function tError(value) {
  // Unknown backend/network errors are not discarded: retain their technical
  // content for troubleshooting. Prefixes only translate recognized framing.
  const message = tMessage(value);
  if (message !== String(value ?? "")) return message;
  const knownPrefixes = [
    [/^sign-in failed:\s*/i, "登录失败："],
    [/^login failed:\s*/i, "登录失败："],
    [/^failed to sign in:\s*/i, "登录失败："],
    [/^failed to refresh quota:\s*/i, "刷新流量额度失败："],
    [/^failed to refresh token:\s*/i, "刷新令牌失败："],
    [/^failed to renew proxy pass:\s*/i, "代理通行证续期失败："],
    [/^connection test failed:\s*/i, "连接测试失败："],
    [/^invalid configuration:\s*/i, "设置无效："],
    [/^The code was not accepted:\s*/i, "验证码未被接受："],
    [/^invalid request:\s*/i, "请求无效："],
    [/^dns\.servers:\s*/i, "DNS 服务器设置无效："],
    [/^network\.api_relay:\s*/i, "API 中继设置无效："],
    [/^routing\.region:\s*/i, "分流国家或地区设置无效："],
    [/^routing\.direct:\s*/i, "直连规则无效："],
    [/^routing\.block:\s*/i, "拦截规则无效："],
  ];
  for (const [pattern, label] of knownPrefixes) {
    if (pattern.test(message)) return label + tMessage(message.replace(pattern, ""));
  }
  let match;
  if ((match = message.match(/^proxy\.transport must be "h2" or "h3", not (.+)$/))) return `代理传输方式必须为 "h2" 或 "h3"，不能为 ${match[1]}`;
  if ((match = message.match(/^(routing\.(?:geosite_url|geoip_url)) must be an https URL$/))) return `${match[1]} 必须使用 https 网址`;
  if ((match = message.match(/^(proxy\.listen|dashboard\.listen) (.+) must be host:port: (.+)$/))) return `${match[1]} 的地址 ${match[2]} 必须使用 host:port 格式：${match[3]}`;
  if ((match = message.match(/^(proxy\.listen|dashboard\.listen) (.+) must be an IP address and port$/))) return `${match[1]} 的地址 ${match[2]} 必须包含 IP 地址和端口`;
  if ((match = message.match(/^accounts\.order lists (.+) twice$/))) return `账户顺序列表重复包含 ${match[1]}`;
  if ((match = message.match(/^dashboard password must be at least (\d+) (?:characters|bytes)$/))) return `控制台密码至少需要 ${match[1]} 个字符或字节（以服务端要求为准）`;
  if ((match = message.match(/^system_proxy\.mode (.+) is not supported; it must be (.+)$/))) return `不支持系统代理模式 ${match[1]}；必须使用 ${match[2]}`;
  if ((match = message.match(/^tun\.programs holds at most (\d+) programs$/))) return `TUN 绕过列表最多支持 ${match[1]} 个程序`;
  return message;
}

function signInMessage(view) {
  // Translate known prose, not view.step/email/captcha or any request value.
  return tError(view.message);
}

function selectionLabel(value) {
  return ({ configured_proxy: "指定代理服务器", persisted: "上次选择的位置", single_available_location: "唯一可用位置", fastest_location: "最低实际延迟", configured_country: "指定国家或地区", recommended_location: "推荐位置", server_failover: "服务器故障切换", recommended: "推荐位置", default: "默认设置", fastest: "最低实际延迟", manual: "手动选择", country: "指定国家或地区", server: "指定服务器", custom: "自定义服务器", config: "配置文件", user: "手动选择", fallback: "备用选择" })[value] || String(value || "").replaceAll("_", " ");
}

function dnsRole(value) {
  return ({ "Firefox Accounts": "Firefox 账户", "Guardian (proxy pass)": "Guardian（代理通行证）", "Server list": "服务器列表", "Proxy server (Fastly)": "代理服务器（Fastly）", proxy: "代理服务器", upstream: "上游服务器", test: "测试网站", test_site: "测试网站", doh: "加密 DNS", dns: "DNS 服务器", mozilla: "Mozilla 服务", authentication: "身份验证服务", auth: "身份验证服务" })[value] || value;
}
// END ZH-CN PRESENTATION HELPERS
'''
replace('// ---------------------------------------------------------------- helpers\n', '// ---------------------------------------------------------------- helpers\n' + HELPERS)

# Replay the exact reviewed edit manifest to exclude untracked changes.
# Reversing would be ambiguous when distinct English labels share Chinese text.
replayed = original
for old, new, expected in edits:
    assert replayed.count(old) == expected, f"Manifest drift: {old!r}"
    replayed = replayed.replace(old, new)
assert replayed == text, "Untracked change outside localization manifest"


def call_expressions(source: str, name: str) -> list[str]:
    """Extract balanced call text, ignoring strings/comments inside arguments."""
    result = []
    for match in re.finditer(r"(?<![\w$])" + re.escape(name) + r"\s*\(", source):
        start = match.start()
        i = match.end()
        depth = 1
        quote = None
        while depth:
            assert i < len(source), f"Unclosed call to {name}"
            ch = source[i]
            if quote:
                if ch == "\\":
                    i += 2
                    continue
                if ch == quote:
                    quote = None
            elif ch in "\"'`":
                quote = ch
            elif source.startswith("//", i):
                i = source.index("\n", i)
                continue
            elif source.startswith("/*", i):
                i = source.index("*/", i + 2) + 2
                continue
            elif ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
            i += 1
        result.append(source[start:i])
    return result


# No request URL/body/key, fetch behavior, streaming endpoint or JSON operation
# may change. API function definition is captured as api(method, path, body), too.
for name in ["api", "fetch", "EventSource", "JSON.stringify", "JSON.parse"]:
    assert call_expressions(original, name) == call_expressions(text, name), f"Changed network/JSON calls: {name}"

# These complete function blocks must remain byte-identical (they serialize
# settings, carry enum values, select accounts, or drive state-machine behavior).
for name in ["api", "blockLines", "syncAdsSwitch", "fillRoutingFields", "routingFromForm", "syncSourceSelect", "currentMode", "dnsPresetFor", "dnsServersFromForm", "renderDNSFields", "getPath", "setPath", "collectSettings", "updateDirty", "logVisible", "pollSignIn", "setEnabled", "accountAction", "saveAccountOrder"]:
    pattern = r"(?:async )?function " + re.escape(name) + r"\([^\n]*\) \{\n.*?\n\}"
    a, b = re.search(pattern, original, re.S), re.search(pattern, text, re.S)
    assert a and b and a[0] == b[0], f"Changed protected functional helper: {name}"

# Strip the added helpers and compare original selectors/classes, enum-valued
# comparisons and switch cases. These are distinct from translated labels.
without_helpers = text.replace(HELPERS, "")
for pattern, description in [
    (r"(?:\$|querySelector|querySelectorAll|getElementById)\((?:\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)", "selectors"),
    (r"\bclass:\s*\"(?:\\.|[^\"\\])*\"", "CSS classes"),
    (r"(?:===|!==)\s*\"(?:\\.|[^\"\\])*\"", "machine comparison values"),
    (r"\bcase\s+\"(?:\\.|[^\"\\])*\"", "state-machine cases"),
    (r"\b(?:value|name):\s*(?:\"(?:\\.|[^\"\\])*\"|[\w.]+)", "form values/field names"),
]:
    assert re.findall(pattern, original) == re.findall(pattern, without_helpers), f"Changed {description}"

# All preexisting object property keys (quoted and identifier) are unchanged;
# helpers intentionally add only display maps, never server/config fields.
property_pattern = r"(?m)(?:^|[,{])\s*((?:\"[^\"\n]*\"|'[^'\n]*'|[A-Za-z_$][\w$]*))\s*:(?!:)"
assert re.findall(property_pattern, original) == re.findall(property_pattern, without_helpers), "Changed existing object/JSON keys"
assert not re.search(r"MutationObserver|TreeWalker|innerHTML\s*=", text), "Global rewriting or HTML injection is forbidden"
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == EXPECTED_SHA256, "Original asset changed during build"

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(text, encoding="utf-8")
subprocess.run(["node", "--check", str(OUTPUT)], check=True)
print(f"Built {OUTPUT.relative_to(ROOT.parent)}: {len(edits)} guarded edits; source SHA256, API/JSON, settings/state/selector/class invariants and node --check passed")
