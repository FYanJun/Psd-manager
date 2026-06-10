# Psd-manager

![应用图标](src-tauri/icons/icon.png)

设备密码管理工具，用来集中记录真实设备的设备信息、账号密码、密码历史和批量改密记录。应用采用 Rust + Tauri + Svelte 构建，数据默认保存在本机。

## 功能

- 设备管理：记录设备名称、类型、IP、备注等信息。
- 多账号管理：同一台设备可以保存多个用户名和密码。
- 密码更新历史：更新密码时保留旧密码，并记录旧密码和新密码。
- 随机密码生成器：支持 3-24 位长度，默认 8 位，可按场景选择生成规则。
- 搜索：按设备名称和 IP 进行模糊搜索。
- 批量改密：可以按设备类型和用户名批量更新密码。
- 导入导出：支持 JSON 备份文件导入和导出。
- 桌面端：支持 macOS 和 Windows 打包。

## 数据和安全说明

- 当前版本不做应用锁和密码加密显示，符合轻量化使用场景。
- 数据保存在本机应用存储中，卸载或清理应用数据前建议先导出 JSON 备份。
- 导出的 JSON 备份包含明文账号密码，请只保存在可信位置。

## 安装

在 GitHub Releases 下载对应平台安装包：

- macOS：下载 `.dmg` 文件并拖入应用程序。
- Windows：下载 `.exe` 安装包并按提示安装。

### macOS 提示“已损坏”

当前 macOS 安装包未配置 Apple Developer ID 签名和公证。通过 Chrome/GitHub 下载后，macOS Gatekeeper 可能提示“应用已损坏，无法打开”。这通常不是文件真的损坏，而是下载隔离标记导致的拦截。

把应用拖到“应用程序”后，执行：

```bash
xattr -dr com.apple.quarantine "/Applications/设备密码管理工具.app"
```

然后重新打开应用。

要彻底消除这个提示，需要配置 Apple Developer ID 证书并在发布流程中完成 notarization。

## 本地开发

环境要求：

- Node.js 20 或更高版本
- Rust stable
- macOS 或 Windows 桌面环境

安装依赖：

```bash
npm install
```

启动桌面开发预览：

```bash
npm run tauri:dev
```

运行前端 smoke test：

```bash
npm test
```

构建前端：

```bash
npm run build
```

## 打包

macOS 本地打包：

```bash
npm run tauri -- build --bundles dmg
```

Windows 安装包建议通过 GitHub Actions 在 Windows runner 上构建：

```bash
git tag v0.1.0
git push origin v0.1.0
```

推送 `v*` 标签后，GitHub Actions 会自动生成 Release，并上传 macOS DMG 与 Windows EXE 安装包。

## 技术栈

- Rust
- Tauri 2
- Svelte 5
- Vite
- Lucide Icons

## 图标授权

应用图标基于 Lucide Key Round 制作。Lucide 使用 ISC License。
