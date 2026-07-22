# 拼图关卡编辑器

这是只在本机运行的单关 JSON 编辑器。服务固定绑定 `127.0.0.1`，不会监听局域网地址；“保存到工程”只允许覆盖 `assets/resources/configs/game/levels` 中已经存在的 `level_XXX.json`。

## 启动

在项目根目录执行：

```bash
npm run editor:levels
```

浏览器打开：

```text
http://127.0.0.1:4178
```

需要更换端口时可以执行：

```bash
node tools/puzzle-level-editor/server.mjs --port 4180
```

## 使用方式

1. 从左侧选择既有关卡。
2. 编辑行列、棋盘尺寸、限时和 `pieceOrder`。
3. 使用“随机排列”“正确顺序”或“按行列重建”快速生成切片顺序。
4. 在真实切片预览中，从一个格子拖到另一个格子即可交换两块。
5. 配置通过严格校验后，可以原子保存到工程或下载独立 JSON。
6. “导入 JSON”仅接受 schema 完整、资源路径正确且编号已存在的关卡。

`level` 和 `sourceImagePath` 为只读字段，图片路径始终根据关卡编号自动生成。保存时服务端会再次调用 `tools/puzzle-level-schema.mjs` 校验，不依赖浏览器端校验结果。

## 验证

不启动端口的工程自检：

```bash
npm run verify:level-editor
```

该命令会先检查工程中的全部关卡，再运行服务端接口回归测试。测试使用临时工程，
覆盖配置读取、PNG 返回、原子覆盖、额外字段、重复切片、错误资源路径、未存在关卡、
`level 1000` 和路径穿越；不会修改正式关卡 JSON。
