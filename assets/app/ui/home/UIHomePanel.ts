import { _decorator, Button, Color, Graphics, Label } from "cc";
import { EventCenter } from "../../core/event/EventCenter";
import { UIBase } from "../../core/ui/UIBase";
import { Logger } from "../../core/utils/Logger";
import { GameEvent, GameStartRequest } from "../../game/GameEvent";
import { PuzzleSystemEvent } from "../../game/PuzzleSystemEvent";
import { getPuzzleAvatar } from "../../game/profile/PuzzleAvatarCatalog";
import type { PuzzleProfileData } from "../../game/profile/PuzzleProfileManager";
import { PuzzleAvatarRenderer } from "../common/PuzzleAvatarRenderer";

/** 打开首页面板时传入的拼图进度摘要。 */
export interface UIHomePanelOpenParams {
    /** 默认开始按钮将进入的最高已解锁关卡。 */
    targetLevel: number;

    /** 当前已经完成的关卡数量。 */
    completedCount: number;

    /** 当前资源目录中的关卡总数。 */
    totalCount: number;

    /** 大厅左上角展示的当前玩家资料。 */
    profile: PuzzleProfileData;
}

const { ccclass, property } = _decorator;

/**
 * 首页面板。
 *
 * 界面节点由 UIHomePanel.prefab 提供，脚本只负责绑定按钮和派发开始游戏事件。
 */
@ccclass("UIHomePanel")
export class UIHomePanel extends UIBase {
    /** 首页标题。 */
    @property({ type: Label })
    public titleLabel: Label | null = null;

    /** 开始当前目标关卡的按钮。 */
    @property({ type: Button })
    public startButton: Button | null = null;

    /** 开始按钮中用于显示目标关卡编号的文字。 */
    @property({ type: Label })
    public startButtonLabel: Label | null = null;

    /** 首页玩法提示。 */
    @property({ type: Label })
    public tipLabel: Label | null = null;

    /** 左上角玩家资料入口。 */
    @property({ type: Button })
    public profileButton: Button | null = null;

    /** 左上角当前头像。 */
    @property({ type: PuzzleAvatarRenderer })
    public profileAvatarRenderer: PuzzleAvatarRenderer | null = null;

    /** 左上角当前玩家名称。 */
    @property({ type: Label })
    public profileNameLabel: Label | null = null;

    /** 右上角设置入口。 */
    @property({ type: Button })
    public settingsButton: Button | null = null;

    /** 设置入口圆形底板。 */
    @property({ type: Graphics })
    public settingsButtonGraphics: Graphics | null = null;

    /** 是否已经注册按钮事件。 */
    private _eventsBound = false;

    /** 点击开始按钮时需要进入的关卡编号。 */
    private _targetLevel = 1;

    /** 节点加载时调用。 */
    protected onLoad(): void {
        this.assertRequiredBindings({
            titleLabel: this.titleLabel,
            startButton: this.startButton,
            startButtonLabel: this.startButtonLabel,
            tipLabel: this.tipLabel,
            profileButton: this.profileButton,
            profileAvatarRenderer: this.profileAvatarRenderer,
            profileNameLabel: this.profileNameLabel,
            settingsButton: this.settingsButton,
            settingsButtonGraphics: this.settingsButtonGraphics,
        });
        this.drawSettingsButton();
        this.bindEvents();
    }

    /** UI 打开时调用。 */
    protected onOpen(params?: unknown): void {
        super.onOpen(params);
        const homeParams = this.readOpenParams(params);
        this._targetLevel = homeParams.targetLevel;
        this.titleLabel!.string = "光影拼图";
        this.startButtonLabel!.string = `开始第 ${homeParams.targetLevel} 关`;
        this.tipLabel!.string =
            `已完成 ${homeParams.completedCount} / ${homeParams.totalCount}，` +
            `当前挑战第 ${homeParams.targetLevel} 关`;
        this.setProfile(homeParams.profile);
        this.bindEvents();
        Logger.info("打开首页面板。", params);
    }

    /** UI 关闭时调用。 */
    protected onClose(): void {
        this.unbindEvents();
        Logger.info("关闭首页面板。");
        super.onClose();
    }

    /** 注册首页按钮事件。 */
    private bindEvents(): void {
        if (this._eventsBound) {
            return;
        }

        this._eventsBound = true;
        this.startButton!.node.on(
            Button.EventType.CLICK,
            this.onClickStart,
            this,
        );
        this.profileButton!.node.on(
            Button.EventType.CLICK,
            this.onClickProfile,
            this,
        );
        this.settingsButton!.node.on(
            Button.EventType.CLICK,
            this.onClickSettings,
            this,
        );
    }

    /** 注销首页按钮事件。 */
    private unbindEvents(): void {
        if (!this._eventsBound) {
            return;
        }

        this._eventsBound = false;
        this.startButton!.node.off(
            Button.EventType.CLICK,
            this.onClickStart,
            this,
        );
        this.profileButton!.node.off(
            Button.EventType.CLICK,
            this.onClickProfile,
            this,
        );
        this.settingsButton!.node.off(
            Button.EventType.CLICK,
            this.onClickSettings,
            this,
        );
    }

    /** 校验大厅传入的进度摘要，避免首页展示错误存档状态。 */
    private readOpenParams(params: unknown): UIHomePanelOpenParams {
        if (
            !params ||
            typeof params !== "object" ||
            !("targetLevel" in params) ||
            !("completedCount" in params) ||
            !("totalCount" in params) ||
            !("profile" in params)
        ) {
            throw new Error("打开 UIHomePanel 时必须传入关卡进度参数。");
        }
        const targetLevel = params.targetLevel;
        const completedCount = params.completedCount;
        const totalCount = params.totalCount;
        const profile = params.profile;
        if (
            typeof targetLevel !== "number" ||
            !Number.isInteger(targetLevel) ||
            typeof completedCount !== "number" ||
            !Number.isInteger(completedCount) ||
            typeof totalCount !== "number" ||
            !Number.isInteger(totalCount) ||
            targetLevel <= 0 ||
            completedCount < 0 ||
            totalCount <= 0 ||
            completedCount > totalCount ||
            !profile ||
            typeof profile !== "object" ||
            !("version" in profile) ||
            !("name" in profile) ||
            !("avatarId" in profile) ||
            profile.version !== 1 ||
            typeof profile.name !== "string" ||
            typeof profile.avatarId !== "string"
        ) {
            throw new Error("UIHomePanel 收到的关卡进度参数无效。");
        }
        return {
            targetLevel,
            completedCount,
            totalCount,
            profile: {
                version: 1,
                name: profile.name,
                avatarId: profile.avatarId,
            },
        };
    }

    /** 点击开始按钮后进入当前最高已解锁关卡。 */
    public onClickStart(): void {
        const request: GameStartRequest = { level: this._targetLevel };
        EventCenter.emit(GameEvent.GameStart, request);
    }

    /** 场景切换期间锁定开始按钮，失败恢复后允许玩家再次操作。 */
    public setStartInteractable(interactable: boolean): void {
        this.startButton!.interactable = interactable;
    }

    /** 刷新大厅左上角当前头像和玩家名称。 */
    public setProfile(profile: PuzzleProfileData): void {
        this.profileAvatarRenderer!.render(
            getPuzzleAvatar(profile.avatarId),
            72,
            false,
        );
        this.profileNameLabel!.string = profile.name;
    }

    /** 打开头像资料弹窗。 */
    private onClickProfile(): void {
        EventCenter.emit(PuzzleSystemEvent.ProfileOpenRequested);
    }

    /** 打开设置弹窗。 */
    private onClickSettings(): void {
        EventCenter.emit(PuzzleSystemEvent.SettingsOpenRequested);
    }

    /** 绘制设置按钮底板。 */
    private drawSettingsButton(): void {
        this.settingsButtonGraphics!.clear();
        this.settingsButtonGraphics!.fillColor = new Color(37, 47, 64, 235);
        this.settingsButtonGraphics!.circle(0, 0, 38);
        this.settingsButtonGraphics!.fill();
    }
}
