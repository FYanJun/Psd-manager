# 密码管理器

![应用图标](src-tauri/icons/icon.png)

密码管理器是一个轻量级设备密码管理工具，用来集中记录真实设备资产、账号密码、密码历史和批量改密记录。应用采用 Rust + Tauri + Svelte 构建，数据默认保存在本机。

适合记录服务器、交换机、路由器、NAS、工控机等真实设备资产，以及这些设备对应的登录账号和密码。

## 功能

- 设备资产管理：记录设备名称、设备类型、IP、资产编号、设备位置、备注等信息。
- 账号管理：同一台设备可以保存多个用户名和密码。
- 密码变更记录：更新密码时保留旧密码，并记录新密码和旧密码。
- 随机密码生成器：支持 3-24 位长度，默认 8 位，可按场景选择生成规则，并可填入当前账号或批量改密。
- 搜索：按设备名称、IP、资产编号和设备位置进行模糊搜索。
- 批量改密：可以按设备类型和用户名筛选账号，并将同一个新密码应用到选中的账号。
- 数据快照：删除设备、账号、类型或执行配置导入前自动保存加密快照，支持即时撤销和手动恢复。
- 右键菜单：设备类型、设备和账号支持对应的常用操作菜单。
- 操作提示：复制、导入导出、保存等提示会自动关闭，鼠标悬停时会暂停关闭；破坏性操作完成后可直接撤销。
- 配置导入导出：支持 JSON、CSV、YAML 配置文件导入和导出；完整校验后可选择全部覆盖或仅新增。
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

### Windows 运行环境

Windows 版本基于 Tauri，需要系统包含 Microsoft Edge WebView2 Runtime。大多数 Windows 10/11 已内置；如果某台电脑无法打开应用，可以先安装 WebView2 Runtime。

### macOS 提示“已损坏”

当前 macOS 安装包未配置 Apple Developer ID 签名和公证。通过 Chrome/GitHub 下载后，macOS Gatekeeper 可能提示“应用已损坏，无法打开”。这通常不是文件真的损坏，而是下载隔离标记导致的拦截。

把应用拖到“应用程序”后，执行：

```bash
xattr -dr com.apple.quarantine "/Applications/密码管理器.app"
```

然后重新打开应用。

要彻底消除这个提示，需要配置 Apple Developer ID 证书并在发布流程中完成 notarization。

## 数据和安全说明

- 当前版本不做应用锁；正常启动不要求输入主密码。
- 桌面版资产库使用 AES-256-GCM 透明加密，随机密钥保存在应用数据目录的 `vault.key` 文件中，并在 macOS/Linux 上限制为当前用户可读写。正常启动、保存和退出不会调用系统钥匙串，也不会弹出系统密码验证。
- 已经由旧版本加密的资产库会先显示“迁移旧版资产库”入口；只有用户主动点击迁移时才读取一次旧钥匙串密钥，验证能解密现有资产库后再写入本地密钥文件。
- 旧版明文本地数据会在首次启动时迁移；只有加密写入并读回校验成功后才删除旧数据。
- 资产库使用明确的数据版本和修订号；遇到未知版本或其他进程改写的数据时会停止保存并显示具体原因，不会静默覆盖。
- 桌面版只允许一个应用实例写入资产库，并在读写期间使用跨进程文件锁；重复启动会切回已经打开的窗口。
- 主资产库损坏但安全备份仍可用时不会静默回退；应用会阻止进入并显示“恢复安全备份”，确认后才替换主库。
- 保存失败时当前修改会继续保留在界面中，可直接重试；退出会被阻止，只有二次确认“放弃未保存修改”后才退出，全程不要求验证密码。
- 窗口失焦时会立即隐藏当前密码、历史密码和表单中已经显示的密码。
- `vault.key` 与加密资产库缺一不可；卸载、清理应用数据或丢失密钥文件前建议先导出可信备份。因为密钥与资产库位于同一用户目录，这种方案用于避免明文落盘和误读，不能抵御已经取得当前系统账号文件访问权限的攻击者。
- 导出的配置文件名会带日期和时间，例如 `密码管理器配置-2026-06-12-15-42.json`，便于保留同一天的多份配置。
- 导出时可以选择 JSON、CSV、YAML。三种格式都使用中文字段名，便于人工查看和编辑。
- JSON 和 YAML 使用相同的中文层级结构：先列 `元信息`，再按 `设备类型` 分组；每个设备类型下包含 `设备`，每台设备下包含 `账号` 和 `密码历史`。YAML 更适合人工阅读和手动编辑。
- CSV 使用单表格式：第一行是中文字段表头，下面按 `设备类型`、`设备名称`、`用户名` 一条账号一行展示。同一设备有多个账号时会重复设备信息，`密码历史` 会作为数组写在单元格里。
- YAML 导出统一使用 `.yaml` 扩展名；导入时同时接受 `.yaml` 和 `.yml`。
- 导入支持 JSON、CSV、YAML。文件会先完成整体验证，确认时可选择“仅新增”或“全部覆盖”，并分别显示实际会发生的设备、账号、类型增删改数量。
- 设备类型、设备、账号和密码历史都保存独立 UUID。UUID 只用于内部身份识别和配置导入导出，正常界面不展示；数字 ID 继续用于本地列表选择和排序。
- “仅新增”只按 UUID 识别设备类型、设备和账号；改名不会变成新记录，同名也不会被视为同一记录。已有设备字段、已有账号、密码和历史记录保持不变，只补充 UUID 尚不存在的数据。
- 当前配置格式为 v3，JSON、CSV、YAML 都包含 `设备类型UUID`、`设备UUID`、`账号UUID` 和 `历史UUID`。旧格式导入时会生成新的 UUID，因此“仅新增”会将其视为新数据；若名称与现有记录冲突会明确报错，需要用旧文件恢复整体数据时请选择“全部覆盖”。
- “全部覆盖”以导入文件为准，整体替换当前设备、账号、密码历史和类型。
- 两种导入方式执行前都会自动保存加密快照，导入完成后可以立即撤销。
- 导入文件中，同一设备类型下不能有同名设备，同一设备下不能有同名账号；发现重复或必填名称缺失时会显示具体设备、账号和错误原因，不会执行覆盖。
- 导入只接受当前中文配置格式；旧版英文 JSON、旧版分段 CSV 和 INI 配置不再支持。
- 配置文件无法读取和格式不正确会显示不同提示，方便区分文件权限问题和内容问题。
- JSON、CSV 和 YAML 都不会加密数据；导出的配置包含明文账号、密码和密码历史，请只保存在可信位置。

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

## 项目结构

当前前端已经按页面、组件和命令逻辑拆分：

```text
src/App.svelte                    应用状态编排、持久化、快捷键、导入导出入口
src/components/Topbar.svelte       顶部搜索、前进后退、新增、批量改密、密码生成器入口
src/components/SidebarPane.svelte  左侧设备类型栏
src/components/DeviceListPane.svelte
                                  中间设备列表
src/components/DeviceDetailPane.svelte
                                  右侧设备详情、账号、密码历史
src/components/AppDialog.svelte    新增/编辑设备、账号、类型、单个改密、批量改密弹窗
src/components/ActionPopover.svelte
                                  右键菜单和更多操作菜单
src/components/PasswordGeneratorDrawer.svelte
                                  随机密码生成器抽屉
src/components/ConfirmationDialog.svelte
                                  删除、配置导入方式与操作确认弹窗
src/components/StatusToast.svelte  顶部操作提示
src/components/VaultSnapshotsDialog.svelte
                                  加密快照列表和恢复入口
src/lib/types.ts                   共享类型
src/lib/constants.ts               应用常量、默认设备类型、布局尺寸
src/lib/vault.ts                   设备/账号标准化、搜索、账号同步
src/lib/device-commands.ts         复制内容、批量改密匹配、密码历史更新
src/lib/password-generator.ts      随机密码生成规则和预设
src/lib/password-strength.ts       基于 zxcvbn 的密码强度评估
src/lib/persisted-vault.ts         资产库数据版本校验和旧版迁移
src/lib/vault-recovery.ts          安全快照和配置差异计算
src/lib/config.ts                  JSON、CSV、YAML 配置导入导出和摘要
src/lib/layout.ts                  分栏尺寸限制、设备类型排序
src/lib/utils.ts                   日期、字符串、模糊搜索等通用工具
scripts/smoke-test.mjs             轻量结构和行为回归检查
```

原则上，页面展示放在 `src/components/`，可复用业务命令放在 `src/lib/`，`src/App.svelte` 只保留跨组件状态和应用级流程。

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


## 技术栈

- Rust
- Tauri 2
- Svelte 5
- Vite
- Lucide Icons
