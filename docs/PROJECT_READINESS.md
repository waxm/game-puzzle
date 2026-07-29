# 光影拼图项目就绪记录

更新时间：2026-07-29

## 本轮目标

本轮只整理“继续添加系统模块前必须稳定的基础”，不提前实现设置、音频界面、选关、教程或商业化系统。核心玩法继续由现有 `puzzle-core` 模块负责。

## 检测结论

| 范围 | 检测结果 | 本轮处理 |
| --- | --- | --- |
| 核心规则 | 棋盘、拖拽、自动组合、成功、失败、重开和销毁已有自动化覆盖 | 保持规则实现不变 |
| Web 适配 | 设计分辨率原来使用 `FIXED_WIDTH`，宽屏 iframe 会裁掉上下内容 | 改为 `SHOW_ALL`，始终完整显示 `640 × 1136` |
| 场景与 UI | 场景名、UI 名和 Prefab 路径散落在三个场景入口 | 收口到 `PuzzleGameKey.ts` |
| 本地进度 | 旧键没有业务命名空间，损坏 JSON 会在每次启动重复解析失败 | 新键改为 `puzzle.progress`，自动迁移并移除旧键 |
| UI 输入边界 | 首页、玩法和结算参数只做部分字段校验 | 补齐范围、字段关系和配置/控制器一致性校验 |
| Web 包体 | 项目原来包含 Bullet、Spine、地形、粒子等未使用模块 | 保留 2D、UI、音频、Tween、渲染模块，以及 Creator 3.8.4 的 SpriteFrame 必需 3D 基础兼容层 |
| 扩展文档 | README 只有基础验证命令，缺少系统扩展入口和发布约束 | 补充模块边界、适配策略和推荐顺序 |

## 发布与适配约定

- 设计尺寸固定为竖屏 `640 × 1136`。
- Cocos 分辨率策略固定为 `SHOW_ALL`。Creator 3.8.4 Web 构建器仍会把初始值写成 `FIXED_WIDTH`，因此 `BootScene` 会在任何业务 UI 打开前显式恢复 `SHOW_ALL`。短屏、长屏、横屏浏览器和 GitHub Pages iframe 都优先保证完整内容，不再以裁切换取铺满。
- 多余区域由 Web 页面背景承接；业务 UI 不读取浏览器尺寸自行二次缩放。
- 关键按钮继续放在设计安全区内。以后若加入刘海屏专属顶栏，再在 Prefab 中增加安全区容器，不修改玩法坐标。

## 性能预算

以下是发布目标，不代表尚未测量的设备已经达标：

| 指标 | 目标 |
| --- | --- |
| 主流移动浏览器帧率 | 稳定 60 FPS |
| 低端设备最低帧率 | 不低于 30 FPS |
| Game 场景 DrawCall | 不高于 50 |
| 峰值内存 | 不高于 150 MB |
| 非 Debug Web 包体 | 不高于 6 MB |
| 首次可交互时间 | 常规 4G 网络不高于 3 秒 |

每次增加系统模块后都要复测包体、首屏、DrawCall 和内存。没有真机或性能面板证据时，只记录“待测”，不得写成“通过”。

Creator 3.8.4 的 `SpriteFrame` 激活流程仍会使用 3D 基础模块中的 `createMesh`，场景全局初始化还会使用 `primitive.box`，因此不能彻底移除 `3d` 和 `primitive`。Creator 内置默认材质还会反序列化 `PhysicsMaterial`，所以保留轻量的 `physics-builtin` 作为编辑器兼容后端；拼图玩法本身不使用物理模拟。当前裁剪继续排除 Bullet/Ammo、Cannon、PhysX、2D 物理、Spine、龙骨、地形、粒子、视频和 WebView 等模块。

## 本轮实测结果

- Cocos Creator `3.8.4` 已完成 `web-mobile`、`debug=false` 构建，构建日志明确记录 `build success`。
- 发布目录文件净大小为 `4,665,905` 字节，磁盘占用约 `5.7 MiB`；引擎脚本为 `1,865,187` 字节。该数据来自引入 `physics-builtin` 兼容后端前的历史构建，本轮未重新打包；后续发布时需复测包体。发布配置仍不包含 Bullet/Ammo、Cannon、PhysX、2D 物理、Spine、龙骨、地形、粒子、视频和 WebView。
- `1280 × 720` 宽屏已跑通 `Boot -> Lobby -> Game -> Lobby`，首页、顶部状态、棋盘、底部道具和操作提示完整可见。
- `375 × 667` 短屏与 `430 × 932` 长屏均实测了 Lobby 和 Game，完整设计区域可见，无上下裁切。
- 最终发布包在上述流程和尺寸下，页面控制台 `warning/error` 数量均为 `0`。
- 帧率、DrawCall、峰值内存和常规 4G 首次可交互时间仍需在目标移动设备上测量，当前不标记为通过。

## 后续系统模块顺序

1. `settings`：先定义版本化设置模型、默认值、运行时校验和迁移，再做设置弹窗。
2. `audio`：让设置模型驱动 `AudioManager`，补背景音乐、按钮音效和前后台恢复验收。
3. `level-select`：基于 `PuzzleProgressManager` 的只读快照实现选关，不直接修改解锁数组。
4. `pause-help`：增加玩家主动暂停、继续、玩法说明和返回大厅确认；继续复用控制器状态机。
5. `polish`：补首次教程、转场反馈、加载反馈、音画表现和真机性能调优。

每个系统独立建立 `tools/cocos-modules/<module-id>/module-contract.json`，不得把设置、音频、选关和暂停全部堆进 `GameScene` 或 `UIHomePanel`。

## 验证命令

```bash
npm run typecheck
npm run verify:readiness
npm run verify:game
npm run validate:cocos
npm run verify
```

发布前还必须用 Cocos Creator 3.8.4 执行 `web-mobile`、`debug=false` 构建，并在短屏、长屏和宽屏 iframe 下跑通 `Boot -> Lobby -> Game -> Lobby`。
