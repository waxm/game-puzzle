# 光影拼图

《光影拼图》是基于 Cocos Creator 3.8.4 开发的竖屏拼图游戏，设计尺寸为 `640 x 1136`。

## 仓库职责

- `main` 保存完整、可发布的拼图游戏源码。
- 游戏业务、UI、关卡配置和美术资源只在本仓库维护。
- 通用框架位于 `assets/app/core`，来源于 [`cocos-game-framework`](https://github.com/waxm/cocos-game-framework)。
- 游戏中产生的通用优化需要拆成独立提交，回流框架仓库验证后再同步给其他游戏。

## 验证

首次克隆后先用 Cocos Creator 3.8.4 打开项目，等待它生成 `temp/tsconfig.cocos.json`，再执行：

```bash
npm run typecheck
npm run verify:core
npm run verify:puzzle-progress
npm run validate:levels
npm run validate:cocos
npm run verify
```

完整开发约束见 `AGENTS.md`。
