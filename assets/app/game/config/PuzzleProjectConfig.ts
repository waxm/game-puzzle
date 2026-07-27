import type { AppInitOptions } from "../../core/app/App";

/** 光影拼图独立的框架初始化配置。 */
export const PUZZLE_APP_INIT_OPTIONS: Readonly<AppInitOptions> = {
    /** 当前游戏独立存档命名空间。 */
    storagePrefix: "game-puzzle",

    /** 当前游戏独立日志前缀。 */
    logPrefix: "[光影拼图]",
};
