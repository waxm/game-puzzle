# 光影拼图工程说明

## 项目范围

- 引擎版本：Cocos Creator 3.8.4。
- 设计尺寸：竖屏 `640 x 1136`。
- 当前正式内容只包含可复用框架和拼图游戏业务。
- 一次性试验、外部设计转换产物和已经停用的玩法不得留在正式目录中。

## 代码结构

```text
assets/app/
  core/               # 与具体玩法无关的可复用框架
  game/               # 拼图配置、状态、控制器和纯逻辑
  scenes/             # Boot、Lobby、Game 场景脚本
  ui/
    common/           # 通用错误恢复面板
    home/             # 大厅面板
    game/             # 拼图主面板、拼图块和边框渲染
    popup/            # 通关与失败弹窗

assets/scene/          # Boot、Lobby、Game 场景资源
assets/resources/
  prefabs/             # 按 common、home、game、popup 分类的正式 Prefab
  textures/game/levels # 按关卡编号存放的拼图完整原图
```

## 核心框架

```text
App                    # 框架初始化、服务注册和全局重置
Logger                 # 分级日志
EventCenter            # 全局事件通信和按 owner 清理
StorageManager         # 本地存档
ResManager             # 资源句柄、引用计数和 Bundle 管理
UIBase / UIManager     # UI 生命周期、缓存和并发打开管理
SceneBase / SceneManager # 场景生命周期、切换结果和失败回滚
AudioManager           # 跨场景音乐与音效
PoolManager            # 带资源所有权的节点对象池
TimerManager           # 延迟、循环计时和按 owner 清理
```

资源、事件、计时器、Tween、按钮回调和节点监听都必须有明确所有者，并在对应生命周期结束时释放。异步操作返回后必须重新确认请求和宿主对象仍然有效。

## 启动流程

```text
BootScene
  -> App.init()
  -> 加载 Lobby.scene

LobbyScene
  -> 打开 UIHomePanel
  -> 读取已解锁关卡
  -> 选择关卡并加载 Game.scene

GameScene
  -> 打开 UIGamePanel
  -> 创建 PuzzleGameController
  -> 运行关卡、结算、重玩、切关或返回大厅
```

场景或 UI 加载失败时必须显示明确的重试和返回入口。Game 面板成功打开后才能创建控制器，避免初始状态事件早于 UI 监听。

## 拼图规则

- 关卡只保存完整原图，运行时根据 `rows × columns` 切分 SpriteFrame。
- 棋盘为无空隙规则网格，拼图落点必须位于有效格子。
- 正确相邻的拼图形成软组合，拖拽时整组一起移动。
- 源组合保持形状，目标位置已有组合允许按移动结果拆分。
- 移动规划必须先生成完整双射，再一次性提交棋盘占用状态。
- 每次有效移动后重新计算组合、最大连接数量和组合外围边框。
- 全部拼图进入同一组合时完成关卡；限时关卡耗尽时间后失败。

## 关卡资源

每关使用固定目录和文件名：

```text
textures/game/levels/level_001/level_001_source.png
textures/game/levels/level_002/level_002_source.png
```

每关完整玩法参数维护在 `assets/resources/configs/game/levels/level_XXX.json`。运行
`npm run editor:levels` 可视化编辑，运行 `npm run generate:levels` 根据 JSON 与真实资源目录
生成轻量关卡索引；运行时加载路径必须以 `/spriteFrame` 结尾，关卡 SpriteFrame 必须关闭动态合图。

## Prefab 约束

- 正式 Prefab 必须按模块存放；当前只使用 `prefabs/common`、`prefabs/home`、`prefabs/game` 和 `prefabs/popup`。
- UI 节点结构只来源于 Prefab，业务脚本不得运行时补建或递归查找节点。
- 脚本使用的节点和组件必须通过 `@property` 在 Inspector 显式绑定。
- 新增正式 Scene 或 Prefab 时必须登记到 `tools/cocos-asset-manifest.mjs`。

## 验证入口

```text
npm run typecheck              # TypeScript 编译检查
npm run verify:core            # 核心框架验证
npm run verify:puzzle-progress # 关卡进度与异步 JSON 加载验证
npm run validate:levels        # 关卡配置与图片检查
npm run verify:level-editor    # 关卡编辑器与保存接口验证
npm run verify:puzzle-groups   # 拼图组合和轮廓验证
npm run verify:puzzle-drag     # 拖拽规则与死局模拟
npm run validate:cocos         # Scene、Prefab、UUID 和绑定校验
npm run verify                 # 执行全部验证
```
