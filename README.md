# Psd Manager（密码管理器）

面向服务器、网络设备和基础设施资产的本地密码管理工具，使用 Tauri、Svelte 和 Rust 构建。

[![最新版本](https://img.shields.io/github/v/release/FYanJun/Psd-manager?display_name=tag)](https://github.com/FYanJun/Psd-manager/releases/latest)
[![构建发布](https://github.com/FYanJun/Psd-manager/actions/workflows/release.yml/badge.svg)](https://github.com/FYanJun/Psd-manager/actions/workflows/release.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)

## 项目介绍

Psd Manager 用于集中整理设备信息、登录账号、当前密码和密码修改历史，适合个人或小团队的设备运维资料管理。例如，为服务器、交换机、路由器、NAS 和工控机建立分类，在同一台设备下维护多个账号，并在需要时快速查找、复制或更新密码。

应用在本机保存加密资产库，无需注册在线账号或部署服务端。当前以单机桌面使用为主，不提供多人实时协作和云同步。

## 主要功能

- **设备与账号管理**：按设备类型分类，记录设备名称、连接地址、资产编号、位置和备注；一台设备可维护多个账号。
- **搜索与整理**：搜索设备名称、类型、连接地址、编号和位置，支持分类筛选与排序。
- **密码与历史**：查看、复制、更新密码，保留旧密码和修改原因；支持按设备和账号筛选后批量更新本地记录。
- **密码生成器**：按长度、字符类型及相似字符排除等规则生成随机密码，可填入改密表单。
- **本地数据保护**：加密保存资产库，支持启动主密码、闲置自动锁定和恢复密钥文件。
- **快照与加密备份**：通过本地快照恢复误删或覆盖的数据，也可创建独立密码保护的 `.psdbackup` 文件，用于备份和跨电脑恢复。
- **导入与导出**：支持 JSON、YAML 和 Excel（XLSX），Excel 包含设备账号和密码历史两张工作表。
- **桌面体验**：三栏工作区，支持浅色、深色、跟随系统主题，以及系统托盘、开机自启和单实例运行。

密码更新功能修改的是本地资产库记录，不会自动连接设备并修改设备上的实际密码。

## 支持平台与下载

前往 [GitHub Releases](https://github.com/FYanJun/Psd-manager/releases/latest) 下载对应平台的版本。

| 平台 | 发布形式 | 文件名 |
| --- | --- | --- |
| Windows x64 | 安装版 | `PsdManager-{version}-windows-x64-installer.exe` |
| Windows x64 | 免安装版 | `PsdManager-{version}-windows-x64-portable.exe` |
| macOS Apple Silicon（arm64） | DMG 安装包 | `PsdManager-{version}-macos-arm64-installer.dmg` |

当前发布流程未提供 Linux、Intel Mac 和 Windows ARM64 安装包，也未完成这些平台的运行验证。

### Windows

面向 Windows 10/11 桌面环境，需要 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。如果系统缺少此运行时，请先安装。

安装版按向导安装；免安装版可直接运行，数据保存在程序同目录的 `Psd Manager/` 文件夹中。移动或备份免安装版时，请同时保留该文件夹，并将程序放在可写目录中。

### macOS

打开 DMG，将应用拖入“应用程序”目录。

当前发布包尚未配置 Apple Developer ID 签名和公证。如果系统提示“应用已损坏，无法打开”，请先确认文件来自本项目可信的 Release，再执行：

```bash
xattr -dr com.apple.quarantine "/Applications/Psd Manager.app"
```

### 使用提示

关闭主窗口后，程序会驻留系统托盘；需要完全退出时，请使用托盘菜单中的“关闭程序”。

## 数据与备份

资产库使用 AES-256-GCM 加密。启用启动主密码后，使用 Argon2 派生密钥保护资产库密钥；未启用时，资产库密钥保存在本机。应用锁不能替代操作系统账号和设备本身的安全保护。

可以在“设置 → 关于”查看当前运行模式及实际数据目录。数据目录主要分为：

```text
Psd Manager/
├── data/      # 加密资产库、密钥配置和本地数据备份
└── config/    # 应用偏好和本机窗口状态
```

在“设置 → 数据”中可以创建加密备份或从备份恢复。加密备份使用独立备份密码，可用于跨电脑迁移；请妥善保存备份密码和恢复密钥文件。

**JSON、YAML 和 Excel 导出文件包含明文账号、密码和密码历史。** 请仅保存到可信位置；需要完整加密备份时，使用 `.psdbackup` 功能。

## 本地开发

### 环境要求

- **Node.js 24 LTS** 和 npm，推荐使用此版本进行开发。
- **Rust stable**，建议通过 [rustup](https://rustup.rs/) 安装。
- **macOS**：安装 Xcode Command Line Tools，可执行 `xcode-select --install`。
- **Windows**：安装 Visual Studio Build Tools，勾选“使用 C++ 的桌面开发”及 Windows SDK，并安装 WebView2 Runtime。

桌面构建环境的完整要求见 [Tauri 2 开发前置条件](https://v2.tauri.app/start/prerequisites/)。

### 获取代码并启动

```bash
git clone https://github.com/FYanJun/Psd-manager.git
cd Psd-manager
npm ci
npm run tauri:dev
```

该命令会同时启动 Vite 开发服务和 Tauri 桌面窗口。首次启动需要下载并编译 Rust 依赖，耗时会较长。

只调试前端界面时，可以运行：

```bash
npm run dev
```

然后访问 <http://127.0.0.1:5173>。浏览器预览用于界面开发；加密资产库存取、系统托盘、开机自启和备份恢复等原生能力需要在 Tauri 桌面环境中验证。

### 检查与构建

| 命令 | 用途 |
| --- | --- |
| `npm run check:type` | TypeScript 类型检查 |
| `npm run check:rust-format` | Rust 格式检查 |
| `npm run check:rust` | Rust 编译检查 |
| `npm run test:rust` | Rust 库测试 |
| `npm run build` | 仅构建前端资源，输出到 `dist/` |
| `npm run tauri -- build` | 构建当前平台的桌面应用及安装包 |

桌面构建产物位于 `src-tauri/target/release/`，安装包位于其中的 `bundle/` 目录。跨平台发布由 [GitHub Actions](.github/workflows/release.yml) 在对应系统上分别构建，当前工作流通过 `v*` 标签触发。

### 项目结构与开发约定

```text
src/
├── components/       # 工作区、弹窗和通用界面组件
├── lib/              # 数据模型、业务控制器和前后端接口
└── styles/           # 主题、语义样式和布局
src-tauri/
├── src/              # Rust 原生命令、加密、存储和备份
└── tauri.conf.json   # Tauri 应用及打包配置
```

修改后建议先执行类型检查和前端构建，再执行 Rust 格式、编译检查及库测试。涉及原生能力、数据安全或恢复流程时，还需在桌面应用中验证启动锁定、保存与重启、备份恢复和托盘行为；浏览器预览不能替代这些验证。

## 技术栈

| 领域 | 技术 |
| --- | --- |
| 桌面框架 | Tauri 2 |
| 前端 | Svelte 5、TypeScript、Vite |
| 界面组件与图标 | Bits UI、Floating UI、Lucide |
| 原生逻辑 | Rust、Serde |
| 加密与密钥派生 | AES-256-GCM、Argon2 |
| 文件交换 | JSON、YAML、SheetJS（XLSX） |
| 持续集成与发布 | GitHub Actions |

## 问题反馈与贡献

欢迎通过 [Issues](https://github.com/FYanJun/Psd-manager/issues) 提交问题或功能建议，通过 Pull Request 参与改进。报告问题时，请附上应用版本、操作系统、复现步骤及相关错误信息；示例数据和截图请使用虚构设备与账号，避免包含真实密码、恢复密钥或其他敏感信息。

## 开源协议

Copyright (C) 2026 FanYanJun。

本项目采用 [GNU Affero General Public License v3.0 only（AGPL-3.0-only）](LICENSE)。允许使用、修改和商用；分发本项目或修改版本时，须遵守协议的许可证保留、对应源码提供等要求。若修改后的程序支持通过网络与用户交互，还须按协议第 13 条向这些用户提供获取对应源码的机会。

本软件按“现状”提供，不提供任何担保，具体条款以 LICENSE 全文为准。第三方依赖和素材保留各自的许可证及版权声明。
