# 大厅系统模块

## 玩家头像与名称

- 玩家资料存档键为 `puzzle.profile`，由项目存档前缀继续隔离。
- 当前结构版本为 `1`，包含 `name` 和稳定的 `avatarId`。
- 名称会去除首尾空格并限制为 12 个 Unicode 字符；空名称不会覆盖已有资料。
- 内置头像目录位于 `PuzzleAvatarCatalog.ts`。可以新增头像，但已发布头像的 `id` 不得修改。
- 头像列表由 `PuzzleAvatarItem.prefab` 和 `PoolManager` 创建，关闭面板时全部归还，离开大厅时销毁对象池。
- 资料变化通过 `puzzle.system.profile-changed` 通知大厅，左上角头像和名称会即时更新。

当前头像使用颜色和文字符号绘制，不依赖纹理。后续接入美术头像时，可以扩展
`PuzzleAvatarDefinition` 并替换 `PuzzleAvatarRenderer` 的表现层，存档和面板流程无需改变。

## 声音与震动

- 设置存档键为 `puzzle.settings`，当前结构版本为 `1`。
- 声音开关同时控制框架背景音乐和音效音量，启动时立即恢复。
- 震动通过 `PuzzleSettingsHapticsPort` 隔离平台差异。Web 默认调用 Vibration API，
  不支持的平台安全返回 `false`；原生平台可以用 `setHapticsPort()` 注入实现。

## 帮助、评分和协议接口

帮助中心、评分、隐私政策和服务条款统一走 `PuzzleSettingsExternalPort`：

```ts
PuzzleSettingsManager.setExternalPort({
  open(action) {
    // action: "help" | "rating" | "privacy" | "terms"
    // 在这里接入浏览器链接、应用商店或原生页面。
    return false;
  },
});
```

`open()` 可以返回 `boolean` 或 `Promise<boolean>`。返回 `true` 表示已经打开；
返回 `false` 时设置页会显示“接口已预留”。未接入前不会跳转到空链接。

## 版本号

设置页版本来自 `PuzzleAppInfo.Version`，当前为 `1.0.0`，并与 `package.json` 的
`version` 保持一致。
