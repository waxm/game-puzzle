# AGENTS.md

## 项目基础

- 游戏名称：`光影拼图`。
- 仓库名称：`game-puzzle`。
- 业务模块名：`puzzle`。
- 引擎版本：Cocos Creator `3.8.4`。
- 设计尺寸：竖屏 `640 x 1136`。
- 通用框架来自 `cocos-game-framework` 的已验证 `dev` 基线 `eecf94ba6c2a113a5c03eb09df4f03d953e59ad1`。
- 根目录 `FRAMEWORK_BASELINE.json` 必须记录框架来源仓库、分支、提交哈希、Creator 版本和创建时间，不得删除、手工模糊化或只写“来自最新版框架”。
- `package.json` 的名称和 UUID、存档前缀、日志前缀必须为当前游戏独立配置，不得沿用框架默认值或其他游戏值。
- 创建器生成的 `verify:game` 只覆盖脚手架契约；开始实现玩法时必须追加纯规则和状态测试，禁止把脚手架通过当成玩法完成。

## 规则优先级与项目例外

- 本文件中的通用约束默认适用于整个游戏仓库。
- 个别游戏确实需要偏离通用约束时，必须在本文件的“项目例外”章节记录原因、影响范围、替代方案和验证方式。
- 项目例外只对明确列出的文件或模块生效，不得使用“玩法特殊”等笼统描述整体放宽约束。
- 临时方案必须标明移除条件，不得长期作为未登记的隐式例外存在。

## 默认三场景结构

独立小游戏默认包含以下三个正式场景：

```text
Boot.scene    # 启动与框架初始化
Lobby.scene   # 大厅、开始入口和非玩法设置
Game.scene    # 核心玩法
```

默认流转关系：

```text
Boot -> Lobby -> Game
          ^        |
          |--------|
```

- `Boot` 只负责 `App.init()`、项目配置、必要预加载、存档迁移和启动失败恢复，完成后通过 `SceneManager` 进入 `Lobby`。
- `Lobby` 负责开始游戏、关卡或模式入口、设置等非玩法交互，不运行核心玩法模拟。
- `Game` 负责玩法状态、规则计算、输入、暂停、成功、失败和重开；退出时必须完整清理本局状态。
- 从 `Game` 返回大厅必须通过 `SceneManager` 进入 `Lobby`，不得直接调用 `director.loadScene()`。
- 每个场景必须有且只有一个继承 `SceneBase` 的入口组件，场景所需根节点通过 Inspector 显式绑定。
- 结算优先作为 `Game` 场景内的 Prefab 面板实现，不因为一个弹窗额外创建场景。
- 若游戏不需要大厅、需要多个玩法场景或采用其他流程，必须登记为项目例外，并同步修改自动化测试、场景清单和预览验收路径。

## 目录与依赖边界

```text
assets/app/core/                         # 通用框架，不含游戏业务
assets/app/game/puzzle/domain/    # 纯规则、状态和数据模型
assets/app/game/puzzle/config/    # 关卡与玩法配置
assets/app/game/puzzle/controller/# 玩法流程编排
assets/app/game/puzzle/view/      # 玩法表现组件
assets/app/ui/<module>/                  # 大厅、设置等跨玩法 UI
assets/app/scenes/                       # Boot、Lobby、Game 场景入口
assets/scene/                            # 正式 Scene
assets/resources/game/puzzle/     # 业务 Prefab、Texture、Audio 和数据
tools/                                   # 可重复执行的生成与验证工具
```

- `assets/app/core` 不得依赖 `game`、业务 `ui`、业务场景或具体资源路径。
- `domain` 不得导入 `cc`，不得持有 Node、Component、Prefab 或其他引擎对象。
- `view` 只处理显示和输入转发，不计算胜负、奖励、关卡进度等核心规则。
- `controller` 负责协调模型、视图和服务，不得把规则复制到多个组件。
- 关卡差异优先通过配置表达，不复制整套控制器、模型或场景。
- 脚本不得直接堆在 `game`、`ui`、`prefabs`、`textures` 根目录。
- 移动脚本或资源时必须同时移动对应 `.meta`，保持 UUID 和 Prefab 绑定稳定。
- 一次性脚本、临时资源、设计转换中间产物和构建输出不得进入正式 `assets`。

## 游戏状态与确定性

- 核心玩法必须使用明确状态，例如 `idle`、`running`、`paused`、`success`、`failure`、`disposed`。
- 输入、计时、碰撞和异步结果必须先检查当前状态；成功或失败后不得继续修改分数和关卡结果。
- 开始、暂停、恢复、结束、重开和退出必须允许重复调用，且不会重复注册或遗留旧状态。
- 规则层不得直接依赖 `Math.random()`、`Date.now()` 或真实帧率；随机源和时间步长应可注入，保证自动化测试可复现。
- 数值、路径、目标、掉落和关卡条件必须来自配置，不得散落为 View 或 Controller 中的魔法数字。
- 配置加载后必须做运行时结构和范围校验，禁止只通过 `as T` 假定外部数据正确。

## TypeScript 与命名

- TypeScript 必须启用严格模式，新代码不得通过关闭 `strict`、扩大 `any` 或无依据的类型断言绕过错误。
- 无法避免的引擎边界类型断言必须限制在最小范围，并用中文注释说明原因。
- 所有 TypeScript 注释使用中文。
- 类、接口、枚举、成员变量、常量、公开方法和生命周期方法必须说明用途。
- 状态判断、事件通信、资源释放、坐标换算、数据转换和循环构建等非直观逻辑必须说明原因。
- 业务 `ccclass` 名称必须带模块语义，避免不同 Prefab 使用含义不明的 `GameView`、`Item` 等全局类名。
- Event、Pool、UI、Storage 等字符串键必须集中定义并包含模块命名空间，不得散落匿名字符串。
- 资源路径不得包含空格，不做只改变大小写的重命名，避免不同文件系统产生冲突。

## Prefab、Scene 与节点绑定

- Prefab 是业务 UI 和高频运行对象结构的唯一来源。
- 禁止在业务 UI 脚本中使用 `new Node()` 创建界面节点。
- 高频运行对象必须通过 Prefab 和 `PoolManager` 创建，不在逐帧或高频逻辑中反复 instantiate/destroy。
- 禁止使用递归、`getChildByName()`、Cocos `find()` 等方式查找或兜底补齐节点；此限制不包括正常的 `Array.find()`。
- 脚本需要操作的 Node、Component 和资源引用必须通过 `@property` 暴露并在 Inspector 显式绑定。
- UI 面板必须在 `onLoad()` 调用 `UIBase.assertRequiredBindings()`；场景入口使用 `SceneBase.assertRequiredBindings()`。
- 缺失绑定必须抛出包含组件和字段信息的错误，不得静默跳过或创建替代 UI。
- 禁止直接手写、局部拼接或凭经验修改 `.prefab`、`.scene` 序列化 JSON。
- Prefab 和 Scene 优先通过 Cocos Creator 创建；批量生成必须使用可重复执行并带结构校验的工具。
- 生成工具不得猜测脚本压缩类 ID，必须核对脚本 `.meta` UUID 和 Creator 实际编译结果。
- 正式 Scene 和 Prefab 必须登记到 `tools/cocos-asset-manifest.mjs` 并通过完整覆盖检查。

## 生命周期、事件与输入

- `EventCenter.on()`、`EventCenter.once()` 和 `TimerManager` 业务调用必须传 owner，便于生命周期结束时批量清理。
- `Node.on()`、按钮、触摸、键盘和平台事件必须有对应清理，注册和清理函数都必须幂等。
- 禁止业务使用 `setTimeout()`、`setInterval()`；游戏时间统一使用 `TimerManager` 或受控的 Cocos Scheduler。
- Tween、schedule、自定义回调和外部引用必须在面板关闭、场景退出或对象回收时停止并清空。
- 对象池组件必须在 `reuse()` 恢复全部状态，在 `unuse()` 注销监听、停止计时并清空旧数据。
- 输入只在允许的游戏状态生效；必须处理连续点击、多点触摸、按钮与场景触摸冲突以及暂停期间输入。
- 应用进入后台时必须暂停玩法推进；回到前台后只能恢复进入后台前仍处于运行状态的游戏。

## 异步与资源所有权

- 业务统一通过 `ResManager`、`UIManager` 或 `PoolManager` 加载和实例化资源。
- 禁止业务直接调用 `resources.load()`、重复封装 Bundle API 或直接调用 `director.loadScene()`。
- 加载 SpriteFrame 子资源时必须使用包含 `/spriteFrame` 的完整路径。
- `await` 返回后必须校验组件、节点、请求编号、场景和业务状态仍然有效。
- 面板关闭、场景切换、连续请求和重开游戏时，旧异步结果不得覆盖新状态。
- 加载失败必须记录资源类型、完整路径和原始错误，并提供明确的失败或重试状态。
- 必须明确资源持有者和释放时机；仍被节点、Prefab、SpriteFrame、AudioClip 或缓存引用的资源不得提前释放。
- 场景退出或本局重开后，资源句柄、对象池借出节点和异步任务数量必须回到预期基线。

## 存档与项目配置

- 每个游戏必须使用独立且稳定的存档前缀，同域名部署的多个游戏不得共享未命名空间化的 key。
- 存档结构必须包含版本号；结构变化时提供迁移函数，并对损坏或不兼容数据提供回退。
- 读取外部配置和存档时必须验证类型与范围，不能把 TypeScript 泛型当成运行时校验。
- 禁止把密钥、平台私钥或长期敏感凭证写入仓库、日志或普通 localStorage。
- 调试、测试和生产环境配置必须明确区分；生产包不得携带调试接口或测试数据入口。

## UI 适配与可操作性

- 设计分辨率和适配策略统一由 `App.init()` 应用，默认使用 `640 x 1136` 与 `SHOW_ALL`。
- 业务 Scene、UI 和 Controller 禁止直接调用 `view.setDesignResolutionSize()`；需要偏离默认策略时只能通过 `AppInitOptions.display` 配置并登记项目例外。
- UI 必须先在设计尺寸 `640 x 1136` 下验收。
- 至少额外检查一个短屏比例、一个长屏比例和带安全区的设备尺寸。
- 检查位置、层级、遮挡、越界、文本截断、触摸区域和弹窗阻断关系。
- 关键按钮和核心信息不得依赖异形屏裁切区域；需要时使用 Widget 或安全区容器。
- UI 点击区域必须与视觉范围一致，不得用透明大节点遮挡无关操作。
- Label 必须明确溢出策略；动态文本不得依赖恰好容纳当前示例内容。

## 性能与日志

- 禁止在 `update()` 等逐帧路径中持续创建数组、对象、闭包、字符串或输出日志。
- 高频对象必须池化；不需要逐帧更新的逻辑使用事件或受控计时器。
- 性能预算由游戏仓库按目标平台登记，包括帧率、内存、DrawCall、首包和加载时间。
- 业务禁止直接使用 `console.*`，统一通过 `Logger` 输出。
- 发布版本日志等级至少为 Warn，逐帧调试信息、性能面板和测试入口必须关闭。

## 完成前验证

- 修改 TypeScript 后执行 `npm run typecheck`。
- 修改核心管理器后执行 `npm run verify:core`。
- 修改玩法规则后执行 `npm run verify:game`。
- 修改 Scene、Prefab、脚本绑定或资源 UUID 后执行 `npm run validate:cocos`。
- 提交前执行游戏仓库完整的 `npm run verify`。
- 玩法自动化测试至少覆盖开始、规则边界、暂停恢复、成功、失败、重开、重复输入和退出清理。
- `Boot -> Lobby -> Game -> Lobby` 默认主流程必须进行实际预览；登记例外的游戏按自己的完整流程验收。
- 预览必须检查 Chrome 控制台第一条红色错误，不能只确认画面出现。
- 发布前必须使用非 Debug 配置完成目标平台构建，并对构建产物执行一次真实冒烟测试。
- 无法执行 Creator 导入、实际预览或发布构建时必须明确说明，不能用静态检查替代。

## 光影拼图补充约束

UI 代码、Prefab 和 Texture 继续使用同一套现有模块名：

| 模块 | 用途 | UI 代码 | Prefab | Texture |
| --- | --- | --- | --- | --- |
| `common` | 通用 UI 和资源 | `assets/app/ui/common` | `assets/resources/prefabs/common` | `assets/resources/textures/common` |
| `home` | 首页和大厅 | `assets/app/ui/home` | `assets/resources/prefabs/home` | `assets/resources/textures/home` |
| `game` | 游戏面板、玩法组件和关卡资源 | `assets/app/ui/game` | `assets/resources/prefabs/game` | `assets/resources/textures/game` |
| `popup` | 独立弹窗 | `assets/app/ui/popup` | `assets/resources/prefabs/popup` | `assets/resources/textures/popup` |
| `item` | 列表项和可复用小组件 | `assets/app/ui/item` | `assets/resources/prefabs/item` | `assets/resources/textures/item` |

- 动态加载路径必须包含模块目录；移动资源时同步修改路径、生成工具和文档。
- 关卡原图继续放在 `textures/game/levels/level_XXX`，关卡配置由现有生成和校验工具维护。
- 重新生成现有 Scene、Prefab 或关卡资源时必须保持稳定 UUID，不得破坏已有绑定。
- 拼图吸附、组合、边框、进度和道具规则必须由对应自动化用例覆盖。

## 项目例外

### 现有业务与资源目录

- 原通用约束：业务默认放在单一 `assets/app/game/puzzle` 模块，资源默认放在 `assets/resources/game/puzzle`。
- 例外范围：现有 `assets/app/game`、`assets/app/ui` 和 `assets/resources` 目录。
- 原因：拼图仓库已经按规则、进度、UI 模块、Prefab 类型和关卡资源建立稳定路径，迁移会无收益地改变大量 UUID 与动态加载路径。
- 替代实现：继续遵守上方模块表和现有 game 子目录职责，不允许新增内容重新堆回根目录。
- 验证方式：执行 `npm run verify:game`、`npm run validate:cocos` 和完整预览。

<!-- COCOS_WORKFLOW_RULES_START -->
## 跨电脑开发工作流

- Creator 操作前必须先执行会话检测；目标项目已打开时复用现有 Creator，禁止重复启动。
- 目标项目未打开时必须从 Cocos Dashboard 进入，不直接运行 Creator 可执行文件。
- 预览必须按动态发现的 URL 复用已有 Chrome 标签；只有不存在对应标签时才允许新建。
- 错误排查优先读取本次操作后的编辑器日志增量和浏览器 Console；截图只用于布局、颜色、遮挡等视觉问题。
- 连续两次修复未改变首个错误时必须停止当前假设并重新定位，禁止继续叠加试探补丁。
- 开发内循环使用 `npm run verify:changed`，模块检查点使用 `npm run verify:module -- <module-id>`，提交前才执行完整 `npm run verify`。
- 开发阶段默认只做本地类型、规则、资源、Creator 导入和预览验证。只有用户明确提出构建、打包、发布或上线验收时，才允许执行任何平台构建。
- Git 提交主题必须使用中文记录，并通过项目内 `commit-msg` 钩子校验。
- 工作流配置不得提交用户绝对路径、固定 PID、固定预览端口、浏览器标签 ID 或其他单机状态。
- 本机能力差异只能写入已忽略的 `.cocos-workflow.local.json`，并且只能覆盖示例文件列出的 `machine` 字段，不得放宽团队策略。
<!-- COCOS_WORKFLOW_RULES_END -->
