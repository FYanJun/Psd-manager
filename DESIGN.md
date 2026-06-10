# Design

## Source of truth
- Status: Draft
- Last refreshed: 2026-06-09
- Primary product surfaces: 设备密码管理桌面应用、密码历史、随机密码生成器、导入导出。
- Evidence reviewed: 用户提供的 1Password 风格参考截图；当前仓库暂无 README、UI 源码、组件库、设计系统或产品文档。

## Brand
- Personality: 安静、清晰、可靠、本地工具感，接近 macOS 原生桌面应用和 1Password 的三栏管理体验。
- Trust signals: 稳定的三栏布局、明确的当前密码与历史密码区分、可扫描的设备条目、保守的颜色、清晰的时间记录。
- Avoid: 营销页、夸张渐变、大面积装饰图、卡片堆叠、后台管理系统式大表格、过度拟物。

## Product goals
- Goals: 本地保存设备账号密码；记录密码更新历史；快速查找设备；快速生成随机密码；支持明文查看和复制。
- Non-goals: 不做应用锁；不强制加密展示；第一版不做多人协作、云同步、权限系统。
- Success signals: 用户可以在 1-2 次点击内找到设备当前密码；更新密码后旧密码自动可追溯；随机密码生成不打断当前编辑流程。

## Personas and jobs
- Primary personas: 家庭/个人运维用户、小团队设备管理员、NAS/路由器/服务器维护者。
- User jobs: 查找设备登录信息；更新设备密码；回看旧密码；生成符合规则的新密码；导出备份。
- Key contexts of use: 桌面端本地使用，常见屏幕为笔记本和外接显示器；用户经常需要边配置设备边复制密码。

## Information architecture
- Primary navigation: 左侧侧边栏为资料、所有项目、收藏夹、类别、保险库、标签。
- Core routes/screens: 主工作台、设备详情、新增/编辑项目、密码更新、随机密码生成、导入导出设置。
- Content hierarchy: 左侧导航控制范围；中间列表展示条目；右侧详情展示当前项目字段、密码历史和操作。

## Design principles
- Principle 1: 三栏优先。界面要像本地密码库，不像网页后台。
- Principle 2: 扫描优先。设备名、账号、IP、类别图标和最后更新时间必须一眼可见。
- Principle 3: 编辑克制。详情页默认阅读态，编辑通过顶部按钮或弹窗进入。
- Tradeoffs: 第一版优先桌面体验；窄屏可退化为列表/详情双视图，不强求完整移动端体验。

## Visual language
- Color: 左侧为浅灰侧栏；内容区为白色；主操作按钮使用蓝色；类别图标使用低饱和色块；危险操作使用红色。
- Typography: 使用系统字体栈；标题 24-28px；列表主标题 16-18px；辅助文本 13-14px；表单标签 12-13px。
- Spacing/layout rhythm: 顶部工具栏约 56-64px；左栏 240-280px；列表栏 360-420px；详情区自适应；内容间距 16/24px。
- Shape/radius/elevation: 列表选中项和字段组使用 8px 左右圆角；少用阴影，主要用边框和背景层级。
- Motion: 只做轻量 hover、选中、弹窗过渡；不做复杂动画。
- Imagery/iconography: 使用 lucide 图标；条目头像使用类别色块加短字母或图标，保持固定尺寸。

## Components
- Existing components to reuse: 当前仓库暂无。
- New/changed components: AppShell、Sidebar、VaultSection、ItemList、ItemRow、DetailPane、CredentialField、PasswordHistoryList、PasswordGeneratorPanel、EditItemDialog、UpdatePasswordDialog、TagFilter。
- Variants and states: 列表项默认/hover/选中；密码字段显示/隐藏/复制；详情阅读/编辑；历史记录折叠/展开；空列表；搜索无结果。
- Token/component ownership: 前端统一定义颜色、间距、圆角、字体尺寸变量；组件不各自硬编码主题。

## Accessibility
- Target standard: 尽量满足 WCAG AA 的颜色对比和键盘可达性。
- Keyboard/focus behavior: 搜索框、列表、复制、编辑、生成密码支持键盘焦点；焦点态清晰但不喧宾夺主。
- Contrast/readability: 正文和辅助文字保持足够对比，密码点位和链接颜色需可读。
- Screen-reader semantics: 列表、按钮、表单字段、密码显示开关应有明确 aria label。
- Reduced motion and sensory considerations: 遵守 reduced-motion，动画可关闭或极短。

## Responsive behavior
- Supported breakpoints/devices: 主要支持 1280px 以上桌面；1024px 可用；窄屏折叠侧边栏并切换列表/详情。
- Layout adaptations: 宽屏三栏；中等屏左栏收窄；窄屏左栏可图标化或隐藏。
- Touch/hover differences: 桌面优先，按钮点击区域不小于 36px；hover 状态不能作为唯一信息来源。

## Interaction states
- Loading: 首次加载显示列表骨架或简单占位。
- Empty: 无设备时详情区显示新增入口，避免营销式说明。
- Error: 数据保存失败、导入失败、复制失败在局部显示错误。
- Success: 保存后用轻量 toast 或按钮状态反馈。
- Disabled: 无选中项时编辑/分享/复制禁用。
- Offline/slow network, if applicable: 第一版本地应用，无网络依赖。

## Content voice
- Tone: 简短、工具化、中文为主。
- Terminology: 使用“项目”表示一条设备登录信息；使用“类别”区分登录信息、身份标识、SSH 密钥等；使用“密码历史”表示旧密码记录。
- Microcopy rules: 按钮用动词，如“新的项目”“编辑”“复制”“生成”；字段名保持短词，如“用户名”“密码”“网站”“最后编辑”。

## Implementation constraints
- Framework/styling system: Tauri v2 + Rust 后端；Svelte + TypeScript + Vite 前端；SQLite 本地数据库。
- Design-token constraints: 使用 CSS 变量或 Svelte store 管理主题 token；不引入重型 UI 框架。
- Performance constraints: 本地列表搜索即时响应；列表超过数千条时再考虑虚拟列表。
- Compatibility constraints: 优先 macOS 观感，同时支持 Windows/Linux；窗口最小宽度建议 1024px。
- Test/screenshot expectations: 实现后用 Playwright 检查 1440x900、1280x800、1024x768 三种桌面视口；验证三栏不重叠、文字不溢出、选中态清晰。

## Open questions
- [ ] 是否需要保留截图中的“保险库/个人”概念，还是第一版只做单库？
- [ ] 是否需要“资料、收藏夹、类别、标签”全部首版实现，还是先实现“所有项目、类别、标签”？
- [ ] 是否需要支持附件、备注富文本、SSH 私钥等非密码类型？
