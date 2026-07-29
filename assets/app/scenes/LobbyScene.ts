import { _decorator, Node } from "cc";
import { EventCenter } from "../core/event/EventCenter";
import { PoolManager } from "../core/pool/PoolManager";
import { SceneBase } from "../core/scene/SceneBase";
import { SceneManager } from "../core/scene/SceneManager";
import { UIManager } from "../core/ui/UIManager";
import { Logger } from "../core/utils/Logger";
import { PuzzleLevelNumbers } from "../game/config/PuzzleLevelConfig";
import { GameEvent, GameStartRequest } from "../game/GameEvent";
import {
    PuzzleSceneName,
    PuzzlePoolName,
    PuzzleUIConfig,
    PuzzleUIName,
} from "../game/PuzzleGameKey";
import { PuzzleSystemEvent } from "../game/PuzzleSystemEvent";
import {
    PuzzleProfileData,
    PuzzleProfileManager,
} from "../game/profile/PuzzleProfileManager";
import { PuzzleLevelSession } from "../game/progress/PuzzleLevelSession";
import { PuzzleProgressManager } from "../game/progress/PuzzleProgressManager";
import {
    UILoadErrorPanel,
    UILoadErrorPanelOpenParams,
} from "../ui/common/UILoadErrorPanel";
import {
    UIHomePanel,
    UIHomePanelOpenParams,
} from "../ui/home/UIHomePanel";

const { ccclass, property } = _decorator;

/** 展示关卡进度并负责进入游戏场景的大厅。 */
@ccclass("LobbyScene")
export class LobbyScene extends SceneBase {
    /** 当前场景名。 */
    protected _sceneName = PuzzleSceneName.Lobby;

    /** 当前场景的 UI 根节点，必须在 Lobby.scene 中显式绑定。 */
    @property(Node)
    private uiRoot: Node | null = null;

    /** 当前首页面板打开请求编号，用于丢弃重试前的旧结果。 */
    private _homePanelRequestId = 0;

    /** 当前加载失败弹窗请求编号，用于阻止旧弹窗覆盖新的恢复流程。 */
    private _errorPanelRequestId = 0;

    /** 当前进入游戏请求编号，用于丢弃离场或重试前的旧关卡加载结果。 */
    private _gameEntryRequestId = 0;

    /** 当前设置弹窗打开请求编号。 */
    private _settingsRequestId = 0;

    /** 当前资料弹窗打开请求编号。 */
    private _profileRequestId = 0;

    /** 是否正在准备关卡或进入游戏场景，防止连续点击重复加载。 */
    private _sceneTransitioning = false;

    /** 场景进入时准备 UI 配置并打开首页面板。 */
    protected onEnter(): void {
        super.onEnter();
        this.assertRequiredBindings({ uiRoot: this.uiRoot });
        Logger.info("进入大厅场景。");
        this.prepareHomePanels();
        this.runAsyncTask(
            this.openHomePanel(this.createHomePanelParams()),
            "打开首页面板",
        );
    }

    /** 离开大厅时使异步请求失效并销毁当前场景持有的 UI。 */
    protected onExit(): void {
        this._homePanelRequestId += 1;
        this._errorPanelRequestId += 1;
        this._gameEntryRequestId += 1;
        this._settingsRequestId += 1;
        this._profileRequestId += 1;
        PuzzleLevelSession.cancelPendingSelection();
        this._sceneTransitioning = false;
        UIManager.close(PuzzleUIName.Home, true);
        UIManager.close(PuzzleUIName.Settings, true);
        UIManager.close(PuzzleUIName.Profile, true);
        UIManager.close(PuzzleUIName.LoadError, true);
        PoolManager.clear(PuzzlePoolName.AvatarItem, true);
        super.onExit();
    }

    /** 注册大厅场景事件。 */
    protected bindEvents(): void {
        EventCenter.on(GameEvent.GameStart, this.onGameStart, this);
        EventCenter.on(
            PuzzleSystemEvent.SettingsOpenRequested,
            this.onSettingsOpenRequested,
            this,
        );
        EventCenter.on(
            PuzzleSystemEvent.ProfileOpenRequested,
            this.onProfileOpenRequested,
            this,
        );
        EventCenter.on(
            PuzzleSystemEvent.ProfileChanged,
            this.onProfileChanged,
            this,
        );
    }

    /** 注销大厅场景事件。 */
    protected unbindEvents(): void {
        EventCenter.off(GameEvent.GameStart, this.onGameStart, this);
        EventCenter.off(
            PuzzleSystemEvent.SettingsOpenRequested,
            this.onSettingsOpenRequested,
            this,
        );
        EventCenter.off(
            PuzzleSystemEvent.ProfileOpenRequested,
            this.onProfileOpenRequested,
            this,
        );
        EventCenter.off(
            PuzzleSystemEvent.ProfileChanged,
            this.onProfileChanged,
            this,
        );
    }

    /** 根据当前存档生成首页展示参数。 */
    private createHomePanelParams(): UIHomePanelOpenParams {
        const progress = PuzzleProgressManager.getProgress();
        return {
            targetLevel: PuzzleProgressManager.getHighestUnlockedLevel(),
            completedCount: progress.completedLevels.length,
            totalCount: PuzzleLevelNumbers.length,
            profile: PuzzleProfileManager.getProfile(),
        };
    }

    /** 打开首页面板；失败时展示可重新发起同一请求的恢复弹窗。 */
    private async openHomePanel(params: UIHomePanelOpenParams): Promise<void> {
        const requestId = ++this._homePanelRequestId;
        const result = await UIManager.open<UIHomePanel>(
            PuzzleUIName.Home,
            params,
        );
        if (!this.node.isValid || requestId !== this._homePanelRequestId) {
            return;
        }
        if (result.status === "opened" && result.panel) {
            result.panel.setStartInteractable(!this._sceneTransitioning);
            return;
        }
        if (result.status === "cancelled") {
            return;
        }

        Logger.error(
            `首页面板打开失败，阶段：${result.reason ?? "unknown"}`,
            result.error,
        );
        await this.openLoadErrorPanel({
            title: "首页加载失败",
            message: "首页资源暂时无法加载，请重新尝试。",
            retryLabel: "重新加载",
            backLabel: "留在大厅",
            onRetry: () => this.retryHomePanel(params),
            onBack: this.closeLoadErrorPanel,
        });
    }

    /** 收到开始请求后托管场景切换任务，任何异常都会由 SceneBase 统一记录。 */
    private onGameStart = (request?: GameStartRequest): void => {
        if (!request || this._sceneTransitioning) {
            return;
        }
        this.runAsyncTask(this.enterGameScene(request), "进入游戏场景");
    };

    /** 收到设置入口请求后打开设置弹窗。 */
    private onSettingsOpenRequested = (): void => {
        UIManager.close(PuzzleUIName.Profile);
        this.runAsyncTask(this.openSettingsPanel(), "打开设置弹窗");
    };

    /** 收到头像入口请求后打开资料弹窗。 */
    private onProfileOpenRequested = (): void => {
        UIManager.close(PuzzleUIName.Settings);
        this.runAsyncTask(this.openProfilePanel(), "打开头像资料弹窗");
    };

    /** 玩家资料更新后立即刷新大厅左上角展示。 */
    private onProfileChanged = (profile?: PuzzleProfileData): void => {
        if (!profile) {
            return;
        }
        UIManager.get<UIHomePanel>(PuzzleUIName.Home)?.setProfile(profile);
    };

    /** 打开设置弹窗并记录完整加载失败。 */
    private async openSettingsPanel(): Promise<void> {
        const requestId = ++this._settingsRequestId;
        const result = await UIManager.open(PuzzleUIName.Settings);
        if (
            !this.node.isValid ||
            requestId !== this._settingsRequestId ||
            result.status !== "failed"
        ) {
            return;
        }
        Logger.error(
            `设置弹窗打开失败，阶段：${result.reason ?? "unknown"}`,
            result.error,
        );
    }

    /** 打开头像资料弹窗并记录完整加载失败。 */
    private async openProfilePanel(): Promise<void> {
        const requestId = ++this._profileRequestId;
        const result = await UIManager.open(PuzzleUIName.Profile);
        if (
            !this.node.isValid ||
            requestId !== this._profileRequestId ||
            result.status !== "failed"
        ) {
            return;
        }
        Logger.error(
            `头像资料弹窗打开失败，阶段：${result.reason ?? "unknown"}`,
            result.error,
        );
    }

    /** 异步加载并校验关卡 JSON，再等待 Game 场景真实加载成功。 */
    private async enterGameScene(request: GameStartRequest): Promise<void> {
        const requestId = ++this._gameEntryRequestId;
        this._sceneTransitioning = true;
        this.closeLoadErrorPanel();
        UIManager.get<UIHomePanel>(
            PuzzleUIName.Home,
        )?.setStartInteractable(false);

        try {
            const levelConfig = await PuzzleLevelSession.selectLevel(request.level);
            if (
                !this.node.isValid ||
                requestId !== this._gameEntryRequestId
            ) {
                return;
            }
            Logger.info(`收到开始第 ${levelConfig.level} 关事件。`);
        } catch (error) {
            if (
                !this.node.isValid ||
                requestId !== this._gameEntryRequestId
            ) {
                return;
            }
            this._sceneTransitioning = false;
            UIManager.get<UIHomePanel>(
                PuzzleUIName.Home,
            )?.setStartInteractable(true);
            Logger.error(`无法选择第 ${request.level} 关。`, error);
            await this.openLoadErrorPanel({
                title: "关卡准备失败",
                message: "当前关卡 JSON 无法加载或校验失败，请重新尝试。",
                onRetry: () => this.retryEnterGame(request),
                onBack: this.closeLoadErrorPanel,
            });
            return;
        }

        const result = await SceneManager.load(PuzzleSceneName.Game);
        if (result.status === "loaded") {
            return;
        }
        if (
            !this.node.isValid ||
            requestId !== this._gameEntryRequestId
        ) {
            return;
        }

        this._sceneTransitioning = false;
        UIManager.get<UIHomePanel>(
            PuzzleUIName.Home,
        )?.setStartInteractable(true);
        Logger.error(
            `游戏场景加载未完成，状态：${result.status}，原因：${result.reason ?? "unknown"}`,
            result.error,
        );
        await this.openLoadErrorPanel({
            title: "游戏加载失败",
            message: "游戏场景暂时无法进入，请重新尝试。",
            onRetry: () => this.retryEnterGame(request),
            onBack: this.closeLoadErrorPanel,
        });
    }

    /** 关闭失败弹窗后重新加载首页面板。 */
    private retryHomePanel(params: UIHomePanelOpenParams): void {
        this.closeLoadErrorPanel();
        this.runAsyncTask(this.openHomePanel(params), "重新打开首页面板");
    }

    /** 关闭失败弹窗后重新选择关卡并进入游戏。 */
    private retryEnterGame(request: GameStartRequest): void {
        this.closeLoadErrorPanel();
        this.runAsyncTask(this.enterGameScene(request), "重新进入游戏场景");
    }

    /** 打开通用加载失败弹窗；弹窗自身失败时保留原界面并输出完整错误。 */
    private async openLoadErrorPanel(
        params: UILoadErrorPanelOpenParams,
    ): Promise<void> {
        const requestId = ++this._errorPanelRequestId;
        UIManager.close(PuzzleUIName.LoadError, true);
        const result = await UIManager.open<UILoadErrorPanel>(
            PuzzleUIName.LoadError,
            params,
        );
        if (!this.node.isValid || requestId !== this._errorPanelRequestId) {
            return;
        }
        if (result.status === "failed") {
            Logger.error(
                `大厅加载失败弹窗打开失败，阶段：${result.reason ?? "unknown"}`,
                result.error,
            );
        }
    }

    /** 关闭加载失败弹窗并使仍在加载的旧弹窗请求失效。 */
    private closeLoadErrorPanel = (): void => {
        this._errorPanelRequestId += 1;
        UIManager.close(PuzzleUIName.LoadError, true);
    };

    /** 注册首页和通用加载失败弹窗，由 UIManager 统一加载和管理。 */
    private prepareHomePanels(): void {
        UIManager.setRoot(this.uiRoot!);
        UIManager.registerMany([
            PuzzleUIConfig.Home,
            PuzzleUIConfig.LoadError,
            PuzzleUIConfig.Settings,
            PuzzleUIConfig.Profile,
        ]);
    }
}
