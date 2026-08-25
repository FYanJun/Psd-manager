# Psd Manager（密码管理器）

> 面向服务器、网络设备和基础设施资产的本地加密密码管理器。

[![最新版本](https://img.shields.io/github/v/release/FYanJun/Psd-manager?display_name=tag)](https://github.com/FYanJun/Psd-manager/releases/latest)
[![构建发布](https://github.com/FYanJun/Psd-manager/actions/workflows/release.yml/badge.svg)](https://github.com/FYanJun/Psd-manager/actions/workflows/release.yml)

![应用图标](src-tauri/icons/icon.png)

Psd Manager（密码管理器）用于集中管理真实设备资产、设备账号、当前密码和密码历史。它适合个人或小团队在本地维护服务器、交换机、路由器、NAS、工控机等设备的登录信息，不依赖在线账号，也不要求把资产库上传到云端。

## 功能概览

### 设备与账号

- 使用三栏工作区管理设备类型、设备列表和设备详情。
- 记录设备名称、设备类型、连接地址、资产编号、位置和备注。
- 一台设备可以保存多个账号，每个账号独立记录用户名、密码、标签、备注和密码历史。
- 设备类型支持预设颜色和自定义取色，方便快速区分不同类别的设备。
- 支持按设备类型、设备名称、连接地址、资产编号和位置搜索；选择具体设备类型后，搜索范围会自动限制在当前类型内。

### 密码操作

- 更新单个账号密码，自动保留旧密码和修改原因。
- 按设备类型和用户名匹配多个账号，批量更新选中的账号密码。
- 删除设备、账号、设备类型、替换密码和覆盖导入等高风险操作均需要二次确认。
- 密码更新后默认保持隐藏，窗口失焦时会自动隐藏已经显示的密码。
- 内置随机密码生成器，支持 3-24 位长度、大写字母、小写字母、数字、符号、排除相似字符、避免重复字符和最少字符数量规则。
- 随机密码生成器只有从修改密码或批量改密流程打开时，才可以把结果填入对应表单；独立打开时只能生成和复制密码。

### 数据保护

- 删除、导入和恢复前自动创建本地加密数据快照，支持撤销和手动恢复。
- 支持可选的启动锁定和闲置自动锁定。
- 支持生成恢复密钥文件，忘记主密码时可以使用恢复文件设置新密码。
- 关闭窗口默认隐藏到系统托盘并保留进程；只有托盘菜单中的“关闭程序”才会退出应用。
- 支持窗口最小化、托盘恢复、开机自启和单实例运行。

### 配置文件

- 支持 JSON、CSV 和 YAML 三种格式导入导出。
- 导入文件会先完成整体解析、结构校验、名称校验、UUID 校验和重复检查。
- 导入时可以选择“仅新增”或“全部覆盖”，确认窗口会显示实际影响的设备、账号、密码历史和设备类型数量。
- 设备类型、设备、账号和密码历史均使用独立 UUID，改名不会导致记录被识别为新数据。
- 导出的配置包含明文账号、密码和密码历史，请只保存到可信位置。

### 界面与偏好

- 支持浅色、深色和跟随系统主题。
- 支持标准和紧凑界面密度，以及小号、标准和大号字体。
- 支持 Tooltip、三栏宽度、设备排序、设备类型排序、上次视图和窗口大小记忆。
- 设置独立保存在应用数据目录中，不会混入资产库或导出的配置文件。

## 下载

前往 [GitHub Releases](https://github.com/FYanJun/Psd-manager/releases/latest) 下载最新版本。

| 平台 | 文件 | 说明 |
| --- | --- | --- |
| macOS Apple Silicon | `PsdManager-{version}-macos-arm64-installer.dmg` | 打开安装包后将应用拖入“应用程序” |
| Windows x64 安装版 | `PsdManager-{version}-windows-x64-installer.exe` | 按安装向导完成安装 |
| Windows x64 免安装版 | `PsdManager-{version}-windows-x64-portable.exe` | 下载后双击即可运行，不需要安装 |

### Windows

Windows 版本需要 Microsoft Edge WebView2 Runtime。Windows 10/11 通常已经内置；如果应用无法启动，请先安装 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。

### macOS

当前 macOS 安装包尚未配置 Apple Developer ID 签名和公证。若系统提示“应用已损坏，无法打开”，将应用拖入“应用程序”后执行：

```bash
xattr -dr com.apple.quarantine "/Applications/Psd Manager.app"
```

## 数据与安全

桌面版资产库使用 AES-256-GCM 加密，随机密钥和加密资产库一起保存在本机应用数据目录中。启用启动锁定后，主密码只用于解锁资产库，不会保存到应用设置中，也不会发送到网络。

应用数据目录中主要包含：

| 文件 | 作用 |
| --- | --- |
| `vault.enc` | 加密主资产库 |
| `vault.enc.bak` | 最近一次成功保存前的安全备份 |
| `vault.key` | 资产库加密密钥 |
| `vault.lock` | 资产库读写锁及启动密码保护信息 |
| `settings.json` | 应用界面、窗口和密码生成器设置 |

可以在应用的“关于”页面查看并打开安装路径和数据存储路径。不同系统的实际目录由应用运行环境决定，请以应用页面显示的路径为准。

这套方案用于避免明文资产库落盘和误读，不能抵御已经取得当前系统账号文件访问权限的攻击者。JSON、CSV、YAML 导出文件不加密，导出后请自行妥善保护。

## 导入与导出规则

当前配置格式为 v3，使用中文字段名和独立 UUID。JSON/YAML 按设备类型分组，CSV 使用一行一个账号的扁平结构。

- JSON、CSV、YAML 都使用 `连接地址` 字段，不再使用旧的 `IP地址` 或 `设备信息` 字段。
- 当前格式必须包含设备类型 UUID、设备 UUID、账号 UUID 和密码历史 UUID。
- “仅新增”只按 UUID 识别已有记录；已有设备字段、账号当前字段和当前密码不会被修改，只会补充本地缺少的密码历史。
- “全部覆盖”会以导入文件整体替换当前设备、账号、密码历史和设备类型。
- 文件解析、校验或身份冲突失败时不会执行导入，并会显示具体错误原因。
- 当前版本不兼容旧版 INI、旧版英文 JSON、旧版分段 CSV 或缺少 UUID 的配置文件。

## 本地开发

环境要求：

- Node.js 20 或更高版本
- Rust stable
- macOS 或 Windows 桌面环境

安装依赖：

```bash
npm install
```

启动 Tauri 桌面开发环境：

```bash
npm run tauri:dev
```

构建前端资源：

```bash
npm run build
```

构建当前系统的桌面安装包：

```bash
npm run tauri -- build
```

常用检查命令：

```bash
npx tsc --noEmit
cargo fmt --check --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

浏览器开发预览只用于界面调试，资产库不会作为完整持久化数据保存在浏览器本地存储中。需要验证加密存储、系统托盘、窗口行为和恢复文件时，请使用 Tauri 桌面开发环境。

## 技术栈

- Rust
- Tauri 2
- Svelte 5
- Vite
- TypeScript
- AES-256-GCM / Argon2
- Lucide Icons
