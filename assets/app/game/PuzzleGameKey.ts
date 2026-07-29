/** 拼图项目的稳定设计画布配置。 */
export const PuzzleDisplayConfig = {
  /** 竖屏设计宽度。 */
  Width: 640,

  /** 竖屏设计高度。 */
  Height: 1136,
} as const;

/** 拼图应用展示信息。 */
export const PuzzleAppInfo = {
  /** 设置页展示的正式版本号，必须与 package.json 保持一致。 */
  Version: "1.0.0",
} as const;

/** 拼图正式场景名称，场景切换和入口声明必须统一引用。 */
export const PuzzleSceneName = {
  /** 框架初始化场景。 */
  Boot: "Boot",

  /** 首页与非玩法系统入口场景。 */
  Lobby: "Lobby",

  /** 核心拼图玩法场景。 */
  Game: "Game",
} as const;

/** 拼图业务 UI 的注册名称。 */
export const PuzzleUIName = {
  /** 首页主面板。 */
  Home: "UIHomePanel",

  /** 拼图玩法主面板。 */
  Game: "UIGamePanel",

  /** 成功与失败共用的结算弹窗。 */
  Result: "UIResultPanel",

  /** 场景加载失败时使用的通用恢复弹窗。 */
  LoadError: "UILoadErrorPanel",

  /** 大厅设置弹窗。 */
  Settings: "UISettingsPanel",

  /** 玩家头像与名称编辑弹窗。 */
  Profile: "UIProfilePanel",
} as const;

/** 拼图业务 UI 的稳定注册配置。 */
export const PuzzleUIConfig = {
  /** 首页主面板配置。 */
  Home: {
    name: PuzzleUIName.Home,
    path: "prefabs/home/UIHomePanel",
    cache: true,
  },

  /** 拼图玩法主面板配置。 */
  Game: {
    name: PuzzleUIName.Game,
    path: "prefabs/game/UIGamePanel",
    cache: false,
  },

  /** 结算弹窗配置。 */
  Result: {
    name: PuzzleUIName.Result,
    path: "prefabs/popup/UIResultPanel",
    cache: false,
  },

  /** 通用加载失败弹窗配置。 */
  LoadError: {
    name: PuzzleUIName.LoadError,
    path: "prefabs/common/UILoadErrorPanel",
    cache: false,
  },

  /** 大厅设置弹窗配置。 */
  Settings: {
    name: PuzzleUIName.Settings,
    path: "prefabs/popup/UISettingsPanel",
    cache: true,
  },

  /** 玩家头像与名称编辑弹窗配置。 */
  Profile: {
    name: PuzzleUIName.Profile,
    path: "prefabs/popup/UIProfilePanel",
    cache: true,
  },
} as const;

/** 拼图业务的本地存档键；StorageManager 还会追加项目独立前缀。 */
export const PuzzleStorageKey = {
  /** 当前使用的版本化关卡进度键。 */
  Progress: "puzzle.progress",

  /** 旧发布包使用的进度键，仅供一次性迁移。 */
  LegacyProgress: "puzzleProgress",

  /** 版本化声音与震动设置。 */
  Settings: "puzzle.settings",

  /** 版本化玩家名称与头像资料。 */
  Profile: "puzzle.profile",
} as const;

/** 拼图业务使用的具名对象池，集中定义以避免散落匿名字符串。 */
export const PuzzlePoolName = {
  /** 运行中的单块拼图节点池。 */
  Piece: "puzzle.piece",

  /** 头像选择列表项。 */
  AvatarItem: "puzzle.avatar-item",
} as const;

/** 拼图业务通过资源管理器动态加载的稳定路径。 */
export const PuzzleResourcePath = {
  /** 单块拼图 Prefab，不带扩展名。 */
  PiecePrefab: "prefabs/game/PuzzlePiece",

  /** 头像选择列表项 Prefab，不带扩展名。 */
  AvatarItemPrefab: "prefabs/item/PuzzleAvatarItem",
} as const;
