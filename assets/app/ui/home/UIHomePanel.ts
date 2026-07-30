import { _decorator, Button, Color, Graphics, Label, Sprite } from "cc";
import { EventCenter } from "../../core/event/EventCenter";
import { UIBase } from "../../core/ui/UIBase";
import { Logger } from "../../core/utils/Logger";
import {
    PUZZLE_FIRST_ALBUM,
    PuzzleAlbumPanelStatus,
    PuzzleAlbumProgressSnapshot,
} from "../../game/config/PuzzleAlbumCatalog";
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

    /** 当前年代画册根据玩法存档生成的只读进度。 */
    albumProgress: PuzzleAlbumProgressSnapshot;

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
    /** 首页全屏暖色背景与自然装饰。 */
    @property({ type: Graphics })
    public backgroundGraphics: Graphics | null = null;

    /** 首页中央内容卡片。 */
    @property({ type: Graphics })
    public heroCardGraphics: Graphics | null = null;

    /** 画册五个画格的进度遮罩和状态边框。 */
    @property({ type: Graphics })
    public albumProgressGraphics: Graphics | null = null;

    /** 首页标题。 */
    @property({ type: Label })
    public titleLabel: Label | null = null;

    /** 当前画册年代名称。 */
    @property({ type: Label })
    public albumEraLabel: Label | null = null;

    /** 当前长卷名称。 */
    @property({ type: Label })
    public albumTitleLabel: Label | null = null;

    /** 当前长卷的情绪说明。 */
    @property({ type: Label })
    public albumSubtitleLabel: Label | null = null;

    /** 第一关对应的城门晨曦画格。 */
    @property({ type: Sprite })
    public albumPanelOneSprite: Sprite | null = null;

    /** 第二关对应的街巷早市画格。 */
    @property({ type: Sprite })
    public albumPanelTwoSprite: Sprite | null = null;

    /** 第三关对应的茶坊雅集画格。 */
    @property({ type: Sprite })
    public albumPanelThreeSprite: Sprite | null = null;

    /** 第四关对应的河畔舟行画格。 */
    @property({ type: Sprite })
    public albumPanelFourSprite: Sprite | null = null;

    /** 第五关对应的上元灯夜画格。 */
    @property({ type: Sprite })
    public albumPanelFiveSprite: Sprite | null = null;

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

    /** 玩家资料入口暖色底板。 */
    @property({ type: Graphics })
    public profileButtonGraphics: Graphics | null = null;

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
            backgroundGraphics: this.backgroundGraphics,
            heroCardGraphics: this.heroCardGraphics,
            albumProgressGraphics: this.albumProgressGraphics,
            titleLabel: this.titleLabel,
            albumEraLabel: this.albumEraLabel,
            albumTitleLabel: this.albumTitleLabel,
            albumSubtitleLabel: this.albumSubtitleLabel,
            albumPanelOneSprite: this.albumPanelOneSprite,
            albumPanelTwoSprite: this.albumPanelTwoSprite,
            albumPanelThreeSprite: this.albumPanelThreeSprite,
            albumPanelFourSprite: this.albumPanelFourSprite,
            albumPanelFiveSprite: this.albumPanelFiveSprite,
            startButton: this.startButton,
            startButtonLabel: this.startButtonLabel,
            tipLabel: this.tipLabel,
            profileButton: this.profileButton,
            profileButtonGraphics: this.profileButtonGraphics,
            profileAvatarRenderer: this.profileAvatarRenderer,
            profileNameLabel: this.profileNameLabel,
            settingsButton: this.settingsButton,
            settingsButtonGraphics: this.settingsButtonGraphics,
        });
        this.drawStaticView();
        this.bindEvents();
    }

    /** UI 打开时调用。 */
    protected onOpen(params?: unknown): void {
        super.onOpen(params);
        const homeParams = this.readOpenParams(params);
        this._targetLevel = homeParams.targetLevel;
        this.titleLabel!.string = "千年拾光";
        this.startButtonLabel!.string = `继续修复 · 第 ${homeParams.targetLevel} 关`;
        this.renderAlbumProgress(homeParams.albumProgress);
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
            !("albumProgress" in params) ||
            !("profile" in params)
        ) {
            throw new Error("打开 UIHomePanel 时必须传入关卡进度参数。");
        }
        const targetLevel = params.targetLevel;
        const completedCount = params.completedCount;
        const totalCount = params.totalCount;
        const albumProgress = this.readAlbumProgress(params.albumProgress);
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
            albumProgress,
            profile: {
                version: 1,
                name: profile.name,
                avatarId: profile.avatarId,
            },
        };
    }

    /**
     * 校验并重建大厅画册快照。
     *
     * 内容定义始终来自本地稳定目录，外部参数只允许提供五个画格的状态，防止
     * 错误对象替换资源路径或画册编号。
     */
    private readAlbumProgress(value: unknown): PuzzleAlbumProgressSnapshot {
        if (
            !value ||
            typeof value !== "object" ||
            !("panelStatuses" in value) ||
            !Array.isArray(value.panelStatuses) ||
            value.panelStatuses.length !== PUZZLE_FIRST_ALBUM.panels.length
        ) {
            throw new Error("UIHomePanel 收到的画册进度无效。");
        }

        const panelStatuses = value.panelStatuses;
        if (
            !panelStatuses.every(
                (status): status is PuzzleAlbumPanelStatus =>
                    status === "completed" ||
                    status === "current" ||
                    status === "locked",
            )
        ) {
            throw new Error("UIHomePanel 收到未知的画格状态。");
        }

        const completedPanelCount = panelStatuses.filter(
            (status) => status === "completed",
        ).length;
        const currentPanelIndex = panelStatuses.indexOf("current");
        const completed =
            completedPanelCount === PUZZLE_FIRST_ALBUM.panels.length;
        if (
            (completed && currentPanelIndex >= 0) ||
            (!completed && currentPanelIndex < 0) ||
            panelStatuses.filter((status) => status === "current").length > 1
        ) {
            throw new Error("UIHomePanel 收到互相矛盾的画册进度。");
        }

        return {
            album: PUZZLE_FIRST_ALBUM,
            panelStatuses: [...panelStatuses],
            completedPanelCount,
            remainingPanelCount:
                PUZZLE_FIRST_ALBUM.panels.length - completedPanelCount,
            currentPanel: completed
                ? null
                : PUZZLE_FIRST_ALBUM.panels[currentPanelIndex],
            completed,
        };
    }

    /** 根据画册快照刷新标题、画格明暗和进度提示。 */
    private renderAlbumProgress(progress: PuzzleAlbumProgressSnapshot): void {
        this.albumEraLabel!.string = `第一卷 · ${progress.album.eraTitle}`;
        this.albumTitleLabel!.string = `《${progress.album.scrollTitle}》`;
        this.albumSubtitleLabel!.string = progress.album.subtitle;
        this.tipLabel!.string = progress.completed
            ? "长卷已完整修复 · 下一卷静候开启"
            : `已点亮 ${progress.completedPanelCount} / ${progress.album.panels.length}` +
              ` · 再通 ${progress.remainingPanelCount} 关展开长卷`;

        this.getAlbumPanelSprites().forEach((sprite, index) => {
            const status = progress.panelStatuses[index];
            sprite.color =
                status === "completed"
                    ? new Color(255, 255, 255, 255)
                    : status === "current"
                      ? new Color(244, 224, 177, 230)
                      : new Color(166, 157, 137, 145);
        });
        this.drawAlbumProgress(progress.panelStatuses);
    }

    /** 返回按关卡顺序排列的五个 Inspector 显式绑定画格。 */
    private getAlbumPanelSprites(): readonly Sprite[] {
        return [
            this.albumPanelOneSprite!,
            this.albumPanelTwoSprite!,
            this.albumPanelThreeSprite!,
            this.albumPanelFourSprite!,
            this.albumPanelFiveSprite!,
        ];
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

    /** 绘制宣纸背景、画册卡片和两个顶部入口。 */
    private drawStaticView(): void {
        const background = this.backgroundGraphics!;
        background.clear();
        background.fillColor = new Color(246, 238, 218, 255);
        background.rect(-320, -568, 640, 1136);
        background.fill();

        // 右上暖日和底部远山只负责建立年代氛围，不覆盖核心文字与操作区。
        background.fillColor = new Color(206, 138, 72, 70);
        background.circle(250, 365, 128);
        background.fill();
        background.lineWidth = 4;
        background.strokeColor = new Color(87, 112, 100, 70);
        background.moveTo(-320, -415);
        background.bezierCurveTo(-220, -315, -115, -475, -20, -390);
        background.bezierCurveTo(85, -300, 185, -445, 320, -345);
        background.stroke();
        background.strokeColor = new Color(125, 97, 67, 50);
        background.moveTo(-320, -492);
        background.bezierCurveTo(-165, -380, -35, -545, 95, -455);
        background.bezierCurveTo(190, -390, 255, -475, 320, -430);
        background.stroke();

        const card = this.heroCardGraphics!;
        card.clear();
        card.fillColor = new Color(89, 62, 41, 25);
        card.roundRect(-278, -326, 556, 660, 32);
        card.fill();
        card.fillColor = new Color(255, 251, 238, 248);
        card.roundRect(-282, -318, 564, 660, 32);
        card.fill();
        card.lineWidth = 3;
        card.strokeColor = new Color(178, 137, 84, 155);
        card.roundRect(-282, -318, 564, 660, 32);
        card.stroke();

        const profile = this.profileButtonGraphics!;
        profile.clear();
        profile.fillColor = new Color(255, 248, 226, 242);
        profile.roundRect(-105, -43, 210, 86, 30);
        profile.fill();
        profile.lineWidth = 2;
        profile.strokeColor = new Color(176, 136, 83, 145);
        profile.roundRect(-105, -43, 210, 86, 30);
        profile.stroke();

        this.settingsButtonGraphics!.clear();
        this.settingsButtonGraphics!.fillColor = new Color(190, 126, 69, 245);
        this.settingsButtonGraphics!.circle(0, 0, 38);
        this.settingsButtonGraphics!.fill();
        this.settingsButtonGraphics!.lineWidth = 3;
        this.settingsButtonGraphics!.strokeColor = new Color(137, 82, 47, 210);
        this.settingsButtonGraphics!.circle(0, 0, 38);
        this.settingsButtonGraphics!.stroke();
    }

    /** 绘制五个画格的锁定遮罩、当前金框与完成标记。 */
    private drawAlbumProgress(
        statuses: readonly PuzzleAlbumPanelStatus[],
    ): void {
        const graphics = this.albumProgressGraphics!;
        const centers = [-200, -100, 0, 100, 200] as const;
        graphics.clear();
        statuses.forEach((status, index) => {
            const centerX = centers[index];
            if (status === "locked") {
                graphics.fillColor = new Color(236, 224, 197, 172);
                graphics.roundRect(centerX - 44, -44, 88, 88, 8);
                graphics.fill();
            }

            graphics.lineWidth = status === "current" ? 5 : 2;
            graphics.strokeColor =
                status === "completed"
                    ? new Color(91, 126, 99, 230)
                    : status === "current"
                      ? new Color(201, 139, 55, 255)
                      : new Color(151, 128, 95, 145);
            graphics.roundRect(centerX - 45, -45, 90, 90, 9);
            graphics.stroke();

            if (status === "completed") {
                graphics.fillColor = new Color(91, 126, 99, 245);
                graphics.circle(centerX + 35, 35, 10);
                graphics.fill();
            }
        });
    }
}
