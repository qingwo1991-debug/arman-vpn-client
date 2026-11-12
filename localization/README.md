# 简体中文面板（v1.0.4-zh-CN.1）

## 范围与实现

上游 v1.0.4 Web 面板没有语言切换；本地增加前端专用镜像 `local/firefox-vpn-dashboard:1.0.4-zh-CN.1`。

- 主页面、菜单、概览、账号、服务器、设置、帮助、登录、表单验证、常用状态与错误提示使用简体中文。
- 通过 `Intl.DisplayNames('zh-CN')` 显示国家中文名，表单实际提交的国家代码不变。
- 英文/国家代码搜索继续支持，并支持中文地区名搜索。
- 原始日志、主机名、IP、账号邮箱、协议名称和未知上游报错不做盲目替换；保留技术细节。
- 使用系统中文字体，不加载第三方翻译、字体或 CDN，不向翻译服务发送账号/密码。

## 安全与数据

地址仍为 `http://192.168.1.15:10820/app/`，用户名和密码不变。

Core 官方发布二进制保持原样，不重编译、不修改；账号数据、配置、持久会话签名密钥仍在原 `core-data`。本次迁移10820端口到网关时会短暂重建Core，后续仅更新翻译只需重建dashboard。`local-api.token` 是每次Core启动自动轮换的本地运行时令牌，不属于需保持不变的管理员登录密钥。网关仅托管 4 个公开静态文件，所有 API / SSE / 一次性登录链接 / 旗帜请求转到 Core。保留 Host、Origin 和 Cookie，让原有密码鉴权、同源检查和设置校验继续生效；不转发桌面特权 `X-Local-Token`。

网关不挂载账号目录、配置文件、Docker socket 或宿主其他文件；UID10003、只读根文件系统、cap_drop ALL、no-new-privileges、8 MiB tmpfs、64 MiB内存上限。仅绑定 LAN IPv4，面板仍是 HTTP 而非 HTTPS。Nginx访问日志关闭，防止一次性登录URL进入访问日志；错误日志限制warn。

所有静态资源 `no-store`，保持原CSP策略、frame DENY等头。Core地址从Docker DNS动态解析，Core重建后无需手动重启网关。

## 重建

固定原始文件保存在 `upstream/`，来自当前已验证的官方发布二进制内置资源。HTML、JS、CSS、图标各有 SHA-256 检查；如果上游更新，构建脚本拒绝静默套用旧补丁。

```bash
# 在 /root/docker/firefox-vpn-client 中执行
python3 localization/build_assets.py
docker compose build --pull=false dashboard
docker compose up -d --no-deps dashboard
```

`build_html.py` 只翻译文本与明确的可本地化属性，保留所有元素/字段/协议值/链接/脚本钩子。`build_js.py` 使用精确匹配补丁，不对整页DOM或服务器数据做全局替换。状态、JSON键、API URL和协议值不做翻译。

## 验证

```bash
python3 scripts/verify_localization.py
python3 scripts/run_browser_localization.py
```

后者使用既有 `browserless` 容器启动独立临时Chrome，不触碰用户浏览器或登录会话。只检查页面/登录/只读API；不保存设置、不添加账号、不切换地区、不操作代理电源。截图保存在 `private/`，可能含账号信息，不自动公开。

已在部署地址完成真实Chrome验收：1440×1000桌面和390×844手机视口的六个页面（概览、账号、服务器、日志、设置、帮助）均可导航且标题为中文；登录页、错误密码提示、账号添加弹窗、国家中文名与“日本”搜索均通过；设置表单正常加载；手机无横向溢出；浏览器脚本错误为零；只读设置API返回200，非JSON登录请求仍返回415。桌面切换手机尺寸时，测试等待原生侧栏动画完成后再点击，避免把测试点击误投到正在退场的关闭按钮；未修改产品CSS或交互逻辑。

本次测试发现用户已修改初始管理员密码，未要求提供新密码、未重置密码。通过 Core 原生本地管理接口创建一次性登录链接，兑换的测试 Cookie 仅私密暂存，用来验证既有会话跨部署继续有效；浏览器再通过该会话执行只读检查。测试文件不会保存新管理员密码。验收结束后删除临时 Cookie 文件；维护时若要重跑，应通过原生管理机制重新签发测试会话，不要把 Cookie 或密码写进脚本。

## 回滚为英文

先备份当前compose；然后仅把管理端口从dashboard移回core，停止dashboard。激活前完整compose备份在 `backups/localization-before/compose.yaml`。该版本保留原Core/edge设置；如果其后又改过部署参数，不要直接覆盖整个文件。

本目录仅负责前端汉化；随后按用户要求增加的控制面前置、多地区后端、手动分组和订阅更新记录分别见 `../control-proxy/README.md` 与 `../regions/README.md`，不属于翻译补丁。`verify_localization.py` 的原始全文件哈希检查针对汉化切换时点；后续有意配置变更不能简单重置历史基线，最终验收使用显式变更边界检查。
