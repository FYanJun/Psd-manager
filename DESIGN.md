# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-06-30
- Primary product surfaces: 密码管理器桌面应用、设备类型、设备列表、账号详情、密码历史、随机密码生成器、单个改密、批量改密、配置导入导出。
- Evidence reviewed: 用户提供的 1Password 风格参考截图；当前 Svelte/Tauri 实现；README；组件拆分后的源码结构。

## Brand
- Personality: 安静、清晰、可靠、本地工具感，接近 macOS 原生桌面应用和 1Password 的三栏管理体验。
- Trust signals: 稳定的三栏布局、明确的设备与账号边界、当前密码与历史密码区分、可扫描的设备条目、保守的颜色、清晰的时间记录。
- Avoid: 营销页、夸张渐变、大面积装饰图、卡片堆叠、后台管理系统式大表格、过度拟物。

## Product goals
- Goals: 本地保存真实设备资产和账号密码；记录密码更新历史；按设备名称、IP、资产编号和设备位置快速查找；快速生成随机密码；支持明文查看和复制；支持 JSON、CSV、INI 配置导入导出。
- Non-goals: 不做应用锁；不强制加密展示；第一版不做多人协作、云同步、权限系统。
- Success signals: 用户可以在 1-2 次点击内找到设备当前密码；更新密码后旧密码自动可追溯；随机密码生成不打断当前编辑流程；导入配置前能清楚知道是否覆盖现有数据。

## Personas and jobs
- Primary personas: 家庭/个人运维用户、小团队设备管理员、NAS/路由器/服务器维护者。
- User jobs: 查找设备登录信息；更新单个账号密码；按用户名和设备类型批量改密；回看旧密码；生成符合规则的新密码；导入和导出配置。
- Key contexts of use: 桌面端本地使用，常见屏幕为笔记本和外接显示器；用户经常需要边配置设备边复制密码。

## Information architecture
- Primary navigation: 左侧侧边栏为设备类型；中间为设备列表；右侧为设备信息、账号和密码历史。
- Core routes/screens: 主工作台、设备详情、新增/编辑设备、新增/编辑账号、密码更新、批量改密、随机密码生成、配置导入和导出设置。
- Content hierarchy: 左侧导航控制设备类型范围；中间列表只展示设备；右侧详情展示设备信息、账号、密码历史和账号级操作。
- Boundary rules: IP、资产编号、设备位置、设备名称、设备类型和设备备注属于设备；用户名、密码、账号标签和密码历史属于账号；右键菜单必须跟随当前区域语义，不能把账号操作混到设备区域。

## Design principles
- Principle 1: 三栏优先。界面要像本地资产凭据库，不像网页后台。
- Principle 2: 扫描优先。设备名、账号、IP、资产编号、设备位置、设备类型图标和最后更新时间必须一眼可见。
- Principle 3: 操作分区。设备、设备类型、账号、密码历史各自有清晰入口，不用重复按钮堆叠。
- Principle 4: 编辑克制。详情页默认阅读态，编辑通过顶部按钮、区域按钮或弹窗进入。
- Tradeoffs: 第一版优先桌面体验；窄屏可退化为列表/详情双视图，不强求完整移动端体验。

## Visual language
- Color: 左侧为浅灰侧栏；内容区为白色；主操作按钮使用蓝色；设备类型图标使用低饱和色块；危险操作使用红色。
- Typography: 使用系统字体栈；标题 24-28px；列表主标题 16-18px；辅助文本 13-14px；表单标签 12-13px。
- Spacing/layout rhythm: 顶部工具栏约 56-64px；主工作区按比例划分，左栏默认约 14%，设备列表约占剩余工作区 21%，详情区占剩余空间；内容间距 16/24px。
- Shape/radius/elevation: 列表选中项和字段组使用 8px 左右圆角；少用阴影，主要用边框和背景层级。
- Motion: 只做轻量 hover、选中、弹窗过渡；不做复杂动画。
- Imagery/iconography: 使用 lucide 图标；设备类型使用稳定图标和低饱和色块；按钮在收窄时可以只保留图标，但 hover tooltip 必须居中显示文案。

## Components
- Existing components to reuse: 当前仓库已有拆分后的 Svelte 组件。
- Current components: SidebarPane、DeviceListPane、DeviceDetailPane、AppDialog、ActionPopover、PasswordGeneratorDrawer、ConfirmationDialog、StatusToast、Topbar、ClearableInput、ClearableTextarea。
- Variants and states: 列表项默认/hover/选中；账号复选框默认/选中/禁用；密码字段隐藏/显示/复制；详情阅读/编辑；历史记录展示；空列表；搜索无结果；toast 默认自动关闭/hover 暂停关闭。
- Token/component ownership: 前端统一定义颜色、间距、圆角、字体尺寸变量；组件不各自硬编码主题。

## Accessibility
- Target standard: 尽量满足 WCAG AA 的颜色对比和键盘可达性。
- Keyboard/focus behavior: 搜索框、列表、复制、编辑、生成密码支持键盘焦点；焦点态清晰但不喧宾夺主。
- Contrast/readability: 正文和辅助文字保持足够对比，密码点位和链接颜色需可读。
- Screen-reader semantics: 列表、按钮、表单字段、密码显示开关应有明确 aria label。
- Reduced motion and sensory considerations: 遵守 reduced-motion，动画可关闭或极短。

## Responsive behavior
- Supported breakpoints/devices: 主要支持 1280px 以上桌面；1024px 可用；窄屏折叠侧边栏并切换列表/详情。
- Layout adaptations: 宽屏三栏；不同窗口尺寸下左栏、设备列表和详情区按比例缩放；中等屏收紧按钮和行内间距，避免固定像素宽度导致变形。
- Touch/hover differences: 桌面优先，按钮点击区域不小于 36px；hover 状态不能作为唯一信息来源；仅图标按钮必须有 tooltip。

## Interaction states
- Loading: 首次加载显示列表骨架或简单占位。
- Empty: 无设备时详情区显示新增入口，避免营销式说明。
- Error: 数据保存失败、配置读取失败、配置格式不正确、导出失败、复制失败在顶部 toast 或局部弹窗显示明确错误。
- Success: 保存、覆盖导入、导出和复制后用轻量 toast 或按钮状态反馈。
- Disabled: 无选中项时编辑、删除、复制、批量改密禁用；无设备类型时不能显示“新增此类设备”。
- Offline/slow network, if applicable: 第一版本地应用，无网络依赖。
- Context menus: 左栏、列表栏、详情栏右键菜单层级和排序规则应统一；再次右键新区域时直接切换菜单，不需要先关闭再点一次。
- Dialogs: 弹窗默认可关闭，关闭按钮清晰；弹窗中的必填字段不能保存为空；密码输入默认隐藏，但显示/隐藏开关必须可用。
- Password generator: 长度范围 3-24，默认 8；从单个改密或批量改密入口打开时，只能回填到当前来源，不允许跨流程跳转。
- Config files: JSON、CSV、INI 导出都使用中文字段名。JSON 和 INI 保持设备类型、设备、账号、密码历史的层级结构；CSV 使用单表格式，第一行是中文表头，下面按设备类型、设备名称、用户名一条账号一行展示，密码历史作为数组写入单元格。导入只接受当前中文配置格式，不再兼容旧版英文 JSON、旧版分段 CSV 或旧版 `[account.*]` INI。

## Content voice
- Tone: 简短、工具化、中文为主。
- Terminology: 使用“设备”表示真实设备或资产；使用“账号”表示某台设备下的一组用户名和密码；使用“设备类型”区分路由器、NAS、服务器等；使用“密码历史”表示旧密码记录。
- Microcopy rules: 按钮用明确动词，如“新增设备”“编辑设备”“新增账号”“复制密码”“生成密码”；字段名保持短词，如“用户名”“密码”“IP 地址”“资产编号”“设备位置”“最后编辑”；避免“用户信息”等容易和设备/账号边界混淆的文案。

## Implementation constraints
- Framework/styling system: Tauri v2 + Rust 后端；Svelte + TypeScript + Vite 前端；本机应用存储。
- Design-token constraints: 使用 CSS 变量或 Svelte store 管理主题 token；不引入重型 UI 框架。
- Performance constraints: 本地列表搜索即时响应；列表超过数千条时再考虑虚拟列表。
- Compatibility constraints: 优先 macOS 观感，同时支持 Windows；窗口最小宽度建议 1024px；Windows 发布版应使用 GUI subsystem，避免启动时出现额外终端窗口。
- Test/screenshot expectations: 本地变更至少运行 `npm test`、`npx tsc --noEmit`、`npm run build`；界面变更需要用桌面版预览检查，不以纯网页预览代替最终桌面行为。
- Release constraints: 默认只开本地桌面预览，不自动打包、不自动推送；只有用户明确要求发布时才推送 tag 触发 GitHub Actions。
- Local release helper: 用户本机外层有 `/Users/fan/飞牛同步/开发/密码管理工具-提交并发布.command`，用于手动输入版本号、提交说明、测试构建、提交、打 tag 和推送；该脚本不属于仓库内容。

## Open questions
- [ ] 是否需要后续把“账号标签”扩展为可筛选维度，而不仅是展示和编辑字段？
- [ ] 是否需要支持附件、备注富文本、SSH 私钥等非密码类型？
- [ ] 是否需要 Apple Developer ID 签名和 notarization，彻底解决 macOS Gatekeeper 提示？
