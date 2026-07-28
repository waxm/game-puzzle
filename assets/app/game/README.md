# Game 拼图业务层

这里存放当前拼图游戏的配置、状态、控制器和纯逻辑。业务层可以依赖 `app/core`，核心框架不得反向依赖拼图代码。

```text
GameEvent.ts                              # 拼图与场景、UI 的事件协议
PuzzleGameKey.ts                         # 业务对象池名称和动态资源路径
config/PuzzleLevelConfig.ts               # 关卡 JSON 类型和轻量目录出口
config/PuzzleLevelConfigLoader.ts         # 通过 ResManager 加载并严格校验单关 JSON
config/PuzzleLevelCatalog.generated.ts    # 根据关卡 JSON 和图片生成轻量索引
controller/PuzzleGameController.ts        # 单关显式状态机、棋盘编排和结算
logic/PuzzleGrid.ts                       # 规则网格和坐标关系
logic/PuzzleImageSlicer.ts                # 完整原图运行时切分
logic/PuzzleBoard.ts                      # 棋盘占用、组合、进度和完成规则真相
logic/PuzzleMovePlanner.ts                # 无空格棋盘移动规划
logic/PuzzleGroupContour.ts               # 组合外围轮廓计算
model/PuzzleGameState.ts                  # 关卡运行状态和事件参数
model/PuzzleGroup.ts                      # 软组合模型与重建管理
progress/PuzzleLevelSession.ts            # 异步选择并缓存当前关卡配置
progress/PuzzleProgressManager.ts         # 通关和解锁存档
```

每关完整配置维护在
`assets/resources/configs/game/levels/level_XXX.json`，图片放在
`assets/resources/textures/game/levels/level_XXX`。运行时在玩家选择关卡时通过
`ResManager` 加载并校验对应 JSON，不使用默认配置掩盖错误数据。

运行 `npm run editor:levels` 可打开本地可视化关卡编辑器；编辑器支持预览切片、调整
乱序、保存到工程和下载单关 JSON。新增、删除或调整关卡后运行
`npm run generate:levels`，不要手写生成文件中的资源路径或关卡编号。
