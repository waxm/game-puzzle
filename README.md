# 光影拼图

《光影拼图》是基于 Cocos Creator 3.8.4 开发的竖屏拼图游戏，设计尺寸为 `640 x 1136`。

## 当前主流程

```text
Boot -> Lobby -> Game
          ^        |
          |--------|
```

- 大厅主界面是 `UIHomePanel`，负责展示进度和开始当前最高已解锁关卡。
- `UIGamePanel` 只负责玩法显示与输入，棋盘和胜负由纯规则层判定。
- `UIResultPanel` 在 Game 场景内处理成功、失败、重玩、下一关和返回大厅。
- Web 发布使用 `SHOW_ALL` 分辨率策略，在手机和 GitHub Pages iframe 中优先完整显示竖屏画面。

## 仓库职责

- `main` 保存完整、可发布的拼图游戏源码。
- 游戏业务、UI、关卡配置和美术资源只在本仓库维护。
- 通用框架位于 `assets/app/core`，来源于 [`cocos-game-framework`](https://github.com/waxm/cocos-game-framework)。
- 游戏中产生的通用优化需要拆成独立提交，回流框架仓库验证后再同步给其他游戏。

## 扩展入口

- 场景名、UI 注册名、Prefab 路径、对象池名和业务存档键统一维护在 `assets/app/game/PuzzleGameKey.ts`。
- 关卡规则和状态放在 `assets/app/game`，系统 UI 继续按 `common`、`home`、`game`、`popup`、`item` 模块维护。
- 新增设置、音频、选关或暂停帮助时，每个系统单独建立模块契约，不能继续扩大 `GameScene` 或 `UIHomePanel` 的职责。
- 当前检测结果、性能预算和推荐开发顺序见 `docs/PROJECT_READINESS.md`。

## 验证

首次克隆后先用 Cocos Creator 3.8.4 打开项目，等待它生成 `temp/tsconfig.cocos.json`，再执行：

```bash
npm run typecheck
npm run verify:core
npm run verify:readiness
npm run verify:puzzle-progress
npm run validate:levels
npm run validate:cocos
npm run verify
```

发布前还要执行 Cocos Creator `web-mobile`、`debug=false` 构建，并实际检查短屏、长屏和宽屏 iframe 下的完整主流程。

完整开发约束见 `AGENTS.md`。
