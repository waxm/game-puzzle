import { _decorator, ResolutionPolicy, view } from "cc";
import { App } from "../core/app/App";
import { PUZZLE_APP_INIT_OPTIONS } from "../game/config/PuzzleProjectConfig";
import { SceneBase } from "../core/scene/SceneBase";
import { SceneManager } from "../core/scene/SceneManager";
import { UIManager } from "../core/ui/UIManager";
import { Logger } from "../core/utils/Logger";
import {
    UILoadErrorPanel,
    UILoadErrorPanelOpenParams,
} from "../ui/common/UILoadErrorPanel";
import {
    PuzzleDisplayConfig,
    PuzzleSceneName,
    PuzzleUIConfig,
    PuzzleUIName,
} from "../game/PuzzleGameKey";

const { ccclass } = _decorator;

/** 初始化框架并进入大厅的启动场景。 */
@ccclass("BootScene")
export class BootScene extends SceneBase {
    /** 当前场景名。 */
    protected _sceneName = PuzzleSceneName.Boot;

    /** 启动完成后进入的场景名。 */
    private readonly _nextSceneName = PuzzleSceneName.Lobby;

    /** 是否正在加载大厅，防止失败弹窗连续提交重试。 */
    private _sceneLoading = false;

    /** 当前加载失败弹窗请求编号。 */
    private _errorPanelRequestId = 0;

    /** 初始化框架、注册启动恢复界面并进入大厅。 */
    protected onEnter(): void {
        // Creator 3.8.4 的 Web 构建器会把初始策略写回 FIXED_WIDTH；
        // Boot 必须在任何业务 UI 打开前恢复 SHOW_ALL，确保宽屏 iframe 不裁切上下内容。
        view.setDesignResolutionSize(
            PuzzleDisplayConfig.Width,
            PuzzleDisplayConfig.Height,
            ResolutionPolicy.SHOW_ALL,
        );
        super.onEnter();
        App.init(PUZZLE_APP_INIT_OPTIONS);
        Logger.info("进入启动场景。");
        this.prepareLoadErrorPanel();
        this.runAsyncTask(this.enterNextScene(), "进入大厅场景");
    }

    /** 离开启动场景时使旧弹窗请求失效并销毁恢复界面。 */
    protected onExit(): void {
        this._errorPanelRequestId += 1;
        this._sceneLoading = false;
        UIManager.close(PuzzleUIName.LoadError, true);
        super.onExit();
    }

    /** 等待 Lobby 场景实际加载完成，失败时保留 Boot 并提供重新尝试。 */
    private async enterNextScene(): Promise<void> {
        if (this._sceneLoading) {
            return;
        }
        this._sceneLoading = true;
        Logger.info(`启动流程完成，准备进入场景：${this._nextSceneName}`);
        const result = await SceneManager.load(this._nextSceneName);
        if (result.status === "loaded") {
            return;
        }
        if (!this.node.isValid) {
            return;
        }

        this._sceneLoading = false;
        Logger.error(
            `启动场景切换失败，状态：${result.status}，原因：${result.reason ?? "unknown"}`,
            result.error,
        );
        await this.openLoadErrorPanel({
            title: "大厅加载失败",
            message: "大厅场景暂时无法进入，请重新尝试。",
            retryLabel: "重新加载",
            onRetry: this.retryEnterNextScene,
        });
    }

    /** 关闭失败弹窗后重新加载 Lobby 场景。 */
    private retryEnterNextScene = (): void => {
        this.closeLoadErrorPanel();
        this.runAsyncTask(this.enterNextScene(), "重新进入大厅场景");
    };

    /** 打开启动失败弹窗；弹窗自身失败时仍保留完整控制台诊断。 */
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
                `启动加载失败弹窗打开失败，阶段：${result.reason ?? "unknown"}`,
                result.error,
            );
        }
    }

    /** 关闭加载失败弹窗并取消尚未结束的旧打开请求。 */
    private closeLoadErrorPanel(): void {
        this._errorPanelRequestId += 1;
        UIManager.close(PuzzleUIName.LoadError, true);
    }

    /** 让 Boot 的 Canvas 承载通用加载失败弹窗。 */
    private prepareLoadErrorPanel(): void {
        UIManager.setRoot(this.node);
        UIManager.register(PuzzleUIConfig.LoadError);
    }
}
