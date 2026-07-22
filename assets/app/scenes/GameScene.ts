import { _decorator, Node } from "cc";
import { AudioManager } from "../core/audio/AudioManager";
import { EventCenter } from "../core/event/EventCenter";
import { SceneBase } from "../core/scene/SceneBase";
import { SceneManager } from "../core/scene/SceneManager";
import { UIManager } from "../core/ui/UIManager";
import { Logger } from "../core/utils/Logger";
import type { PuzzleLevelConfig } from "../game/config/PuzzleLevelConfig";
import { PuzzleGameController } from "../game/controller/PuzzleGameController";
import { GameEvent } from "../game/GameEvent";
import type { PuzzleGameState } from "../game/model/PuzzleGameState";
import { PuzzleLevelSession } from "../game/progress/PuzzleLevelSession";
import {
    PuzzleCompletionResult,
    PuzzleProgressManager,
} from "../game/progress/PuzzleProgressManager";
import {
    UILoadErrorPanel,
    UILoadErrorPanelOpenParams,
} from "../ui/common/UILoadErrorPanel";
import {
    UIGamePanel,
    UIGamePanelOpenParams,
} from "../ui/game/UIGamePanel";
import {
    UIResultPanel,
    UIResultPanelOpenParams,
} from "../ui/popup/UIResultPanel";

const { ccclass, property } = _decorator;

/** 拼图关卡游戏场景。 */
@ccclass("GameScene")
export class GameScene extends SceneBase {
    /** 当前场景名。 */
    protected _sceneName = "Game";

    /** 当前关卡拼图控制器。 */
    private _controller: PuzzleGameController | null = null;

    /** 当前场景正在运行的关卡配置。 */
    private _levelConfig: PuzzleLevelConfig | null = null;

    /** 当前场景的 UI 挂载根节点，必须在 Game.scene 中显式绑定。 */
    @property(Node)
    private uiRoot: Node | null = null;

    /** 当前打开游戏面板的请求编号，切关或离场后旧请求不得写回。 */
    private _panelRequestId = 0;

    /** 当前打开结算弹窗的请求编号。 */
    private _resultPanelRequestId = 0;

    /** 当前打开加载失败弹窗的请求编号。 */
    private _errorPanelRequestId = 0;

    /** 当前下一关准备请求编号，用于丢弃重试、重玩或离场前的旧 JSON 结果。 */
    private _nextLevelRequestId = 0;

    /** 是否正在加载并校验下一关 JSON，防止结算按钮连续点击。 */
    private _nextLevelPreparing = false;

    /** 是否正在返回大厅，防止按钮重复发起场景切换。 */
    private _sceneTransitioning = false;

    /** 进入场景时注册界面并打开当前拼图关卡。 */
    protected onEnter(): void {
        super.onEnter();
        this.assertRequiredBindings({
            uiRoot: this.uiRoot,
        });
        Logger.info("进入拼图游戏场景。");
        this.registerGamePanels();
        this.startLevel(PuzzleLevelSession.getCurrentLevel());
    }

    /** 离开场景时释放本局控制器和 UI。 */
    protected onExit(): void {
        this.clearRuntime();
        super.onExit();
    }

    /** 注册场景级事件。 */
    protected bindEvents(): void {
        EventCenter.on(GameEvent.BackToLobby, this.onBackToLobby, this);
        EventCenter.on(GameEvent.PuzzleFailed, this.onPuzzleFailed, this);
        EventCenter.on(GameEvent.PuzzleCompleted, this.onPuzzleCompleted, this);
        EventCenter.on(GameEvent.PuzzleRestart, this.onPuzzleRestart, this);
        EventCenter.on(GameEvent.PuzzleNextLevel, this.onPuzzleNextLevel, this);
    }

    /** 注销场景级事件。 */
    protected unbindEvents(): void {
        EventCenter.off(GameEvent.BackToLobby, this.onBackToLobby, this);
        EventCenter.off(GameEvent.PuzzleFailed, this.onPuzzleFailed, this);
        EventCenter.off(GameEvent.PuzzleCompleted, this.onPuzzleCompleted, this);
        EventCenter.off(GameEvent.PuzzleRestart, this.onPuzzleRestart, this);
        EventCenter.off(GameEvent.PuzzleNextLevel, this.onPuzzleNextLevel, this);
    }

    /** 注册游戏主面板、结算弹窗和通用加载失败弹窗。 */
    private registerGamePanels(): void {
        UIManager.setRoot(this.uiRoot!);
        UIManager.registerMany([
            {
                name: "UIGamePanel",
                path: "prefabs/game/UIGamePanel",
                cache: false,
            },
            {
                name: "UIResultPanel",
                path: "prefabs/popup/UIResultPanel",
                cache: false,
            },
            {
                name: "UILoadErrorPanel",
                path: "prefabs/common/UILoadErrorPanel",
                cache: false,
            },
        ]);
    }

    /** 切换当前关卡，并使上一关尚未完成的异步 UI 请求立即失效。 */
    private startLevel(levelConfig: PuzzleLevelConfig): void {
        this._panelRequestId += 1;
        this._resultPanelRequestId += 1;
        this._errorPanelRequestId += 1;
        this._nextLevelRequestId += 1;
        this._nextLevelPreparing = false;
        PuzzleLevelSession.cancelPendingSelection();
        this._controller?.destroy();
        this._controller = null;
        this._levelConfig = levelConfig;
        UIManager.close("UIGamePanel", true);
        UIManager.close("UIResultPanel", true);
        UIManager.close("UILoadErrorPanel", true);
        this.runAsyncTask(this.openGamePanel(levelConfig), "打开游戏主面板");
    }

    /** UI 完成加载和事件绑定后再启动控制器，避免丢失初始状态事件。 */
    private async openGamePanel(levelConfig: PuzzleLevelConfig): Promise<void> {
        const requestId = ++this._panelRequestId;
        const params: UIGamePanelOpenParams = { levelConfig };
        const result = await UIManager.open<UIGamePanel>("UIGamePanel", params);

        if (
            !this.node.isValid ||
            requestId !== this._panelRequestId ||
            this._levelConfig?.level !== levelConfig.level
        ) {
            this.disposeStalePanel("UIGamePanel", result.panel);
            return;
        }
        if (result.status === "cancelled") {
            return;
        }
        if (result.status === "failed" || !result.panel) {
            Logger.error(
                `游戏主面板打开失败，阶段：${result.reason ?? "unknown"}`,
                result.error,
            );
            const recoveryOpened = await this.openLoadErrorPanel({
                title: "游戏界面加载失败",
                message: "当前关卡界面暂时无法加载，可以重新尝试或返回大厅。",
                onRetry: () => this.retryGamePanel(levelConfig),
                onBack: this.retryBackToLobby,
            });

            // 连恢复弹窗也无法加载时直接回大厅，避免 Game 场景只剩空白画面。
            if (
                !recoveryOpened &&
                this.node.isValid &&
                requestId === this._panelRequestId
            ) {
                await this.returnToLobbyScene();
            }
            return;
        }

        this._controller = new PuzzleGameController(levelConfig);
        this._controller.start();
    }

    /** 控制器确认失败后打开当前关卡的失败结算弹窗。 */
    private onPuzzleFailed = (state?: PuzzleGameState): void => {
        if (
            this._sceneTransitioning ||
            !state ||
            state.level !== this._levelConfig?.level
        ) {
            return;
        }
        this.runAsyncTask(
            this.openResultPanel({
                mode: "failure",
                level: state.level,
                nextLevel: null,
                allCompleted: false,
            }),
            "打开失败结算弹窗",
        );
    };

    /** 记录本次通关、解锁下一关并打开成功结算弹窗。 */
    private onPuzzleCompleted = (state?: PuzzleGameState): void => {
        if (
            this._sceneTransitioning ||
            !state?.completed ||
            state.level !== this._levelConfig?.level
        ) {
            return;
        }
        const result = PuzzleProgressManager.completeLevel(state.level);
        this.runAsyncTask(
            this.openResultPanel(this.createSuccessResultParams(result)),
            "打开成功结算弹窗",
        );
    };

    /** 把存档结算结果转换为通关弹窗参数。 */
    private createSuccessResultParams(
        result: PuzzleCompletionResult,
    ): UIResultPanelOpenParams {
        return {
            mode: "success",
            level: result.completedLevel,
            nextLevel: result.nextLevel,
            allCompleted: result.allCompleted,
        };
    }

    /** 打开结算弹窗，并在失败时保留游戏面板和明确恢复入口。 */
    private async openResultPanel(
        params: UIResultPanelOpenParams,
    ): Promise<void> {
        const requestId = ++this._resultPanelRequestId;
        const result = await UIManager.open<UIResultPanel>(
            "UIResultPanel",
            params,
        );
        if (!this.node.isValid || requestId !== this._resultPanelRequestId) {
            this.disposeStalePanel("UIResultPanel", result.panel);
            return;
        }
        if (result.status === "cancelled") {
            return;
        }
        if (result.status === "failed" || !result.panel) {
            Logger.error(
                `结算弹窗打开失败，阶段：${result.reason ?? "unknown"}`,
                result.error,
            );
            UIManager.get<UIGamePanel>("UIGamePanel")?.showRecoverableError(
                "结算界面加载失败，可以重新尝试或返回大厅",
            );
            await this.openLoadErrorPanel({
                title: "结算界面加载失败",
                message: "本局结果已经保留，可以重新加载结算界面。",
                onRetry: () => this.retryResultPanel(params),
                onBack: this.retryBackToLobby,
            });
        }
    }

    /** 重玩时关闭结算和加载失败弹窗，并让旧打开请求失效。 */
    private onPuzzleRestart = (): void => {
        this._resultPanelRequestId += 1;
        this._errorPanelRequestId += 1;
        this._nextLevelRequestId += 1;
        this._nextLevelPreparing = false;
        PuzzleLevelSession.cancelPendingSelection();
        UIManager.close("UIResultPanel", true);
        UIManager.close("UILoadErrorPanel", true);
    };

    /** 请求异步准备下一关；加载期间忽略重复点击。 */
    private onPuzzleNextLevel = (nextLevel?: number): void => {
        if (
            !Number.isInteger(nextLevel) ||
            this._sceneTransitioning ||
            this._nextLevelPreparing
        ) {
            return;
        }
        this.runAsyncTask(
            this.prepareNextLevel(nextLevel!),
            "加载并进入下一关",
        );
    };

    /** 加载并严格校验下一关 JSON，失败时保留返回大厅和重试入口。 */
    private async prepareNextLevel(nextLevel: number): Promise<void> {
        const requestId = ++this._nextLevelRequestId;
        this._nextLevelPreparing = true;
        this._errorPanelRequestId += 1;
        UIManager.close("UILoadErrorPanel", true);

        try {
            const levelConfig = await PuzzleLevelSession.selectLevel(nextLevel);
            if (
                !this.node.isValid ||
                requestId !== this._nextLevelRequestId
            ) {
                return;
            }
            this._nextLevelPreparing = false;
            this.startLevel(levelConfig);
        } catch (error) {
            if (
                !this.node.isValid ||
                requestId !== this._nextLevelRequestId
            ) {
                return;
            }
            this._nextLevelPreparing = false;
            Logger.error(`无法进入下一关：${nextLevel}`, error);
            const recoveryOpened = await this.openLoadErrorPanel({
                title: "下一关准备失败",
                message: "下一关 JSON 无法加载或校验失败，可以重新尝试或返回大厅。",
                onRetry: () => this.retryNextLevel(nextLevel),
                onBack: this.retryBackToLobby,
            });
            if (
                !recoveryOpened &&
                this.node.isValid &&
                requestId === this._nextLevelRequestId
            ) {
                UIManager.get<UIGamePanel>("UIGamePanel")?.showRecoverableError(
                    "下一关加载失败，请返回大厅后重试",
                );
            }
        }
    }

    /** 收到返回事件后托管 Lobby 场景切换任务。 */
    private onBackToLobby = (): void => {
        if (this._sceneTransitioning) {
            return;
        }
        this.runAsyncTask(this.returnToLobbyScene(), "返回大厅场景");
    };

    /** 等待 Lobby 场景真正加载成功；失败时保留当前 Game 界面。 */
    private async returnToLobbyScene(): Promise<void> {
        if (this._sceneTransitioning) {
            return;
        }
        this._sceneTransitioning = true;
        this._nextLevelRequestId += 1;
        this._nextLevelPreparing = false;
        PuzzleLevelSession.cancelPendingSelection();
        const result = await SceneManager.load("Lobby");
        if (result.status === "loaded") {
            PuzzleLevelSession.clear();
            return;
        }
        if (!this.node.isValid) {
            return;
        }

        this._sceneTransitioning = false;
        Logger.error(
            `返回大厅失败，状态：${result.status}，原因：${result.reason ?? "unknown"}`,
            result.error,
        );
        await this.openLoadErrorPanel({
            title: "大厅加载失败",
            message: "暂时无法返回大厅，请重新尝试或继续当前游戏。",
            retryLabel: "重试返回",
            backLabel: "继续游戏",
            onRetry: this.retryBackToLobby,
            onBack: this.closeLoadErrorPanel,
        });
    }

    /** 关闭恢复弹窗后重新打开游戏主面板。 */
    private retryGamePanel(levelConfig: PuzzleLevelConfig): void {
        this.closeLoadErrorPanel();
        this.startLevel(levelConfig);
    }

    /** 关闭恢复弹窗后重新打开同一份结算结果。 */
    private retryResultPanel(params: UIResultPanelOpenParams): void {
        this.closeLoadErrorPanel();
        this.runAsyncTask(this.openResultPanel(params), "重新打开结算弹窗");
    }

    /** 重新读取并进入指定下一关。 */
    private retryNextLevel(nextLevel: number): void {
        this.closeLoadErrorPanel();
        this.onPuzzleNextLevel(nextLevel);
    }

    /** 关闭恢复弹窗后重新返回大厅。 */
    private retryBackToLobby = (): void => {
        this.closeLoadErrorPanel();
        this.runAsyncTask(this.returnToLobbyScene(), "重新返回大厅场景");
    };

    /** 打开通用加载失败弹窗，并返回恢复入口是否成功显示。 */
    private async openLoadErrorPanel(
        params: UILoadErrorPanelOpenParams,
    ): Promise<boolean> {
        const requestId = ++this._errorPanelRequestId;
        UIManager.close("UILoadErrorPanel", true);
        const result = await UIManager.open<UILoadErrorPanel>(
            "UILoadErrorPanel",
            params,
        );
        if (!this.node.isValid || requestId !== this._errorPanelRequestId) {
            this.disposeStalePanel("UILoadErrorPanel", result.panel);
            return false;
        }
        if (result.status === "opened" && result.panel) {
            return true;
        }
        if (result.status === "failed") {
            Logger.error(
                `游戏加载失败弹窗打开失败，阶段：${result.reason ?? "unknown"}`,
                result.error,
            );
        }
        return false;
    }

    /** 关闭加载失败弹窗并使仍在执行的旧弹窗请求失效。 */
    private closeLoadErrorPanel = (): void => {
        this._errorPanelRequestId += 1;
        UIManager.close("UILoadErrorPanel", true);
    };

    /** 清理由过期请求打开的面板，防止切关或离场后残留 UI。 */
    private disposeStalePanel(
        name: string,
        panel: UIGamePanel | UIResultPanel | UILoadErrorPanel | null,
    ): void {
        if (!panel) {
            return;
        }
        if (UIManager.get(name) === panel) {
            UIManager.close(name, true);
        } else if (panel.node.isValid) {
            panel.node.destroy();
        }
    }

    /** 清理控制器、UI 和音乐状态；重复调用也保持安全。 */
    private clearRuntime(): void {
        // 先让异步打开请求失效，再关闭现有 UI，避免加载完成后重新启动控制器。
        this._panelRequestId += 1;
        this._resultPanelRequestId += 1;
        this._errorPanelRequestId += 1;
        this._nextLevelRequestId += 1;
        this._nextLevelPreparing = false;
        PuzzleLevelSession.cancelPendingSelection();
        this._controller?.destroy();
        this._controller = null;
        this._levelConfig = null;
        this._sceneTransitioning = false;
        UIManager.close("UIGamePanel", true);
        UIManager.close("UIResultPanel", true);
        UIManager.close("UILoadErrorPanel", true);
        AudioManager.stopMusic();
    }
}
