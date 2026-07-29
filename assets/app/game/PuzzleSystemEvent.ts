/** 大厅系统模块使用的具名事件。 */
export const PuzzleSystemEvent = {
  /** 玩家请求打开设置弹窗。 */
  SettingsOpenRequested: "puzzle.system.settings-open-requested",

  /** 玩家请求打开头像资料弹窗。 */
  ProfileOpenRequested: "puzzle.system.profile-open-requested",

  /** 设置发生持久化变更。 */
  SettingsChanged: "puzzle.system.settings-changed",

  /** 玩家资料发生持久化变更。 */
  ProfileChanged: "puzzle.system.profile-changed",
} as const;
