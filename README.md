# Psd Manager

![应用图标](src-tauri/icons/icon.png)

Psd Manager 是一个轻量级设备密码管理工具，用来集中记录真实设备的设备信息、账号密码、密码历史和批量改密记录。应用采用 Rust + Tauri + Svelte 构建，数据默认保存在本机。

适合记录服务器、交换机、路由器、NAS、工控机等真实设备的登录账号和密码。

## 功能

- 设备管理：记录设备名称、设备类型、IP、备注等信息。
- 账号管理：同一台设备可以保存多个用户名和密码。
- 密码变更记录：更新密码时保留旧密码，并记录新密码和旧密码。
- 随机密码生成器：支持 3-24 位长度，默认 8 位，可按场景选择生成规则。
- 搜索：按设备名称和 IP 进行模糊搜索。
- 批量改密：可以按设备类型和用户名批量更新密码。
- 导入导出：支持 JSON 备份文件导入和导出。
- 桌面端：支持 macOS 和 Windows 打包。

## 下载安装

在 GitHub Releases 下载对应平台发布包：

| 平台 | 文件名 | 说明 |
| --- | --- | --- |
| macOS Apple Silicon | `PsdManager-{version}-macos-arm64-installer.dmg` | macOS 安装包，打开后拖入应用程序 |
| Windows x64 免安装版 | `PsdManager-{version}-windows-x64-portable.exe` | 单文件版，双击即可运行 |
| Windows x64 安装版 | `PsdManager-{version}-windows-x64-installer.exe` | 安装版，按提示安装 |

优先推荐 Windows 用户下载免安装版：

```text
PsdManager-{version}-windows-x64-portable.exe
```

发布包命名规则：

```text
PsdManager-{version}-{platform}-{arch}-{type}.{ext}
```

示例：

```text
PsdManager-0.1.1-windows-x64-portable.exe
```

### Windows 运行环境

Windows 版本基于 Tauri，需要系统包含 Microsoft Edge WebView2 Runtime。大多数 Windows 10/11 已内置；如果某台电脑无法打开应用，可以先安装 WebView2 Runtime。

### macOS 提示“已损坏”

当前 macOS 安装包未配置 Apple Developer ID 签名和公证。通过 Chrome/GitHub 下载后，macOS Gatekeeper 可能提示“应用已损坏，无法打开”。这通常不是文件真的损坏，而是下载隔离标记导致的拦截。

把应用拖到“应用程序”后，执行：

```bash
xattr -dr com.apple.quarantine "/Applications/设备密码管理工具.app"
```

然后重新打开应用。

要彻底消除这个提示，需要配置 Apple Developer ID 证书并在发布流程中完成 notarization。

## 数据和安全说明

- 当前版本不做应用锁和密码加密显示，符合轻量化使用场景。
- 数据保存在本机应用存储中，卸载或清理应用数据前建议先导出 JSON 备份。
- 导出的 JSON 备份包含明文账号密码，请只保存在可信位置。

## 本地开发

环境要求：

- Node.js 20 或更高版本
- Rust stable
- macOS 或 Windows 桌面环境

安装依赖：

```bash
npm install
```

启动桌面版开发预览：

```bash
npm run tauri:dev
```

运行前端 smoke test：

```bash
npm test
```

构建前端产物：

```bash
npm run build
```

## 打包发布

### 从源码打包

下载源码：

```bash
git clone https://github.com/FYanJun/Psd-manager.git
cd Psd-manager
```

安装依赖：

```bash
npm install
```

本地预览桌面版：

```bash
npm run tauri:dev
```

按当前系统打包安装包：

```bash
npm run tauri -- build
```

按指定类型打包：

```bash
# macOS DMG 安装包
npm run tauri -- build --bundles dmg

# Windows NSIS 安装包
npm run tauri -- build --bundles nsis

# Windows 免安装单文件版
npm run tauri -- build --no-bundle
```

打包完成后，产物通常在：

```text
src-tauri/target/release/bundle/
src-tauri/target/release/
```

注意：Windows 安装包和 Windows 免安装版建议在 Windows 环境打包，macOS DMG 建议在 macOS 环境打包。

### GitHub Actions 发布

正式发布建议使用 GitHub Actions。推送 `v*` 标签后，Release workflow 会自动构建并上传 macOS 安装包、Windows 安装版和 Windows 免安装版。

```bash
git tag v0.1.1
git push origin v0.1.1
```

生成的 Release 文件名示例：

```text
PsdManager-0.1.1-macos-arm64-installer.dmg
PsdManager-0.1.1-windows-x64-installer.exe
PsdManager-0.1.1-windows-x64-portable.exe
```

## 技术栈

- Rust
- Tauri 2
- Svelte 5
- Vite
- Lucide Icons

## 图标授权

应用图标基于 Lucide Key Round 制作。Lucide 使用 ISC License。
