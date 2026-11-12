"use strict";

// Arman VPN dashboard. All server data is rendered with textContent; no
// response value is ever interpreted as HTML.

const $ = (selector, root = document) => root.querySelector(selector);
const GiB = 1024 ** 3;
const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
const SVG_NS = "http://www.w3.org/2000/svg";

const PAGES = {
  overview: ["概览", ""],
  locations: ["服务器", "Mozilla 出口位置"],
  accounts: ["账户", "按顺序轮换使用的 Firefox 账户"],
  logs: ["日志", "实时服务日志"],
  settings: ["设置", "保存在数据文件夹的 config.json 中"],
  help: ["帮助", "此代理的功能与限制"],
};

const state = {
  view: "overview",
  status: null,
  accounts: [],
  threshold: 95,
  settings: null,
  locations: [],
  pingedAt: null,
  sort: "latency",
  testing: false,
  logs: [],
  logSource: null,
  logTab: "log",
  conns: [],
  connsClearedAfter: 0,
  connTimer: null,
  signin: null,
  pollTimer: null,
};

// ---------------------------------------------------------------- helpers

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

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function api(method, path, body) {
  const options = { method, headers: {}, credentials: "same-origin" };
  if (method !== "GET") {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body ?? {});
  }
  const response = await fetch(path, options);
  let data = null;
  try { data = await response.json(); } catch { /* empty body */ }
  if (response.status === 401 && path !== "/api/session") {
    showLogin();
    throw new ApiError(401, "login required");
  }
  if (!response.ok) {
    throw new ApiError(response.status, (data && data.error) || response.statusText);
  }
  return data;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function icon(name) {
  const svg = document.createElementNS(SVG_NS, "svg");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", "#i-" + name);
  svg.append(use);
  return svg;
}

function button(label, onclick, { cls = "btn sm", iconName, title, disabled } = {}) {
  return el("button", { class: cls, title, "aria-label": title, disabled, onclick },
    iconName ? icon(iconName) : null, label ? el("span", { text: label }) : null);
}

function fact(list, label, value, mono = false) {
  if (value === undefined || value === null || value === "") return;
  list.append(el("dt", { text: label }), el("dd", { class: mono ? "mono" : "", text: value }));
}

function gib(bytes) {
  return (bytes / GiB).toFixed(bytes >= 10 * GiB ? 1 : 2);
}

function validDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) || date.getFullYear() < 2000 ? null : date;
}

function formatTime(value) {
  const date = validDate(value);
  return date ? date.toLocaleString("zh-CN") : "";
}

function formatDate(value) {
  const date = validDate(value);
  return date ? date.toLocaleDateString("zh-CN") : "";
}

function relative(value) {
  const date = validDate(value);
  if (!date) return "";
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  const unit = abs < 90 ? [seconds, "second"] : abs < 5400 ? [Math.round(seconds / 60), "minute"] : abs < 172800 ? [Math.round(seconds / 3600), "hour"] : [Math.round(seconds / 86400), "day"];
  return new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" }).format(unit[0], unit[1]);
}

function duration(from) {
  const date = validDate(from);
  if (!date) return "–";
  let minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  minutes %= 60;
  if (hours < 48) return `${hours} 小时 ${String(minutes).padStart(2, "0")} 分钟`;
  return `${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
}

let toastTimer = null;
function toast(message, bad = false) {
  const node = $("#toast");
  node.replaceChildren(icon(bad ? "bolt" : "check"), el("span", { text: message }));
  node.className = bad ? "toast bad" : "toast";
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, bad ? 6500 : 3200);
}

function reportError(error) {
  if (error instanceof ApiError && error.status === 401) return;
  toast(tError(error.message || String(error)), true);
}

async function busy(buttonNode, label, task) {
  const original = [...buttonNode.childNodes];
  buttonNode.disabled = true;
  buttonNode.replaceChildren(el("span", { class: "spinner" }), el("span", { text: label }));
  try {
    return await task();
  } finally {
    buttonNode.replaceChildren(...original);
    buttonNode.disabled = false;
  }
}

async function copyText(text, label = text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`已复制${label}`);
  } catch {
    toast("当前连接无法使用剪贴板复制", true);
  }
}

function usagePercent(usage) {
  if (!usage || usage.unlimited || !usage.limit_bytes) return null;
  return Math.min(100, ((usage.limit_bytes - (usage.remaining_bytes || 0)) * 100) / usage.limit_bytes);
}

function levelClass(percent, threshold) {
  return percent >= threshold ? "over" : percent >= threshold - 10 ? "near" : "";
}

function quotaBar(usage, threshold) {
  const wrap = el("div", { class: "quota" });
  if (!usage) {
    wrap.append(el("div", { class: "quota-text" }, el("span", { text: "首次使用后才能获取流量额度" })));
    return wrap;
  }
  if (usage.unlimited) {
    wrap.append(el("div", { class: "quota-text" }, el("span", { text: "不限流量" })));
    return wrap;
  }
  const limit = usage.limit_bytes || 0;
  const used = limit - (usage.remaining_bytes || 0);
  const percent = usagePercent(usage) ?? 0;
  const fill = el("div", { class: "quota-fill " + levelClass(percent, threshold) });
  fill.style.width = percent.toFixed(1) + "%";
  const mark = el("div", { class: "quota-mark", title: `使用量达到 ${threshold}% 时切换账户` });
  mark.style.left = Math.min(100, threshold) + "%";
  wrap.append(
    el("div", { class: "quota-bar" }, fill, mark),
    el("div", { class: "quota-text" },
      el("span", { text: `${gib(used)} / ${gib(limit)} GiB · ${percent.toFixed(0)}%` }),
      el("span", { text: usage.reset_at ? `于 ${formatDate(usage.reset_at)} 重置` : "" })),
  );
  return wrap;
}

const STATUS_LABELS = {
  ready: "可用",
  reserved: "已达到切换阈值",
  reauth_required: "需要登录",
  unavailable: "暂不可用",
  disabled: "已禁用",
};
const PHASE_LABELS = { running: "已连接", waiting: "等待中", starting: "启动中", error: "错误", off: "已关闭" };

// statusLabel names an account's status; a reserved account whose quota
// is spent says so instead of "已达到切换阈值".
function statusLabel(account, status = account.status) {
  if (status === "reserved" && account.reason_code === "quota_exhausted") return "流量额度已用尽";
  return STATUS_LABELS[status] || status;
}

// placeName names where the proxy leaves from. Mozilla's recommended
// location names no place, so the public IP check's city and country are
// used for it when known.
function placeName(proxy, exit = state.status && state.status.exit) {
  if (!proxy) return "";
  if ((proxy.country_code || "").toUpperCase() === "REC") {
    if (!exit || !exit.country_code) return "推荐位置";
    const country = countryName(exit.country_code) || exit.country_name;
    return [country, exit.city].filter(Boolean).join(" · ") + "（推荐）";
  }
  const country = countryName(proxy.country_code) || proxy.country_name || "";
  const city = proxy.city_name && proxy.city_name !== country && proxy.city_name !== proxy.country_name ? proxy.city_name : "";
  return [country, city].filter(Boolean).join(" · ");
}

function locationName(loc) {
  return loc.recommended ? "推荐位置（任播）" : countryName(loc.code) || loc.name;
}

// Secret fields. The SOCKS5 password, the new dashboard password, and the
// Firefox Account password are text fields masked with CSS (class
// "secret"), not type=password, so the browser's password manager neither
// offers saved passwords nor a generated one for them; browsers without
// -webkit-text-security fall back to type=password. Every secret, the login
// page's too, gets a button that shows and hides it.
const TEXT_SECURITY = CSS.supports("-webkit-text-security", "disc");

function setupSecrets() {
  for (const input of document.querySelectorAll("input[data-reveal]")) {
    if (input.classList.contains("secret") && !TEXT_SECURITY) input.type = "password";
    const toggle = el("button", { type: "button", class: "reveal" });
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      setRevealed(input, !input.dataset.revealed);
      input.focus();
    });
    const wrap = el("span", { class: "secret-wrap" });
    input.replaceWith(wrap);
    wrap.append(input, toggle);
    setRevealed(input, false);
  }
}

function setRevealed(input, shown) {
  input.dataset.revealed = shown ? "1" : "";
  if (input.classList.contains("secret") && TEXT_SECURITY) input.classList.toggle("revealed", shown);
  else input.type = shown ? "text" : "password";
  const toggle = input.nextElementSibling;
  toggle.title = shown ? "隐藏" : "显示";
  toggle.setAttribute("aria-label", shown ? "隐藏密码" : "显示密码");
  toggle.replaceChildren(icon(shown ? "eye-off" : "eye"));
}

// hideSecrets masks every secret in root again.
function hideSecrets(root) {
  for (const input of root.querySelectorAll("input[data-reveal]")) setRevealed(input, false);
}

// The public IP is the address websites see: Mozilla's exit, as reported
// by the public IP check, IPv4 and IPv6 separately (api-ipv4/api-ipv6.ip.sb,
// else Cloudflare's trace). Sites reachable over IPv6 see the IPv6 one.
const REGION_NAMES = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["zh-CN"], { type: "region" }) : null;

function countryName(code) {
  try {
    return (REGION_NAMES && code && REGION_NAMES.of(code.toUpperCase())) || code || "";
  } catch {
    return code || "";
  }
}

// ipPlace describes where a public IP is: "Brussels, Belgium · Network".
function ipPlace(country, city, network) {
  const where = [city, countryName(country)].filter(Boolean).join(", ");
  return [where, network].filter(Boolean).join(" · ");
}

// ipChip is the hero's public IP: flag and the IPv4 address (IPv6 without
// one); the place is in the hero's title and the chip's tooltip.
function ipChip(exit) {
  const ip = exit.ipv4 || exit.ipv6;
  const both = [exit.ipv4 && `IPv4 ${exit.ipv4}`, exit.ipv6 && `IPv6 ${exit.ipv6}`].filter(Boolean).join(", ");
  return el("span", {
    class: "chip copy ip-chip",
    title: `公网 IP（网站看到的地址）：${both}（${ipPlace(exit.country_code, exit.city, exit.network)}）。点击复制。`,
    onclick: () => copyText(ip),
  }, flag(exit.country_code), el("span", { class: "muted", text: "公网 IP" }), ip);
}

// ipBox is the connection test's public IPv4 and IPv6 address with their
// place; a click on an address copies it.
function ipBox(ipv4, ipv6, country, city, network) {
  const row = (family, ip) => el("div", { class: "ip-row", title: "点击复制", onclick: () => copyText(ip) },
    el("span", { class: "ip-family", text: family }), el("span", { class: "ip-addr", text: ip }));
  return el("div", { class: "ip-box" },
    flag(country),
    el("div", { class: "ip-text" },
      el("div", { class: "ip-label", text: "公网 IP · 网站看到的地址" }),
      ipv4 ? row("IPv4", ipv4) : null,
      ipv6 ? row("IPv6", ipv6) : null,
      el("div", { class: "muted small", text: ipPlace(country, city, network) })));
}

// flag returns the bundled flag of a two-letter country code, or a badge
// for the recommended location and unknown codes.
function flag(code, recommended = false) {
  code = (code || "").toUpperCase();
  if (recommended || code === "REC") return el("span", { class: "flag rec", title: "推荐" }, icon("star"));
  if (!/^[A-Z]{2}$/.test(code)) return el("span", { class: "code", text: code || "?" });
  const img = el("img", { class: "flag", src: `flags/${code.toLowerCase()}.svg`, alt: code, title: countryName(code), loading: "lazy" });
  img.addEventListener("error", () => img.replaceWith(el("span", { class: "code", text: code })));
  return img;
}

// ------------------------------------------------------------- theming

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("#theme-toggle").replaceChildren(icon(theme === "dark" ? "sun" : "moon"));
}

function initTheme() {
  let theme = null;
  try { theme = localStorage.getItem("fvpn-theme"); } catch { /* storage unavailable */ }
  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  applyTheme(theme);
}

$("#theme-toggle").addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem("fvpn-theme", next); } catch { /* storage unavailable */ }
});

// ------------------------------------------------------------ navigation

function showView(name) {
  if (!document.getElementById("view-" + name)) name = "overview";
  state.view = name;
  if (location.hash !== "#" + name) history.replaceState(null, "", "#" + name);
  for (const item of document.querySelectorAll(".nav-item")) item.classList.toggle("active", item.dataset.view === name);
  for (const view of document.querySelectorAll(".view")) view.hidden = view.id !== "view-" + name;
  const [title, sub] = PAGES[name];
  $("#page-title").textContent = title;
  $("#page-sub").textContent = sub;
  $("#page-sub").hidden = !sub;
  document.title = `${title} · Arman VPN`;
  if (name === "settings") loadSettings().catch(reportError);
  if (name === "accounts") loadAccounts().catch(reportError);
  if (name === "locations") loadLocations().catch(reportError);
  if (name === "logs") renderLogs(true);
  syncConnections();
  if (name === "help") renderHelp();
}

// --------------------------------------------------------------- session

async function checkSession() {
  const info = await api("GET", "/api/session");
  $("#logout").hidden = !info.login_required;
  if (!info.authenticated) {
    showLogin(info.app_only);
    return false;
  }
  $("#login-view").hidden = true;
  $("#app").hidden = false;
  return true;
}

// The warnings above every page: a dashboard without a password, and a
// proxy open to the network without one, each with a button to the field.
function renderWarnings(s) {
  const warnings = [];
  if (!s.dashboard.login_required) {
    warnings.push([s.dashboard.exposed_without_login
      ? "此控制台允许其他设备访问，且尚未设置密码。"
      : "此控制台尚未设置密码保护。",
    "设置密码", "set-dashboard", 'input[name="dashboard.username"]']);
  }
  if (s.dashboard.socks_exposed_without_login) {
    warnings.push(["此代理允许其他设备连接，且尚未设置密码。",
      "设置登录凭据", "set-local", 'input[name="proxy.username"]']);
  }
  const banner = $("#banner");
  banner.hidden = warnings.length === 0;
  // Rebuilt only when it changes: the status is read every few seconds.
  const key = warnings.map((w) => w[0]).join("|");
  if (banner.dataset.key === key) return;
  banner.dataset.key = key;
  banner.replaceChildren(...warnings.map(([text, action, section, field]) =>
    el("div", { class: "banner-row" },
      icon("alert"),
      el("span", { text }),
      el("button", { type: "button", class: "btn sm", text: action, onclick: () => openSettingsSection(section, field) }))));
}

// Opens Settings at a section and puts the cursor in a field there.
function openSettingsSection(section, field) {
  showView("settings");
  setTimeout(() => {
    const target = document.getElementById(section);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    const input = field && document.querySelector(`#settings-form ${field}`);
    if (input) input.focus({ preventScroll: true });
  }, 400);
}

// appOnly: no password exists (the phone); only the app's sign-in link
// opens the dashboard, so the form gives way to that hint.
function showLogin(appOnly = false) {
  $("#app").hidden = true;
  $("#login-view").hidden = false;
  for (const node of $("#login-form").querySelectorAll("input, button, label")) node.hidden = appOnly;
  $("#login-error").textContent = appOnly ? "请在应用中打开网页控制台（关于 → 网页控制台），即可自动登录。" : "";
  stopPolling();
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  $("#login-error").textContent = "";
  try {
    await api("POST", "/api/session", { username: form.username.value, password: form.password.value });
    form.password.value = "";
    await start();
  } catch (error) {
    $("#login-error").textContent = tError(error.message);
  }
});

$("#logout").addEventListener("click", async () => {
  try { await api("DELETE", "/api/session"); } catch { /* ignore */ }
  showLogin();
});

// ---------------------------------------------------------------- status

async function loadStatus() {
  state.status = await api("GET", "/api/status");
  state.threshold = state.status.switch_threshold_percent || 95;
  renderStatus();
}

function renderStatus() {
  const s = state.status;
  if (!s) return;
  const phase = s.state.phase;
  const label = PHASE_LABELS[phase] || phase;

  $("#version-tag").textContent = s.version ? `Arman VPN ${s.version}` : "";
  const pill = $("#state-pill");
  const asleep = phase === "running" && s.proxy && s.proxy.sleeping_since;
  // A sleeping proxy has its own look everywhere: it is not connected.
  const look = asleep ? "sleeping" : phase;
  pill.className = "pill " + look;
  pill.textContent = asleep ? "休眠中" : label;
  $("#mini-status").className = "mini-status " + look;
  // The recommended location shows the flag of the country it leaves from.
  const placeCode = s.proxy && (s.proxy.country_code || "").toUpperCase() === "REC" && s.exit && s.exit.country_code ? s.exit.country_code : s.proxy && s.proxy.country_code;
  $("#mini-flag").replaceChildren(...(s.proxy ? [flag(placeCode)] : []), el("span", { class: "dot" }));
  $("#hero-flag").replaceChildren(...(phase === "running" && s.proxy ? [flag(placeCode)] : []));
  $("#mini-title").textContent = asleep ? "休眠中" : label;
  $("#mini-sub").textContent = s.proxy ? (asleep ? "使用时唤醒 · " : "") + placeName(s.proxy) : tMessage(s.state.message);

  renderWarnings(s);

  const needSignIn = (s.accounts.reauth_required || 0) + (s.accounts.unavailable || 0);
  $("#nav-accounts-badge").hidden = needSignIn === 0;
  $("#nav-accounts-badge").textContent = String(needSignIn);

  // Hero.
  $("#hero-pulse").className = "pulse " + look;
  const sleeping = asleep;
  $("#hero-eyebrow").textContent = sleeping ? "休眠中：下次连接时自动唤醒" : phase === "running" ? "已通过 Mozilla VPN 连接" : "代理状态";
  $("#hero-title").textContent = phase === "running" ? placeName(s.proxy) || "已连接" : label;
  let message = phase === "running" ? (s.proxy ? s.proxy.upstream : "") : tMessage(s.state.message);
  if (s.state.retry_at && phase !== "running") message += ` · 下次尝试：${relative(s.state.retry_at)}`;
  if (s.pass && s.pass.last_error) message += ` · 上次续期失败：${tError(s.pass.last_error)}`;
  if (phase === "off") message = "代理已关闭：监听端口已关闭，不会连接 Mozilla。可在此处或应用中重新开启。";
  if (sleeping) message = `自 ${relative(s.proxy.sleeping_since)} 起未通过 Mozilla 建立连接：会话已关闭，账户未被占用。下次连接、连接测试或实际延迟测试将在几秒内将其唤醒。`;
  $("#hero-message").textContent = message;
  const chips = $("#hero-chips");
  chips.replaceChildren();
  if (s.proxy) {
    // Node.append writes null as the text "null"; leave absent chips out.
    chips.append(...[
      el("span", { class: "chip copy", title: "复制代理地址（SOCKS5 和 HTTP）", onclick: () => copyText(s.proxy.listen) }, icon("copy"), "代理 " + s.proxy.listen),
      s.proxy.login_required ? el("span", { class: "chip ok", title: "客户端需要填写 SOCKS5 用户名和密码" }, icon("lock"), "需要身份验证") : null,
      el("span", { class: "chip accent", text: { h3: "HTTP/3 · QUIC", h1: "HTTP/1.1 · TLS" }[s.proxy.transport] || "HTTP/2 · TLS" }),
      s.exit ? ipChip(s.exit) : null,
    ].filter(Boolean));
  }
  if (s.upstream_proxy) chips.append(el("span", { class: "chip ok", title: `Connections to Mozilla go through ${s.upstream_proxy}` }, icon("lan"), "Upstream proxy on"));
  $("#run-test").disabled = phase !== "running" || state.testing;
  $("#power span").textContent = phase === "off" ? "开启" : "关闭";
  $("#power").classList.toggle("primary", phase === "off");
  $("#restart-proxy").disabled = phase === "off";

  // KPIs.
  const active = s.active_account;
  const percent = active ? usagePercent(active.usage) : null;
  const gauge = $("#gauge-fill");
  const circumference = 2 * Math.PI * 17;
  gauge.setAttribute("stroke-dasharray", `${((percent ?? 0) / 100) * circumference} ${circumference}`);
  gauge.setAttribute("class", "gauge-fill " + (percent === null ? "" : levelClass(percent, state.threshold)));
  $("#kpi-usage").textContent = percent === null ? (active && active.usage && active.usage.unlimited ? "∞" : "–") : `${percent.toFixed(0)}%`;
  $("#kpi-usage-sub").textContent = active ? active.name : s.accounts.total ? "当前无使用中的账户" : "添加账户以开始使用";
  $("#kpi-account").title = s.accounts.total ? `${s.accounts.total} 个账户中有 ${s.accounts.ready || 0} 个可用 · 当前账户使用量达到 ${state.threshold}% 时切换到下一个` : "";
  const test = s.last_test;
  $("#kpi-latency").textContent = test && test.ok ? `${test.total_ms} ms` : "–";
  $("#kpi-latency-sub").textContent = test ? (test.ok ? `测试于 ${relative(test.at)}` : "上次测试失败") : "运行连接测试";
  renderSpeed(s.traffic);
  $("#kpi-uptime-label").textContent = asleep ? "已休眠" : "运行时长";
  $("#kpi-uptime").textContent = s.proxy ? duration(asleep ? s.proxy.sleeping_since : s.proxy.started_at) : "–";
  $("#kpi-uptime-sub").textContent = asleep ? `无活动会话 · 累计运行 ${duration(s.proxy.started_at)}`
    : s.pass && s.pass.proxy_pass_expires_at ? `通行证续期时间：${relative(s.pass.proxy_pass_expires_at)}` : "";

  // Active account card.
  const box = $("#active-account");
  box.replaceChildren();
  if (active) {
    box.append(
      el("div", { class: "account-hero" },
        el("div", { class: "avatar", text: (active.name || "?").charAt(0).toUpperCase() }),
        el("div", {},
          el("div", { class: "account-name", text: active.name }),
          el("div", { class: "account-meta" },
            el("span", { class: "chip " + active.status, text: statusLabel(active) }),
            active.email && active.email !== active.name ? el("span", { text: active.email }) : null))),
      quotaBar(active.usage, state.threshold),
    );
  } else {
    box.append(el("p", { class: "muted", text: s.accounts.total ? "目前没有正在使用的账户。" : "尚未添加账户，请前往“账户”页面添加。" }));
  }

  // Proxy facts.
  const facts = $("#proxy-facts");
  facts.replaceChildren();
  if (s.proxy) {
    fact(facts, "SOCKS5", s.proxy.listen + (s.proxy.login_required ? "（需要用户名和密码）" : ""), true);
    fact(facts, "位置", placeName(s.proxy) || "未知");
    fact(facts, "服务器", s.proxy.upstream, true);
    fact(facts, "选择方式", selectionLabel(s.proxy.selection_source));
    fact(facts, "启动时间", formatTime(s.proxy.started_at));
  } else {
    fact(facts, "状态", tMessage(s.state.message));
  }
  if (s.pass) fact(facts, "代理通行证", `${s.pass.accepting ? "有效" : "不接受新连接"}，将在 ${formatTime(s.pass.proxy_pass_expires_at)} 前续期`);
  fact(facts, "数据文件夹", s.data_dir, true);

  renderNotices(s.notices);
  renderTest(test);
  renderRecentLog();
}

// Notices explain requests refused in the last five minutes because of a
// limit (a port Mozilla's proxy refuses, UDP); the server sends only those.
// Each one shows the latest destinations and can be closed on its own;
// closing hides it until the next refusal of the same kind.
const NOTICE_TEXT = {
  port: (n) => [`Mozilla 代理拒绝了 ${n.detail} 端口`, "此代理仅支持连接 80、443、8080 和 8443 端口，使用其他端口的网站无法通过它访问。", "help-ports"],
  command: (n) => [`某个应用请求了 ${n.detail}`, "This type of connection isn't supported by the VPN.", "help-udp"],
  loop: () => ["程序自身的连接被重新送回了代理", "其他程序将本程序的流量转回此代理，导致连接循环。在 PassWall2 中，请关闭“本机代理（Localhost Proxy）”。", "help-loop"],
};

function noticeKey(n) {
  return `${n.kind}:${n.detail}`;
}

function noticesClosed() {
  try {
    return JSON.parse(localStorage.getItem("fvpn-notices-closed") || "{}") || {};
  } catch {
    return {};
  }
}

function closeNotice(n) {
  const closed = noticesClosed();
  closed[noticeKey(n)] = n.last;
  try { localStorage.setItem("fvpn-notices-closed", JSON.stringify(closed)); } catch { /* storage unavailable */ }
  renderNotices(state.status && state.status.notices);
}

function renderNotices(notices) {
  const box = $("#notices");
  const closed = noticesClosed();
  const shown = (notices || []).filter((n) => NOTICE_TEXT[n.kind] && Date.parse(n.last) > (Date.parse(closed[noticeKey(n)]) || 0));
  box.hidden = shown.length === 0;
  box.replaceChildren(...shown.slice(0, 3).map((n) => {
    const [title, text, anchor] = NOTICE_TEXT[n.kind](n);
    const times = n.count > 1 ? `${n.count} 次，最近一次：${relative(n.last)}` : relative(n.last);
    const hosts = n.hosts && n.hosts.length ? el("div", { class: "notice-hosts" },
      el("span", { class: "muted", text: n.hosts.length > 1 ? "目标地址：" : "目标地址：" }),
      ...n.hosts.map((h) => el("code", { text: n.kind === "port" ? hostPort(h, n.detail) : h }))) : null;
    return el("div", { class: "notice" },
      icon("alert"),
      el("div", { class: "notice-body" },
        el("div", {}, el("strong", { text: title }), el("span", { class: "muted", text: ` · ${times}` })),
        hosts,
        el("div", { class: "muted" }, text + " ",
          el("a", { href: "#help", onclick: (event) => { event.preventDefault(); openHelp(anchor); }, text: "帮助" }))),
      el("button", { type: "button", class: "btn ghost icon sm notice-close", title: "隐藏", "aria-label": "隐藏此提示", onclick: () => closeNotice(n) },
        el("span", { text: "×" })));
  }));
}

// hostPort joins a destination and port, with brackets for IPv6.
function hostPort(host, port) {
  return host.includes(":") ? `[${host}]:${port}` : `${host}:${port}`;
}

// Routing settings: the rule lists are textareas (one rule per line) and
// the update interval is edited in days.
function fillRoutingFields(routing) {
  $("#routing-direct").value = (routing.direct || []).join("\n");
  $("#routing-block").value = (routing.block || []).join("\n");
  const hours = parseInt((String(routing.update_interval || "").match(/(\d+)h/) || [])[1] || "240", 10);
  $("#routing-days").value = Math.max(1, Math.round(hours / 24));
  syncAdsSwitch();
}

// "Block ads" is a shortcut for one Block rule, which the list shows too.
const ADS_RULE = "geosite:category-ads-all";

function blockLines() {
  return $("#routing-block").value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function syncAdsSwitch() {
  $("#routing-ads").checked = blockLines().some((rule) => rule.toLowerCase() === ADS_RULE);
}

$("#routing-ads").addEventListener("change", (event) => {
  const others = blockLines().filter((rule) => rule.toLowerCase() !== ADS_RULE);
  $("#routing-block").value = (event.target.checked ? [...others, ADS_RULE] : others).join("\n");
});
$("#routing-block").addEventListener("input", syncAdsSwitch);

function routingFromForm(config) {
  const lines = (selector) => $(selector).value.split("\n").map((line) => line.trim()).filter(Boolean);
  config.routing = config.routing || {};
  config.routing.direct = lines("#routing-direct");
  config.routing.block = lines("#routing-block");
  const days = Math.min(365, Math.max(1, parseInt($("#routing-days").value, 10) || 10));
  config.routing.update_interval = `${days * 24}h`;
}

async function loadRoutingStatus() {
  renderRoutingStatus(await api("GET", "/api/routing"));
}

function renderRoutingStatus(view) {
  state.regionRules = view.region_rules || [];
  renderSourceSelect(view.sources || []);
  const [label, cls, note] = !view.enabled ? ["已关闭", "", "所有流量均通过 Mozilla"]
    : view.active ? ["已开启", "ok", ""]
    : ["未生效", "bad", `所有流量均通过 Mozilla：${tError(view.error) || "规则文件正在加载"}`];
  // Node.replaceChildren writes null as the text "null"; leave it out.
  $("#routing-state").replaceChildren(...[
    el("span", { class: `chip ${cls}`, text: view.updating ? "下载中…" : label }),
    note ? el("span", { class: "muted small", text: note }) : null,
  ].filter(Boolean));
  const files = view.files || [];
  // The oldest file says when the files were last brought up to date.
  const oldest = files.map((f) => validDate(f.updated_at)).filter(Boolean).sort((a, b) => a - b)[0];
  $("#routing-files").replaceChildren(...[
    files.length
      ? el("span", { text: `更新于 ${relative(oldest)}` })
      : el("span", { text: "尚未下载" }),
    files.length ? el("span", { class: "muted", text: files.map((f) => `${f.name} ${(f.size / 1048576).toFixed(1)} MB`).join(" · ") }) : null,
    view.last_error ? el("span", { class: "form-error", text: `上次更新失败：${tError(view.last_error)}` }) : null,
  ].filter(Boolean));
}

// The list source fills the two URL fields; URLs typed by hand make it
// "Set by hand".
function renderSourceSelect(sources) {
  state.listSources = sources;
  const select = $("#routing-source");
  if (select.options.length !== sources.length + 1) {
    select.replaceChildren(el("option", { value: "", text: "手动设置（使用下方网址）" }), ...sources.map((s) => el("option", { value: s.id, text: s.name })));
  }
  syncSourceSelect();
}

function syncSourceSelect() {
  const site = $('#settings-form input[name="routing.geosite_url"]').value.trim();
  const ip = $('#settings-form input[name="routing.geoip_url"]').value.trim();
  const match = (state.listSources || []).find((s) => s.geosite_url === site && s.geoip_url === ip);
  $("#routing-source").value = match ? match.id : "";
}

$("#routing-source").addEventListener("change", (event) => {
  const src = (state.listSources || []).find((s) => s.id === event.target.value);
  if (!src) return;
  $('#settings-form input[name="routing.geosite_url"]').value = src.geosite_url;
  $('#settings-form input[name="routing.geoip_url"]').value = src.geoip_url;
  updateDirty();
});
for (const name of ["routing.geosite_url", "routing.geoip_url"]) {
  $(`#settings-form input[name="${name}"]`).addEventListener("input", syncSourceSelect);
}

// Restore puts the saved region's rules back at the top of the Direct
// list, keeping the user's own; Save settings applies it.
$("#routing-restore").addEventListener("click", () => {
  const box = $("#routing-direct");
  const presets = state.regionRules || [];
  const seen = new Set(presets.map((rule) => rule.toLowerCase()));
  const own = box.value.split("\n").map((line) => line.trim()).filter((line) => line && !seen.has(line.toLowerCase()));
  box.value = [...presets, ...own].join("\n");
  updateDirty();
  toast("已恢复该国家或地区的规则，请保存设置以应用");
});

// The destination test asks the service where a destination goes.
const ROUTE_LABELS = { direct: ["直连", "ok"], proxy: ["通过 Mozilla", "accent"], block: ["已拦截", "bad"] };

async function testDestination() {
  const box = $("#route-test-result");
  const target = $("#route-target").value.trim();
  if (!target) return;
  await busy($("#route-test"), "测试中…", async () => {
    try {
      const r = await api("POST", "/api/routing/test", { target });
      const [label, cls] = ROUTE_LABELS[r.route] || [r.route, ""];
      const where = r.port ? hostPort(r.host, r.port) : r.host;
      const why = r.rule ? `匹配规则：${r.rule}` : tMessage(r.note) || "未匹配任何规则";
      // Node.replaceChildren writes null as the text "null"; leave it out.
      box.replaceChildren(...[
        el("span", { class: `chip ${cls}`, text: label }),
        el("code", { text: where }),
        el("span", { class: "muted", text: why + (r.resolved ? `（通过 Mozilla 解析：${r.resolved}）` : "") }),
        r.port_refused ? el("span", { class: "warn-line", text: `Mozilla 代理不支持连接 ${r.port} 端口；仅支持 80、443、8080 和 8443。为此目标添加直连规则后即可访问。` }) : null,
      ].filter(Boolean));
    } catch (error) {
      box.replaceChildren(el("span", { class: "form-error", text: tError(error.message) }));
    }
  });
}

$("#route-test").addEventListener("click", testDestination);
$("#route-target").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault(); // not the settings form's submit
    testDestination();
  }
});

$("#routing-update").addEventListener("click", (event) => busy(event.currentTarget, "下载中…", async () => {
  try {
    renderRoutingStatus(await api("POST", "/api/routing/update"));
    toast("分流规则列表已更新");
  } catch (error) {
    reportError(error);
    loadRoutingStatus().catch(() => {});
  }
}));

// The Help page's connection card shows the SOCKS5 address and a share
// link (socks://base64(user:password)@host:port#name, as v2rayN and v2rayNG
// export it) built from the settings. A proxy listening on all addresses is
// shown with the address this dashboard was opened at.
async function renderHelp() {
  let proxy = state.settings && state.settings.config.proxy;
  if (!proxy) {
    try {
      proxy = (await api("GET", "/api/settings")).config.proxy;
    } catch {
      return;
    }
  }
  const listen = proxy.listen || "127.0.0.1:10810";
  const cut = listen.lastIndexOf(":");
  let host = listen.slice(0, cut).replace(/^\[|\]$/g, "");
  const port = listen.slice(cut + 1);
  if (host === "" || host === "0.0.0.0" || host === "::") {
    host = ["localhost", "127.0.0.1", "[::1]", ""].includes(location.hostname) ? "127.0.0.1" : location.hostname.replace(/^\[|\]$/g, "");
  }
  const hostPart = host.includes(":") ? `[${host}]` : host;
  const address = `${hostPart}:${port}`;
  const userinfo = base64(`${proxy.username || ""}:${proxy.password || ""}`).replace(/=+$/, "");
  const link = `socks://${userinfo}@${address}#${encodeURIComponent("Arman VPN")}`;
  $("#help-socks-addr").textContent = address;
  // The password stays out of sight; the copied link has it.
  $("#help-socks-link").textContent = proxy.password ? `socks://…@${address}#Arman VPN` : `socks://${userinfo}@${address}#Arman VPN`;
  $("#help-copy-addr").onclick = () => copyText(address);
  $("#help-copy-link").onclick = () => copyText(link, "链接");
}

function base64(text) {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function openHelp(anchor) {
  showView("help");
  const target = document.getElementById(anchor);
  if (target) {
    target.scrollIntoView({ block: "start", behavior: "smooth" });
    target.classList.add("flash");
    setTimeout(() => target.classList.remove("flash"), 1600);
  }
}

// renderSpeed shows the current speed (averaged by the server over the
// last seconds) and what was transferred since the proxy started.
function renderSpeed(traffic) {
  if (!traffic) {
    $("#kpi-down").textContent = "–";
    $("#kpi-speed-sub").textContent = "";
    return;
  }
  $("#kpi-down").textContent = formatRate(traffic.down_rate);
  const total = `${formatBytes(traffic.down + traffic.direct_down)} ↓ ${formatBytes(traffic.up + traffic.direct_up)} ↑`;
  const direct = traffic.direct_down + traffic.direct_up;
  const sub = $("#kpi-speed-sub");
  sub.replaceChildren(el("span", { class: "speed-up", text: `↑ ${formatRate(traffic.up_rate)}` }), ` · ${total}`);
  sub.title = `代理启动以来：通过 Mozilla 下载 ${formatBytes(traffic.down)}，上传 ${formatBytes(traffic.up)}` +
    (direct ? `；通过直连分流下载 ${formatBytes(traffic.direct_down)}，上传 ${formatBytes(traffic.direct_up)}` : "");
}

function formatBytes(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes || 0;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function formatRate(bytesPerSecond) {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function renderTest(result) {
  const box = $("#test-result");
  $("#test-when").textContent = result ? relative(result.at) : "";
  if (!result) return;
  box.replaceChildren();
  if (!result.ok) {
    box.append(el("div", { class: "test-head" }, el("span", { class: "chip bad", text: "失败" })), el("p", { class: "muted", text: tError(result.error) }));
    return;
  }
  const total = Math.max(1, result.total_ms);
  const segment = (cls, ms) => {
    const div = el("div", { class: cls, title: `${ms} ms` });
    div.style.width = ((ms / total) * 100).toFixed(1) + "%";
    return div;
  };
  const tunnel = result.tunnel_ms || 0;
  const tls = result.tls_ms || 0;
  const response = result.response_ms ?? Math.max(0, (result.first_byte_ms || 0) - tunnel - tls);
  const stage = (cls, name, ms, title) => el("span", { title }, el("i", { class: cls }), `${name} ${ms} ms`);
  box.replaceChildren(...[
    el("div", { class: "test-head" },
      el("span", { class: "test-total", text: `${result.total_ms} ms` }),
      el("span", { class: "chip ok", text: `HTTP ${result.http_status}` })),
    el("div", { class: "timeline" }, segment("t-tunnel", tunnel), segment("t-tls", tls), segment("t-first", response)),
    el("div", { class: "legend" },
      stage("t-tunnel", "隧道", tunnel, "通过 Mozilla 代理服务器建立隧道"),
      stage("t-tls", "TLS", tls, "与测试网站进行加密握手"),
      stage("t-first", "响应", response, "从发出请求到收到响应首字节的时间")),
    result.exit_ipv4 || result.exit_ipv6 ? ipBox(result.exit_ipv4, result.exit_ipv6, result.exit_country, result.exit_city, result.exit_network) : null,
    result.exit_error ? el("p", { class: "muted small", text: `公网 IP 检测：${tError(result.exit_error)}` }) : null,
  ].filter(Boolean));
}

$("#run-test").addEventListener("click", async (event) => {
  const node = event.currentTarget;
  state.testing = true;
  try {
    const result = await busy(node, "测试中…", () => api("POST", "/api/test"));
    renderTest(result);
    toast(result.ok ? `连接成功，耗时 ${result.total_ms} 毫秒` : "连接测试失败", !result.ok);
    loadStatus().catch(reportError);
  } catch (error) {
    reportError(error);
  } finally {
    state.testing = false;
  }
});

// Off closes the proxy's port and stops using Mozilla (the app's power
// button does the same); on starts it again.
$("#power").addEventListener("click", async () => {
  const on = Boolean(state.status && state.status.state.phase === "off");
  try {
    await api("POST", "/api/power", { on });
    toast(on ? "正在开启代理" : "代理已关闭");
    setTimeout(() => loadStatus().catch(reportError), 800);
  } catch (error) { reportError(error); }
});

$("#restart-proxy").addEventListener("click", async () => {
  try {
    await api("POST", "/api/proxy/restart");
    toast("正在重启代理");
    setTimeout(() => loadStatus().catch(reportError), 800);
  } catch (error) { reportError(error); }
});

// -------------------------------------------------------------- accounts

async function loadAccounts() {
  const data = await api("GET", "/api/accounts");
  state.accounts = data.accounts || [];
  state.threshold = data.switch_threshold_percent || state.threshold;
  renderAccounts();
}

function renderAccounts() {
  const list = $("#account-list");
  list.replaceChildren();
  $("#accounts-hint").textContent = `账户按从上到下的顺序使用。当前账户已用流量达到额度的 ${state.threshold}% 时，将自动切换到下一个账户。`;
  if (state.accounts.length === 0) {
    list.append(el("div", { class: "card empty" }, icon("accounts"), el("strong", { text: "尚未添加账户" }), el("span", { text: "点击“添加账户”，使用 Firefox 账户登录。" })));
    return;
  }
  state.accounts.forEach((account, index) => {
    const status = account.enabled ? account.status : "disabled";
    // The active account is ready by definition: "使用中" takes the place
    // of "可用", so every row keeps its chips on one line.
    const meta = el("div", { class: "account-meta" },
      account.active && status === "ready" ? el("span", { class: "chip active", text: "使用中" }) : el("span", { class: "chip " + status, text: statusLabel(account, status) }),
      account.email && account.email !== account.name ? el("span", { text: account.email }) : null,
      account.retry_at && account.status !== "ready" ? el("span", { text: `等待至 ${formatTime(account.retry_at)}` }) : null,
    );
    const reason = account.reason ? el("div", { class: "account-meta", text: tMessage(account.reason) }) : null;
    const actions = el("div", { class: "account-actions" },
      button("", () => moveAccount(index, -1), { cls: "btn ghost icon sm", iconName: "up", title: "上移", disabled: index === 0 }),
      button("", () => moveAccount(index, 1), { cls: "btn ghost icon sm", iconName: "down", title: "下移", disabled: index === state.accounts.length - 1 }),
      // An account that must sign in again cannot be used before that.
      account.enabled && !account.active && account.status !== "reauth_required" ? button("立即使用", () => accountAction(account, "activate", "正在切换到此账户")) : null,
      button("", () => accountAction(account, "refresh", "流量额度已刷新"), { cls: "btn ghost icon sm", iconName: "refresh", title: "刷新流量额度" }),
      account.status === "reauth_required" ? button("重新登录", () => signInAgain(account), { cls: "btn sm primary" }) : null,
      button(account.enabled ? "禁用" : "启用", () => setEnabled(account, !account.enabled)),
      button("", () => removeAccount(account), { cls: "btn ghost icon sm danger", iconName: "trash", title: "移除" }),
    );
    const handle = el("div", { class: "position drag-handle", title: "拖动以调整顺序", text: String(account.position) });
    const card = el("article", { class: "card account" + (account.enabled ? "" : " inactive") + (account.active ? " is-active" : ""), "data-id": account.id },
      handle,
      el("div", { class: "account-hero" },
        el("div", { class: "avatar", text: (account.name || "?").charAt(0).toUpperCase() }),
        el("div", {}, el("div", { class: "account-name", text: account.name }), meta, reason)),
      quotaBar(account.usage, state.threshold),
      actions,
    );
    enableAccountDrag(card, handle);
    list.append(card);
  });
}

async function moveAccount(index, delta) {
  const ids = state.accounts.map((a) => a.id);
  const [moved] = ids.splice(index, 1);
  ids.splice(index + delta, 0, moved);
  await saveAccountOrder(ids);
}

async function saveAccountOrder(ids) {
  try {
    await api("POST", "/api/accounts/order", { ids });
    await loadAccounts();
  } catch (error) { reportError(error); }
}

// Drag and drop: a card is dragged by its position number (only the
// handle starts a drag, so text and buttons keep working) and dropped
// before or after another card. Phones keep the arrow buttons: browsers
// do not drag with touch.
let draggedAccount = null;

function enableAccountDrag(card, handle) {
  handle.addEventListener("pointerdown", () => { card.draggable = true; });
  card.addEventListener("dragstart", (event) => {
    draggedAccount = card.dataset.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedAccount);
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => {
    card.draggable = false;
    card.classList.remove("dragging");
    draggedAccount = null;
    for (const c of document.querySelectorAll(".account")) c.classList.remove("drop-before", "drop-after");
  });
  card.addEventListener("dragover", (event) => {
    if (!draggedAccount || draggedAccount === card.dataset.id) return;
    event.preventDefault();
    const box = card.getBoundingClientRect();
    const after = event.clientY > box.top + box.height / 2;
    card.classList.toggle("drop-after", after);
    card.classList.toggle("drop-before", !after);
  });
  card.addEventListener("dragleave", () => card.classList.remove("drop-before", "drop-after"));
  card.addEventListener("drop", (event) => {
    event.preventDefault();
    const moved = draggedAccount;
    const after = card.classList.contains("drop-after");
    card.classList.remove("drop-before", "drop-after");
    if (!moved || moved === card.dataset.id) return;
    const ids = state.accounts.map((a) => a.id).filter((id) => id !== moved);
    const at = ids.indexOf(card.dataset.id) + (after ? 1 : 0);
    ids.splice(at, 0, moved);
    saveAccountOrder(ids);
  });
}

async function accountAction(account, action, message) {
  try {
    await api("POST", `/api/accounts/${encodeURIComponent(account.id)}/${action}`);
    toast(message);
    setTimeout(() => { loadAccounts().catch(reportError); loadStatus().catch(reportError); }, 600);
  } catch (error) { reportError(error); }
}

async function setEnabled(account, enabled) {
  try {
    await api("POST", `/api/accounts/${encodeURIComponent(account.id)}/enabled`, { enabled });
    await loadAccounts();
  } catch (error) { reportError(error); }
}

async function removeAccount(account) {
  if (!confirm(`确定移除 ${account.name}？此账户已保存的登录凭据也将被删除。`)) return;
  try {
    await api("DELETE", `/api/accounts/${encodeURIComponent(account.id)}`);
    toast("账户已移除");
    await loadAccounts();
  } catch (error) { reportError(error); }
}

// ------------------------------------------------------------- locations

async function loadLocations() {
  const [data, settings] = await Promise.all([
    api("GET", "/api/locations"),
    state.settings ? Promise.resolve(state.settings) : api("GET", "/api/settings"),
  ]);
  state.settings = settings;
  state.locations = data.locations || [];
  state.pingedAt = validDate(data.pinged_at);
  state.firefoxVersion = data.firefox_version || "";
  renderLocations();
}

function currentMode() {
  const proxy = state.settings ? state.settings.config.proxy : {};
  if (proxy.server) return { kind: "server", value: proxy.server };
  const country = (proxy.country || "").trim();
  if (!country) return { kind: "recommended" };
  if (country.toLowerCase() === "fastest") return { kind: "fastest" };
  return { kind: "country", value: country };
}

function renderLocations() {
  if (!state.settings) {
    $("#mode-title").textContent = "加载中…";
    return;
  }
  const mode = currentMode();
  const running = state.status && state.status.proxy;
  const currentCode = running ? (state.status.proxy.country_code || "").toUpperCase() : "";
  const titles = {
    recommended: ["自动（推荐）", "由 Mozilla 选择服务器，与 Firefox 的默认行为相同。"],
    fastest: ["自动（最快）", "每次启动代理时，测试并选择实际延迟最低的服务器。"],
    server: [`自定义服务器 ${mode.value}`, "在“设置”中指定。"],
  };
  const match = state.locations.find((l) => mode.value && (l.code.toLowerCase() === mode.value.toLowerCase() || l.name.toLowerCase() === mode.value.toLowerCase()));
  const [title, sub] = titles[mode.kind] || [`手动选择：${match ? locationName(match) : mode.value}`, "代理始终使用此服务器。"];
  $("#mode-title").textContent = title;
  $("#mode-sub").textContent = sub + (running ? ` 当前：${placeName(state.status.proxy)}。` : "");
  $("#mode-recommended").classList.toggle("current", mode.kind === "recommended");
  $("#mode-fastest").classList.toggle("current", mode.kind === "fastest");

  $("#serverlist-note").textContent = state.firefoxVersion ? `服务器列表与最新版 Firefox ${state.firefoxVersion} 保持一致，自动更新。` : "";
  $("#ping-note").textContent = state.pingedAt
    ? `实际延迟测试于 ${relative(state.pingedAt)}：使用当前账户经各服务器访问 www.google.com 的耗时，涵盖到出口的完整路径。“测试实际延迟”会检查所有服务器。`
    : "测试实际延迟以比较服务器。将使用当前账户，通过隧道逐一测试（代理必须处于运行状态），耗时约数秒至一分钟。";

  const query = $("#location-search").value.trim().toLowerCase();
  // Every location is listed: Mozilla's servers accept every account on
  // all of them, including those its server list marks locked.
  let rows = state.locations.filter((l) => (!query || l.name.toLowerCase().includes(query) || l.code.toLowerCase().includes(query) || locationName(l).toLowerCase().includes(query)));
  rows = rows.slice().sort((a, b) => {
    if (state.sort === "latency") {
      const pa = a.ping_ms || Infinity;
      const pb = b.ping_ms || Infinity;
      if (pa !== pb) return pa - pb;
    }
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  const measured = state.locations.filter((l) => l.ping_ms).map((l) => l.ping_ms);
  const worst = Math.max(1, ...measured);
  const best = measured.length ? Math.min(...measured) : 0;

  const body = $("#location-table tbody");
  body.replaceChildren();
  if (rows.length === 0) {
    body.append(el("tr", {}, el("td", { colspan: "4", class: "muted", text: state.locations.length ? "没有匹配的位置。" : "服务器列表尚未加载。" })));
    return;
  }
  let rank = 0;
  for (const loc of rows) {
    const isCurrent = loc.code === currentCode;
    let latency;
    if (loc.ping_ms) {
      rank++;
      const bar = el("div", { class: loc.ping_ms > best * 2.5 ? "slow" : loc.ping_ms > best * 1.5 ? "mid" : "" });
      bar.style.width = Math.max(4, (loc.ping_ms / worst) * 100).toFixed(0) + "%";
      latency = el("div", { class: "latency" },
        state.sort === "latency" ? el("span", { class: "rank", text: "#" + rank }) : null,
        el("div", { class: "latency-bar" }, bar),
        el("span", { class: "latency-ms", text: `${loc.ping_ms} ms` }));
    } else {
      // A location that did not answer is grey, not red: nothing is broken
      // here; the reason is on hover.
      latency = el("span", { class: "muted small", text: loc.ping_error ? "无响应" : "未测试", title: tError(loc.ping_error) });
    }
    const action = isCurrent
      ? el("span", { class: "chip active", text: "使用中" })
      : button("使用", () => chooseLocation(loc.code, locationName(loc)));
    body.append(el("tr", { class: isCurrent ? "current" : "" },
      el("td", {}, el("div", { class: "loc" }, flag(loc.code, loc.recommended), el("div", { class: "loc-name", text: locationName(loc) }))),
      el("td", { class: "hide-sm mono muted", text: loc.server || "" }),
      el("td", {}, latency),
      el("td", { class: "actions-cell" }, action),
    ));
  }
}

async function chooseLocation(country, label) {
  try {
    await api("POST", "/api/location", { country });
    toast(`服务器已设为：${label}。代理将重启。`);
    state.settings = null;
    await loadLocations();
    setTimeout(() => loadStatus().then(renderLocations).catch(reportError), 1500);
  } catch (error) { reportError(error); }
}

$("#measure").addEventListener("click", async (event) => {
  const node = event.currentTarget;
  const codes = state.locations.map((l) => l.code);
  if (codes.length === 0) { toast("没有可测试的位置", true); return; }
  try {
    const result = await busy(node, `正在测试 ${codes.length} 个位置…`, () => api("POST", "/api/locations/ping", { codes }));
    const answered = (result.locations || []).filter((l) => l.ping_ms);
    await loadLocations();
    toast(answered.length ? `${codes.length} 个位置中有 ${answered.length} 个响应；最快：${locationName(answered[0])}（${answered[0].ping_ms} 毫秒）` : "所有位置均无响应", answered.length === 0);
  } catch (error) { reportError(error); }
});

$("#mode-recommended").addEventListener("click", () => chooseLocation("", "自动（推荐）"));
$("#mode-fastest").addEventListener("click", () => chooseLocation("fastest", "自动（最快）"));
$("#location-search").addEventListener("input", () => renderLocations());
for (const seg of document.querySelectorAll(".seg[data-sort]")) {
  seg.addEventListener("click", () => {
    state.sort = seg.dataset.sort;
    for (const other of document.querySelectorAll(".seg[data-sort]")) other.classList.toggle("active", other === seg);
    renderLocations();
  });
}

// --------------------------------------------------------------- sign-in

const STEP_INPUT = {
  need_email_code: "验证码",
  need_totp: "身份验证器验证码",
  need_unblock_code: "解锁验证码",
  need_captcha: "图片中的字符",
};

// signInAgain re-signs an account with its stored password, so the dialog
// only asks for what Mozilla requests (a code); without a stored password
// it asks for the password as usual.
async function signInAgain(account) {
  if (!account.has_password) {
    openSignIn(account.email);
    return;
  }
  openSignIn(account.email);
  try {
    const view = await api("POST", "/api/signin", { account_id: account.id });
    renderSignIn(view);
    pollSignIn(view.id);
  } catch (error) {
    $("#signin-error").textContent = tError(error.message);
  }
}

// showSignInStart shows the email and password fields (true) or a step
// of the sign-in. The hidden part's fields are disabled: a hidden required
// field blocks the form's submit without a word (the browser cannot focus
// it to complain), and the password is empty in a step, since it is
// cleared once sent and "重新登录" never asks for it.
function showSignInStart(start) {
  $("#signin-start").hidden = !start;
  $("#signin-step").hidden = start;
  for (const input of $("#signin-start").querySelectorAll("input")) input.disabled = !start;
}

function openSignIn(email = "") {
  const dialog = $("#signin-dialog");
  const form = $("#signin-form");
  form.reset();
  form.email.value = email;
  state.signin = null;
  showSignInStart(true);
  $("#signin-error").textContent = "";
  $("#signin-submit").textContent = "登录";
  $("#signin-submit").hidden = false;
  $("#signin-submit").disabled = false;
  $("#signin-cancel").textContent = "取消";
  $("#signin-warning").hidden = !(state.status && state.status.dashboard.plaintext_over_network && !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname));
  hideSecrets(dialog);
  dialog.showModal();
  (email ? form.password : form.email).focus();
}

function renderSignIn(view) {
  state.signin = view;
  showSignInStart(false);
  const message = $("#signin-message");
  const captcha = $("#signin-captcha");
  const label = $("#signin-input-label");
  const submit = $("#signin-submit");
  const form = $("#signin-form");
  // What went wrong shows apart from the instruction, in red.
  $("#signin-error").textContent = view.step === "working" ? "" : tError(view.error) || "";
  message.style.display = "";
  captcha.hidden = true;
  label.hidden = true;
  submit.hidden = false;
  submit.disabled = false;

  switch (view.step) {
    case "working":
      message.replaceChildren(el("span", { class: "spinner" }), el("span", { text: signInMessage(view) || "处理中…" }));
      submit.hidden = true;
      break;
    case "need_email_link":
      message.textContent = signInMessage(view);
      submit.textContent = "我已打开链接";
      break;
    case "done":
      message.replaceChildren(el("span", { class: "chip ok", text: "已添加" }), el("span", { text: "该账户已加入列表末尾，按顺序参与轮换。" }));
      submit.hidden = true;
      $("#signin-cancel").textContent = "关闭";
      loadAccounts().catch(reportError);
      loadStatus().catch(reportError);
      break;
    case "failed":
    case "cancelled":
      // Fastly's bot check refused the sign-in: the way out is the app's
      // browser sign-in, moved over by its data folder.
      if (view.error_code === "blocked") {
        message.replaceChildren(
          el("span", { text: "Tip: sign in with the browser in the Arman VPN app, then copy that device's data folder to this machine." }),
          el("a", {
            class: "btn primary",
            style: "margin-top:10px; width:fit-content",
            href: "https://github.com/armanlife/arman-vpn-client/blob/main/docs/BROWSER-SIGNIN.md",
            target: "_blank",
            rel: "noreferrer",
            text: "How to do it",
          }),
        );
        message.style.display = "grid";
      } else {
        message.textContent = signInMessage(view);
      }
      submit.textContent = "重试";
      break;
    default:
      if (STEP_INPUT[view.step]) {
        message.textContent = signInMessage(view);
        $("#signin-input-caption").textContent = STEP_INPUT[view.step];
        label.hidden = false;
        form.value.value = "";
        if (view.step === "need_captcha" && view.captcha && view.captcha.startsWith("data:image/")) {
          captcha.src = view.captcha;
          captcha.hidden = false;
        }
        submit.textContent = "继续";
        setTimeout(() => form.value.focus(), 0);
      }
  }
}

async function pollSignIn(id) {
  while (state.signin && state.signin.id === id && $("#signin-dialog").open) {
    let view;
    try { view = await api("GET", `/api/signin/${encodeURIComponent(id)}`); } catch (error) { reportError(error); return; }
    const changed = view.step !== state.signin.step || view.message !== state.signin.message || view.captcha !== state.signin.captcha;
    if (changed) renderSignIn(view);
    if (["done", "failed", "cancelled"].includes(view.step)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

$("#add-account").addEventListener("click", () => openSignIn());

// The backup: the data folder as a zip file in the same layout (GET
// /api/backup), and adding the accounts of one (POST /api/backup/inspect,
// then /api/backup/import). The settings in a file taken in stay as they
// are here.
async function saveBackup() {
  $("#backup-menu").open = false;
  try {
    const response = await fetch("/api/backup", { credentials: "same-origin" });
    if (response.status === 401) {
      showLogin();
      return;
    }
    if (!response.ok) {
      let data = null;
      try { data = await response.json(); } catch { /* empty body */ }
      throw new ApiError(response.status, (data && data.error) || response.statusText);
    }
    const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") || "")?.[1] || "Arman-VPN-backup.zip";
    const url = URL.createObjectURL(await response.blob());
    const link = el("a", { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast(`Saved ${name}`);
  } catch (error) {
    toast(error.message, true);
  }
}

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

async function importBackup(file) {
  try {
    const data = base64(await file.arrayBuffer());
    const contents = await api("POST", "/api/backup/inspect", { data });
    const lines = contents.accounts.map((a) => `• ${a.email}${a.exists ? " (already added: it takes the file's sign-in)" : ""}`);
    if (!confirm(`Add these accounts?\n\n${lines.join("\n")}`)) return;
    const done = await api("POST", "/api/backup/import", { data });
    const count = done.added + done.updated;
    toast(count === 1 ? "1 account added" : `${count} accounts added`);
    await loadAccounts();
  } catch (error) {
    toast(error.message, true);
  }
}

$("#backup-save").addEventListener("click", saveBackup);
$("#backup-import").addEventListener("click", () => {
  $("#backup-menu").open = false;
  $("#backup-file").click();
});
$("#backup-file").addEventListener("change", (event) => {
  const file = event.target.files[0];
  event.target.value = "";
  if (file) importBackup(file);
});
// A click anywhere else closes the menu.
document.addEventListener("click", (event) => {
  const menu = $("#backup-menu");
  if (menu.open && !menu.contains(event.target)) menu.open = false;
});

$("#signin-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const current = state.signin;
  $("#signin-submit").disabled = true;
  try {
    if (!current || current.step === "failed" || current.step === "cancelled") {
      if (current) { openSignIn(current.email); return; }
      const view = await api("POST", "/api/signin", { email: form.email.value, password: form.password.value });
      form.password.value = "";
      renderSignIn(view);
      pollSignIn(view.id);
      return;
    }
    const value = current.step === "need_email_link" ? "continue" : form.value.value.trim();
    if (!value) { $("#signin-submit").disabled = false; return; }
    const view = await api("POST", `/api/signin/${encodeURIComponent(current.id)}`, { value });
    renderSignIn(view);
  } catch (error) {
    $("#signin-error").textContent = tError(error.message);
    $("#signin-submit").disabled = false;
  }
});

$("#signin-cancel").addEventListener("click", async () => {
  const current = state.signin;
  if (current && !["done", "failed", "cancelled"].includes(current.step)) {
    try { await api("DELETE", `/api/signin/${encodeURIComponent(current.id)}`); } catch { /* ignore */ }
  }
  state.signin = null;
  $("#signin-dialog").close();
});

// ------------------------------------------------------------------ logs

function appendLog(entry) {
  if (state.logs.length && entry.id <= state.logs[state.logs.length - 1].id) return;
  state.logs.push(entry);
  if (state.logs.length > 2000) state.logs.splice(0, state.logs.length - 2000);
  if (state.view === "logs" && logVisible(entry)) {
    const list = $("#log-list");
    list.append(logRow(entry));
    while (list.childElementCount > 2000) list.firstElementChild.remove();
    if ($("#log-follow").checked) list.scrollTop = list.scrollHeight;
  }
  if (state.view === "overview") renderRecentLog();
}

function logVisible(entry) {
  const min = LEVELS[$("#log-level").value] ?? 1;
  if ((LEVELS[entry.level] ?? 1) < min) return false;
  const query = $("#log-search").value.trim().toLowerCase();
  return !query || entry.message.toLowerCase().includes(query);
}

function logRow(entry, short = false) {
  const time = new Date(entry.time);
  const stamp = short
    ? time.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
    : time.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return el("div", { class: "log-row", title: short ? entry.message : undefined },
    el("span", { class: "log-time", text: stamp }),
    el("span", { class: "log-level " + entry.level, text: entry.level }),
    el("span", { class: "log-msg", text: entry.message }));
}

function renderLogs(scroll = false) {
  const list = $("#log-list");
  list.replaceChildren(...state.logs.filter(logVisible).map((entry) => logRow(entry)));
  if (scroll || $("#log-follow").checked) list.scrollTop = list.scrollHeight;
}

function renderRecentLog() {
  const recent = state.logs.filter((e) => e.level !== "DEBUG").slice(-8);
  const box = $("#recent-log");
  box.replaceChildren(...(recent.length ? recent.map((entry) => logRow(entry, true)) : [el("p", { class: "muted", text: "暂无活动记录。" })]));
}

async function startLogs() {
  const data = await api("GET", "/api/logs");
  state.logs = data.entries || [];
  renderLogs(true);
  renderRecentLog();
  if (state.logSource) state.logSource.close();
  const source = new EventSource("/api/logs/stream");
  source.onmessage = (event) => {
    try { appendLog(JSON.parse(event.data)); } catch { /* ignore */ }
  };
  source.onerror = () => {
    // The browser reconnects by itself; reload the buffer once it does.
    source.onopen = async () => {
      try {
        const after = state.logs.length ? state.logs[state.logs.length - 1].id : 0;
        const missed = await api("GET", `/api/logs?after=${after}`);
        (missed.entries || []).forEach(appendLog);
      } catch { /* ignore */ }
    };
  };
  state.logSource = source;
}

$("#log-level").addEventListener("change", () => renderLogs());
$("#log-search").addEventListener("input", () => renderLogs());
$("#log-clear").addEventListener("click", () => { state.logs = []; renderLogs(); renderRecentLog(); });

// ----------------------------------------------------------- connections

const ROUTES = {
  vpn: ["Proxy", "ok"],
  direct: ["直连", "accent"],
  blocked: ["已拦截", ""],
  port: ["Port refused", "warn"],
  failed: ["失败", "bad"],
};

// The Logs page's second tab: the proxy's connections, read once a second
// while it is shown. Clear hides the ones listed so far, open ones too.
function showLogTab(tab) {
  state.logTab = tab;
  for (const seg of document.querySelectorAll(".seg[data-logtab]")) seg.classList.toggle("active", seg.dataset.logtab === tab);
  $("#logs-log").hidden = tab !== "log";
  $("#logs-connections").hidden = tab !== "connections";
  syncConnections();
}

function syncConnections() {
  const shown = state.view === "logs" && state.logTab === "connections";
  if (shown && !state.connTimer) {
    loadConnections().catch(reportError);
    state.connTimer = setInterval(() => loadConnections().catch(() => {}), 1000);
  } else if (!shown && state.connTimer) {
    clearInterval(state.connTimer);
    state.connTimer = null;
  }
}

async function loadConnections(clear = false) {
  const data = await api(clear ? "DELETE" : "GET", "/api/connections");
  state.conns = data.connections || [];
  renderConnections();
}

function connDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const two = (n) => String(n).padStart(2, "0");
  if (s >= 3600) return `${Math.floor(s / 3600)}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}`;
  if (s >= 60) return `${Math.floor(s / 60)}:${two(s % 60)}`;
  return `${s}s`;
}

function renderConnections() {
  const query = $("#conn-search").value.trim().toLowerCase();
  const listed = state.conns.filter((c) => c.id > state.connsClearedAfter);
  const shown = listed.filter((c) => !query || c.target.toLowerCase().includes(query) || (c.client || "").toLowerCase().includes(query));
  const now = Date.now();
  $("#conn-open").textContent = `${listed.filter((c) => !c.end).length} open`;
  $("#conn-empty").hidden = shown.length > 0;
  $("#conn-rows").replaceChildren(...shown.map((c) => {
    const start = new Date(c.start);
    const [label, kind] = ROUTES[c.route] || ["…", ""];
    const end = c.end ? new Date(c.end).getTime() : now;
    return el("tr", { class: c.end ? "closed" : "" },
      el("td", { text: start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) }),
      el("td", { class: "dest", text: c.target, title: c.client }),
      el("td", {}, el("span", { class: "chip " + kind, text: label })),
      el("td", { text: (c.network || "").toUpperCase() }),
      el("td", { class: "hide-sm", text: `↑ ${formatBytes(c.up)}  ↓ ${formatBytes(c.down)}` }),
      el("td", { class: "hide-sm" }, c.end ? "" : el("span", { class: "open-dot" }), connDuration(end - start.getTime())));
  }));
  if ($("#conn-follow").checked) $("#conn-card").scrollTop = $("#conn-card").scrollHeight;
}

for (const seg of document.querySelectorAll(".seg[data-logtab]")) {
  seg.addEventListener("click", () => showLogTab(seg.dataset.logtab));
}
$("#conn-search").addEventListener("input", () => renderConnections());
$("#conn-clear").addEventListener("click", () => {
  if (state.conns.length) state.connsClearedAfter = Math.max(state.connsClearedAfter, state.conns[state.conns.length - 1].id);
  loadConnections(true).catch(reportError);
});

// -------------------------------------------------------------- settings

const DNS_PRESETS = {
  system: [],
  auto: ["https://1.1.1.1/dns-query", "https://8.8.8.8/dns-query", "https://9.9.9.9/dns-query"],
  cloudflare: ["https://1.1.1.1/dns-query", "https://1.0.0.1/dns-query"],
  google: ["https://8.8.8.8/dns-query", "https://8.8.4.4/dns-query"],
  quad9: ["https://9.9.9.9/dns-query", "https://149.112.112.112/dns-query"],
  cloudflare_dot: ["tls://1.1.1.1", "tls://1.0.0.1"],
};

function dnsPresetFor(servers) {
  const key = JSON.stringify(servers || []);
  return Object.keys(DNS_PRESETS).find((name) => JSON.stringify(DNS_PRESETS[name]) === key) || "custom";
}

function dnsServersFromForm() {
  const preset = $("#dns-preset").value;
  if (preset !== "custom") return DNS_PRESETS[preset];
  return $("#dns-custom").value.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

function renderDNSFields(servers) {
  const preset = dnsPresetFor(servers);
  $("#dns-preset").value = preset;
  $("#dns-custom").value = (servers || []).join("\n");
  $("#dns-custom-field").hidden = preset !== "custom";
  $("#dns-test-result").replaceChildren();
}

$("#dns-preset").addEventListener("change", (event) => {
  const custom = event.target.value === "custom";
  $("#dns-custom-field").hidden = !custom;
  if (custom && !$("#dns-custom").value.trim()) $("#dns-custom").value = DNS_PRESETS.auto.join("\n");
});

function dnsAnswer(addrs, error, ms, source) {
  if (error) return el("td", {}, el("span", { class: "latency-err", text: tError(error) }));
  return el("td", {},
    el("div", { class: "mono" }, (addrs || []).map((addr) => el("span", { text: addr }))),
    el("div", { class: "ms", text: `${ms} ms${source && source !== "system" ? " · " + source : ""}` }));
}

$("#dns-test").addEventListener("click", async (event) => {
  const servers = dnsServersFromForm();
  const box = $("#dns-test-result");
  try {
    const data = await busy(event.currentTarget, "测试中…", () => api("POST", "/api/dns/test", { servers }));
    const system = servers.length === 0;
    const head = el("tr", {}, el("th", { text: "域名" }), system ? null : el("th", { text: "所选 DNS" }), el("th", { text: "系统 DNS" }), el("th", { text: "" }));
    const rows = data.results.map((r) => el("tr", {},
      el("td", {}, el("div", { text: r.host }), el("div", { class: "ms", text: dnsRole(r.role) })),
      system ? null : dnsAnswer(r.addrs, r.error, r.ms, r.source),
      dnsAnswer(r.system_addrs, r.system_error, r.system_ms),
      el("td", {}, r.filtered
        ? el("span", { class: "chip warn", title: "网络返回了用于过滤的地址，DNS 可能已被篡改", text: "被过滤" })
        : null)));
    box.replaceChildren(el("table", { class: "dns-results" }, el("thead", {}, head), el("tbody", {}, rows)));
    const failed = data.results.filter((r) => (system ? r.system_error : r.error)).length;
    const filtered = data.results.filter((r) => r.filtered).length;
    toast(failed ? `${data.results.length} 个域名中有 ${failed} 个解析失败`
      : filtered ? `所有域名均解析成功；其中 ${filtered} 个受到网络 DNS 过滤` : "所有域名均解析成功", failed > 0);
  } catch (error) {
    reportError(error);
  }
});

let relayTestAbort = null;
let relayTestAddress = "";

async function runRelayTest() {
  relayTestAbort?.abort();
  const abort = new AbortController();
  relayTestAbort = abort;
  const log = $("#relay-test-log");
  const summary = $("#relay-test-state");
  log.textContent = "";
  summary.textContent = "测试中…";
  $("#relay-test-retry").disabled = true;
  let completed = false;
  const consume = (line) => {
    if (relayTestAbort !== abort || abort.signal.aborted) return;
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "step") {
      const s = event.step;
      log.textContent += `${(s.elapsed_ms / 1000).toFixed(2)}s  ${s.status.toUpperCase()}  [${s.stage}${s.code ? ": " + s.code : ""}] ${s.detail}\n`;
      log.scrollTop = log.scrollHeight;
    } else if (event.type === "result") {
      completed = true;
      summary.textContent = event.result.ok ? "Relay is ready" : "Relay health could not be confirmed";
    }
  };
  try {
    const response = await fetch("/api/relay/test", {
      method: "POST", credentials: "same-origin", signal: abort.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: relayTestAddress, stream: true }),
    });
    if (!response.ok) throw new ApiError(response.status, `Relay diagnostics API returned HTTP ${response.status}.`);
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let pending = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      const lines = pending.split("\n");
      pending = lines.pop();
      for (const line of lines) consume(line);
    }
    if (pending.trim()) consume(pending);
    if (!completed) throw new Error("The test ended before a complete result was received.");
  } catch (error) {
    if (!abort.signal.aborted) {
      summary.textContent = "Relay health could not be confirmed";
      // Input addresses and server-supplied bodies never become diagnostics.
      log.textContent += "ERROR  " + (error instanceof ApiError ? error.message : "The relay diagnostic connection ended unexpectedly.") + "\n";
    }
  } finally {
    if (relayTestAbort === abort) $("#relay-test-retry").disabled = false;
  }
}

$("#relay-test").addEventListener("click", () => {
  relayTestAddress = $("#f-relay").value.trim();
  $("#relay-test-dialog").showModal();
  runRelayTest();
});
$("#relay-test-retry").addEventListener("click", runRelayTest);
$("#relay-test-copy").addEventListener("click", () => copyText($("#relay-test-log").textContent, "Relay health report"));
$("#relay-test-close").addEventListener("click", () => $("#relay-test-dialog").close());
$("#relay-test-dialog").addEventListener("close", () => relayTestAbort?.abort());

const INT_FIELDS = ["proxy.upstream_connections", "proxy.max_connections"];
const FLOAT_FIELDS = ["accounts.switch_threshold_percent"];

function getPath(object, path) {
  return path.split(".").reduce((value, key) => (value == null ? undefined : value[key]), object);
}

function setPath(object, path, value) {
  const keys = path.split(".");
  let target = object;
  for (const key of keys.slice(0, -1)) target = target[key];
  target[keys[keys.length - 1]] = value;
}

async function loadSettings() {
  const [settings, locations] = await Promise.all([
    api("GET", "/api/settings"),
    api("GET", "/api/locations").catch(() => ({ locations: [] })),
  ]);
  state.settings = settings;
  state.locations = locations.locations || [];
  const form = $("#settings-form");
  for (const input of form.querySelectorAll("input[name], select[name]")) {
    if (input.name === "location" || input.name === "dashboard_password") continue;
    let value = getPath(settings.config, input.name);
    if (input.type === "checkbox") input.checked = Boolean(value);
    else if (input.type === "radio") input.checked = String(value) === input.value;
    else {
      if (value != null) value = String(value);
      // A value the choices do not have (set in config.json) is kept.
      if (input.tagName === "SELECT" && value != null && ![...input.options].some((o) => o.value === value)) {
        input.append(el("option", { value, text: value }));
      }
      input.value = value ?? "";
    }
  }
  form.dashboard_password.value = "";
  hideSecrets(form);
  fillListen("proxy", settings.config.proxy.listen);
  fillListen("dash", settings.config.dashboard.listen);
  fillUpstreamProxy(settings.config.network && settings.config.network.upstream_proxy);
  renderLocationSelect(settings.config.proxy);
  renderDNSFields(settings.config.dns && settings.config.dns.servers);
  fillRoutingFields(settings.config.routing || {});
  $("#system-proxy-row").hidden = !(state.status && state.status.system_proxy_supported);
  loadRoutingStatus().catch(() => {});
  // The folders, each with a copy button.
  const folder = (label, path) => el("div", { class: "folder" },
    el("span", { class: "set-ic" }, icon("folder")),
    el("span", { class: "folder-text" }, el("span", { class: "folder-label", text: label }), el("code", { text: path })),
    el("button", { type: "button", class: "btn icon sm ghost", title: `复制${label.toLowerCase()}`, "aria-label": `复制${label.toLowerCase()}`, onclick: () => copyText(path, label.toLowerCase()) }, icon("copy")));
  $("#data-dir").replaceChildren(...[
    settings.program_dir ? folder("程序文件夹", settings.program_dir) : null,
    folder("数据文件夹", settings.data_dir),
  ].filter(Boolean));
  $("#settings-error").textContent = "";
  state.settingsSnapshot = JSON.stringify(collectSettings().config);
  updateDirty();
}

// A listen address is edited as who may connect (a choice) and a port.
// An address the choices do not have (set in config.json) is kept.
function fillListen(prefix, listen) {
  const [host, port] = splitHostPort(listen || "");
  const select = $(`#${prefix}-host`);
  for (const option of select.querySelectorAll("option[data-custom]")) option.remove();
  if (![...select.options].some((o) => o.value === host)) {
    select.append(el("option", { value: host, "data-custom": "", text: host ? `${host}（来自 config.json）` : "所有地址（来自 config.json）" }));
  }
  select.value = host;
  $(`#${prefix}-port`).value = port;
}

// The upstream proxy is edited as an address and a port.
function fillUpstreamProxy(address) {
  const [host, port] = address ? splitHostPort(address) : ["", ""];
  $("#upstream-host").value = host;
  $("#upstream-port").value = port;
  requireUpstreamProxy();
}

// On needs an address; off keeps what is filled in.
function requireUpstreamProxy() {
  const on = $("#f-upstream-on").checked;
  $("#upstream-host").required = on;
  $("#upstream-port").required = on;
}

// What a paste may bring goes by itself: spaces, a scheme, the port with the
// address. The core refuses a missing half.
function upstreamProxyFromForm() {
  const host = $("#upstream-host").value.replace(/\s/g, "").replace(/^.*:\/\//, "").replace(/\/$/, "");
  const port = $("#upstream-port").value.replace(/\s/g, "");
  // With its port already: one colon, or one after IPv6's brackets.
  if (/^[^:]+:[^:]*$/.test(host) || /^\[.*\]:/.test(host)) return host;
  const bare = host.replace(/^\[|\]$/g, "");
  return bare || port ? hostPort(bare, port) : "";
}

function listenFromForm(prefix) {
  return hostPort($(`#${prefix}-host`).value, $(`#${prefix}-port`).value.trim());
}

// The settings as the form has them, ready for PUT /api/settings.
function collectSettings() {
  const form = $("#settings-form");
  const config = structuredClone(state.settings.config);
  for (const input of form.querySelectorAll("input[name], select[name]")) {
    if (input.name === "location" || input.name === "dashboard_password") continue;
    if (input.type === "radio" && !input.checked) continue;
    let value = input.type === "checkbox" ? input.checked : input.value.trim();
    if (INT_FIELDS.includes(input.name)) value = parseInt(value, 10) || 0;
    if (FLOAT_FIELDS.includes(input.name)) value = parseFloat(value) || 0;
    setPath(config, input.name, value);
  }
  config.proxy.listen = listenFromForm("proxy");
  config.dashboard.listen = listenFromForm("dash");
  config.network = config.network || {};
  config.network.upstream_proxy = upstreamProxyFromForm();
  config.dns = config.dns || {};
  config.dns.servers = dnsServersFromForm();
  routingFromForm(config);
  const locationChoice = form.location.value;
  if (locationChoice === "__server__") config.proxy.country = "";
  else { config.proxy.country = locationChoice; config.proxy.server = ""; }
  return { config, password: form.dashboard_password.value };
}

// The save bar shows while the form differs from the saved settings.
function updateDirty() {
  if (!state.settings || !state.settingsSnapshot) return;
  const { config, password } = collectSettings();
  const dirty = Boolean(password) || JSON.stringify(config) !== state.settingsSnapshot;
  $("#settings-form").classList.toggle("dirty", dirty);
}

$("#f-upstream-on").addEventListener("change", requireUpstreamProxy);
$("#settings-form").addEventListener("input", updateDirty);
$("#settings-form").addEventListener("change", updateDirty);
$("#settings-discard").addEventListener("click", () => loadSettings().catch(reportError));

function renderLocationSelect(proxy) {
  const select = $("#location-select");
  select.replaceChildren(
    el("option", { value: "", text: "自动（推荐）" }),
    el("option", { value: "fastest", text: "自动（最快：每次启动时选择实际延迟最低的服务器）" }),
  );
  for (const loc of state.locations) {
    if (loc.recommended) continue;
    select.append(el("option", { value: loc.code, text: `${locationName(loc)} (${loc.code})${loc.ping_ms ? ` — ${loc.ping_ms} ms` : ""}` }));
  }
  select.append(el("option", { value: "__server__", text: "自定义服务器…" }));
  let value = "";
  if (proxy.server) value = "__server__";
  else if (proxy.country) {
    const country = proxy.country.toLowerCase();
    const match = state.locations.find((l) => !l.recommended && (l.code.toLowerCase() === country || l.name.toLowerCase() === country));
    if (country === "fastest") value = "fastest";
    else if (country === "rec" || country === "recommended") value = "";
    else if (match) value = match.code;
    else {
      select.append(el("option", { value: proxy.country, text: proxy.country }));
      value = proxy.country;
    }
  }
  select.value = value;
  $("#server-field").hidden = value !== "__server__";
}

// The section being read is marked in the section list.
{
  const links = [...document.querySelectorAll(".settings-nav a")];
  const mark = (id) => {
    for (const link of links) link.classList.toggle("active", link.getAttribute("href") === `#${id}`);
  };
  const spy = new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) mark(entry.target.id);
  }, { rootMargin: "0px 0px -65% 0px" });
  for (const link of links) {
    const target = document.querySelector(link.getAttribute("href"));
    if (target) spy.observe(target);
  }
  if (links[0]) mark(links[0].getAttribute("href").slice(1));
}

// The section links scroll without changing the page hash.
for (const link of document.querySelectorAll(".settings-nav a")) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const target = document.querySelector(link.getAttribute("href"));
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

$("#location-select").addEventListener("change", (event) => {
  $("#server-field").hidden = event.target.value !== "__server__";
});


$("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.settings) return;
  const { config, password } = collectSettings();
  $("#settings-error").textContent = "";
  if (!config.proxy.username !== !config.proxy.password) {
    $("#settings-error").textContent = "请同时填写代理用户名和密码，或将两者都留空。";
    return;
  }
  try {
    const result = await api("PUT", "/api/settings", { config, dashboard_password: password ? password : null });
    toast(result.proxy_restarted ? "已保存。代理将使用新设置重启。" : "设置已保存");
    if (result.dashboard_moved) {
      const [host, port] = splitHostPort(config.dashboard.listen);
      const target = `${window.location.protocol}//${host === "0.0.0.0" || host === "" || host === "::" ? window.location.hostname : host}:${port}/app/`;
      toast(`控制台地址已变更为 ${target}`);
      setTimeout(() => { window.location.href = target; }, 1500);
      return;
    }
    await loadSettings();
    await loadStatus();
  } catch (error) {
    $("#settings-error").textContent = tError(error.message);
  }
});

function splitHostPort(address) {
  const index = address.lastIndexOf(":");
  return [address.slice(0, index).replace(/^\[|\]$/g, ""), address.slice(index + 1)];
}

// ------------------------------------------------------------------- app

function stopPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = null;
  if (state.logSource) { state.logSource.close(); state.logSource = null; }
  if (state.connTimer) { clearInterval(state.connTimer); state.connTimer = null; }
}

async function refresh() {
  try {
    await loadStatus();
    if (state.view === "accounts") await loadAccounts();
  } catch (error) { reportError(error); }
}

async function start() {
  try {
    if (!(await checkSession())) return;
  } catch (error) {
    reportError(error);
    return;
  }
  stopPolling();
  await refresh();
  startLogs().catch(reportError);
  state.pollTimer = setInterval(refresh, 6000);
  showView(state.view);
}

// ------------------------------------------------------------ phone menu

// On narrow screens the sidebar is a drawer behind the menu button: a page
// chosen, the backdrop, the close button, or Escape closes it.
const narrow = window.matchMedia("(max-width: 860px)");

function navOpen() { return $("#app").classList.contains("nav-open"); }

function setNavOpen(open) {
  $("#app").classList.toggle("nav-open", open);
  $("#nav-toggle").setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("no-scroll", open);
  if (open) $(".nav-item.active")?.focus();
}

function closeNav() {
  if (!navOpen()) return;
  setNavOpen(false);
  if (narrow.matches) $("#nav-toggle").focus();
}

$("#nav-toggle").addEventListener("click", () => setNavOpen(!navOpen()));
$("#nav-close").addEventListener("click", closeNav);
$("#nav-backdrop").addEventListener("click", closeNav);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && navOpen()) closeNav();
});
narrow.addEventListener("change", () => { if (!narrow.matches) setNavOpen(false); });

// The theme switch and Sign out sit in the top bar on narrow screens, in
// the page header otherwise; moving them keeps their handlers.
function placeHeadButtons() {
  const target = narrow.matches ? $("#bar-actions") : $("#head-actions");
  target.append($("#theme-toggle"), $("#logout"));
}
narrow.addEventListener("change", placeHeadButtons);
placeHeadButtons();

initTheme();
setupSecrets();
for (const item of document.querySelectorAll(".nav-item")) {
  item.addEventListener("click", () => {
    showView(item.dataset.view);
    if (navOpen()) setNavOpen(false);
  });
}
window.addEventListener("hashchange", () => {
  const name = location.hash.slice(1);
  if (PAGES[name]) showView(name);
});
if (PAGES[location.hash.slice(1)]) state.view = location.hash.slice(1);
start();
