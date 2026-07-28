import {
  _decorator,
  Button,
  Color,
  Graphics,
  instantiate,
  Label,
  Node,
  Prefab,
  Sprite,
  SpriteFrame,
  tween,
  Tween,
  UITransform,
  Vec3,
} from "cc";
import { EventCenter } from "../../core/event/EventCenter";
import { ResManager } from "../../core/resource/ResManager";
import type { ResourceHandle } from "../../core/resource/ResManager";
import { TimerManager } from "../../core/timer/TimerManager";
import { UIBase } from "../../core/ui/UIBase";
import { Logger } from "../../core/utils/Logger";
import type { PuzzleLevelConfig } from "../../game/config/PuzzleLevelConfig";
import { PuzzleGameController } from "../../game/controller/PuzzleGameController";
import { GameEvent } from "../../game/GameEvent";
import type { PuzzleBoardUpdate } from "../../game/logic/PuzzleBoard";
import { PuzzleGrid } from "../../game/logic/PuzzleGrid";
import { PuzzleImageSlicer } from "../../game/logic/PuzzleImageSlicer";
import { PuzzleMoveFailureReason } from "../../game/logic/PuzzleMovePlanner";
import type { PuzzleMovePlan } from "../../game/logic/PuzzleMovePlanner";
import { PuzzleGameStatus } from "../../game/model/PuzzleGameState";
import type { PuzzleGameState } from "../../game/model/PuzzleGameState";
import type { PuzzleGroup } from "../../game/model/PuzzleGroup";
import { PuzzleGroupBorderRenderer } from "./PuzzleGroupBorderRenderer";
import { PuzzlePiece } from "./PuzzlePiece";

const { ccclass, property } = _decorator;

/** 单个拼图实例在当前关卡中的运行数据。 */
interface PieceRuntime {
  /** 拼图块组件。 */
  piece: PuzzlePiece;
}

/** 打开拼图面板时必须传入的关卡参数。 */
export interface UIGamePanelOpenParams {
  /** 当前需要创建和展示的关卡配置。 */
  levelConfig: PuzzleLevelConfig;

  /** 当前关卡唯一的棋盘和玩法控制器。 */
  controller: PuzzleGameController;
}

/** 通用规则网格相邻拼接面板。 */
@ccclass("UIGamePanel")
export class UIGamePanel extends UIBase {
  /** 进入关卡后展示完整原图的时长，单位为秒。 */
  private static readonly SOURCE_PREVIEW_DURATION = 3;

  /** 增加时间道具单次补充的秒数。 */
  private static readonly TIME_TOOL_BONUS_SECONDS = 10;

  /** 时间进度条的完整宽度。 */
  private static readonly TIMER_BAR_WIDTH = 448;

  /** 时间进度条的固定高度。 */
  private static readonly TIMER_BAR_HEIGHT = 24;

  /** 棋盘中心相对面板中心的纵向偏移。 */
  private static readonly BOARD_CENTER_Y = 40;

  /** 组合成功动画的最大放大倍率。 */
  private static readonly CONNECTED_GROUP_SCALE = 1.08;

  /** 组合成功动画单程持续时间，单位为秒。 */
  private static readonly CONNECTED_GROUP_ANIMATION_DURATION = 0.12;

  /** 关卡标题。 */
  @property({ type: Label })
  public titleLabel: Label | null = null;

  /** 当前已连接的拼图数量。 */
  @property({ type: Label })
  public progressLabel: Label | null = null;

  /** 操作和通关提示。 */
  @property({ type: Label })
  public feedbackLabel: Label | null = null;

  /** 所有动态拼图块共用的坐标容器。 */
  @property({ type: Node })
  public puzzleContainer: Node | null = null;

  /** 拼图容器的坐标转换组件，用于把稳定 UI 触摸坐标换算为棋盘坐标。 */
  @property({ type: UITransform })
  public puzzleContainerTransform: UITransform | null = null;

  /** 所有静止组合共用的外轮廓绘制组件。 */
  @property({ type: Graphics })
  public restingGroupBorderGraphics: Graphics | null = null;

  /** 拖拽和合并动画共用的活动组合根节点。 */
  @property({ type: Node })
  public activeGroupRoot: Node | null = null;

  /** 活动组合内临时挂载拼图块的容器。 */
  @property({ type: Node })
  public activePieceContainer: Node | null = null;

  /** 活动组合独立使用的外轮廓绘制组件。 */
  @property({ type: Graphics })
  public activeGroupBorderGraphics: Graphics | null = null;

  /** 单块拼图 Prefab。 */
  @property({ type: Prefab })
  public piecePrefab: Prefab | null = null;

  /** 开局展示完整原图的预览节点。 */
  @property({ type: Node })
  public sourcePreviewNode: Node | null = null;

  /** 原图预览使用的全屏半透明蒙层。 */
  @property({ type: Graphics })
  public sourcePreviewOverlay: Graphics | null = null;

  /** 开局预览使用的完整原图组件。 */
  @property({ type: Sprite })
  public sourcePreviewSprite: Sprite | null = null;

  /** 开局预览显示剩余观察时间的文本。 */
  @property({ type: Label })
  public sourcePreviewCountdownLabel: Label | null = null;

  /** 时间进度条的底色绘制组件。 */
  @property({ type: Graphics })
  public timerBarBackground: Graphics | null = null;

  /** 时间进度条的剩余时间填充组件。 */
  @property({ type: Graphics })
  public timerBarFill: Graphics | null = null;

  /** 剩余秒数文本。 */
  @property({ type: Label })
  public timerLabel: Label | null = null;

  /** 重玩按钮。 */
  @property({ type: Button })
  public restartButton: Button | null = null;

  /** 返回大厅按钮。 */
  @property({ type: Button })
  public backButton: Button | null = null;

  /** 增加本关剩余时间的文字道具按钮。 */
  @property({ type: Button })
  public addTimeToolButton: Button | null = null;

  /** 在游戏中再次查看完整原图的文字道具按钮。 */
  @property({ type: Button })
  public viewSourceToolButton: Button | null = null;

  /** 自动完成一次正确相邻组合的文字道具按钮。 */
  @property({ type: Button })
  public autoMergeToolButton: Button | null = null;

  /** 拼图编号到运行实例的映射。 */
  private readonly _pieces = new Map<number, PieceRuntime>();

  /** 使用 Prefab 显式绑定节点创建的组合边框渲染器。 */
  private _groupBorderRenderer: PuzzleGroupBorderRenderer | null = null;

  /** 本次正在整体拖动的拼图编号集合。 */
  private _draggingPieceIds: Set<number> | null = null;

  /** 本次拖拽开始时各拼图所在格子，用于验证目标区域和失败复位。 */
  private readonly _dragOriginCells = new Map<number, number>();

  /** 上一次拖拽触摸在稳定棋盘坐标系中的位置。 */
  private readonly _dragLastTouchPosition = new Vec3();

  /** 当前唯一拖拽的触摸锚点；用于阻止多指同时修改棋盘占用。 */
  private _activeDragAnchorPieceId: number | null = null;

  /** 当前是否正在播放整组连接成功动画。 */
  private _groupAnimationRunning = false;

  /** 当前临时挂在活动根节点中播放动画的拼图编号。 */
  private readonly _animatingPieceIds = new Set<number>();

  /** 是否已注册按钮和状态事件。 */
  private _eventsBound = false;

  /** 当前打开面板时由场景传入的关卡配置。 */
  private _levelConfig: PuzzleLevelConfig | null = null;

  /** 当前打开面板时由场景传入的唯一玩法控制器。 */
  private _gameController: PuzzleGameController | null = null;

  /** 当前关卡单块拼图的显示宽度。 */
  private _pieceWidth = 0;

  /** 当前关卡单块拼图的显示高度。 */
  private _pieceHeight = 0;

  /** 当前关卡的规则网格，统一处理上下左右邻接关系。 */
  private _grid: PuzzleGrid | null = null;

  /** 控制器派发的当前显式玩法状态，所有输入和计时均以它为准。 */
  private _gameStatus = PuzzleGameStatus.Idle;

  /** 当前限时关卡剩余的秒数；不限时关卡固定保留为 0。 */
  private _remainingTime = 0;

  /** 是否已进入允许操作的正式拼图阶段；不限时关卡同样会设为 true。 */
  private _timerRunning = false;

  /**
   * 当前关卡创建请求编号。
   *
   * 重玩、关闭面板或销毁节点后会递增，旧异步请求返回时不得覆盖新一轮状态。
   */
  private _levelRequestId = 0;

  /** 当前完整原图预览使用的框架计时器编号。 */
  private _sourcePreviewTimerId: number | null = null;

  /** 取消预览计时后用于结束旧异步等待的回调。 */
  private _sourcePreviewResolve: (() => void) | null = null;

  /** 当前原图预览剩余的整秒数。 */
  private _sourcePreviewRemainingSeconds = 0;

  /**
   * 当前关卡原图预览专用的 SpriteFrame。
   *
   * 开局观察和道具查看复用同一个独立对象，直到重玩或退出时才销毁；这样既不会
   * 污染 ResManager 缓存，也不会在第二次查看时从运行中的资源状态重复克隆。
   */
  private _sourcePreviewFrame: SpriteFrame | null = null;

  /** 当前关卡运行时生成的切片，由面板在重玩或关闭时统一销毁。 */
  private _pieceFrames: SpriteFrame[] = [];

  /** ResManager 持有的当前关卡原图，仅用于创建切片和道具预览。 */
  private _levelSourceFrame: SpriteFrame | null = null;

  /** 当前关卡原图的资源所有权，在所有切片和预览对象销毁后归还。 */
  private _levelSourceHandle: ResourceHandle<SpriteFrame> | null = null;

  /** 是否正在通过道具查看原图，防止连续点击创建重叠的预览任务。 */
  private _toolPreviewRunning = false;

  /** 节点加载时校验 Prefab 引用并准备固定显示组件。 */
  protected onLoad(): void {
    this.assertRequiredBindings({
      titleLabel: this.titleLabel,
      progressLabel: this.progressLabel,
      feedbackLabel: this.feedbackLabel,
      puzzleContainer: this.puzzleContainer,
      puzzleContainerTransform: this.puzzleContainerTransform,
      restingGroupBorderGraphics: this.restingGroupBorderGraphics,
      activeGroupRoot: this.activeGroupRoot,
      activePieceContainer: this.activePieceContainer,
      activeGroupBorderGraphics: this.activeGroupBorderGraphics,
      piecePrefab: this.piecePrefab,
      sourcePreviewNode: this.sourcePreviewNode,
      sourcePreviewOverlay: this.sourcePreviewOverlay,
      sourcePreviewSprite: this.sourcePreviewSprite,
      sourcePreviewCountdownLabel: this.sourcePreviewCountdownLabel,
      timerBarBackground: this.timerBarBackground,
      timerBarFill: this.timerBarFill,
      timerLabel: this.timerLabel,
      restartButton: this.restartButton,
      backButton: this.backButton,
      addTimeToolButton: this.addTimeToolButton,
      viewSourceToolButton: this.viewSourceToolButton,
      autoMergeToolButton: this.autoMergeToolButton,
    });

    this._groupBorderRenderer = new PuzzleGroupBorderRenderer(
      this.restingGroupBorderGraphics!,
      this.activeGroupBorderGraphics!,
    );
    this.resetActiveGroupRoot();
    this.drawTimerBar();
    this.drawSourcePreviewOverlay();
    this.bindEvents();
  }

  /** 面板打开时读取关卡参数并创建对应拼图。 */
  protected onOpen(params?: unknown): void {
    super.onOpen(params);
    const openParams = this.readOpenParams(params);
    this._gameController = openParams.controller;
    this.configureLevel(openParams.levelConfig);
    this.titleLabel!.string = `关卡 ${openParams.levelConfig.level}`;
    const totalPieces =
      openParams.levelConfig.rows * openParams.levelConfig.columns;
    this.progressLabel!.string = `已连接 0 / ${totalPieces}`;
    this.feedbackLabel!.string = "拖动相邻图片，让正确边缘靠近";
    this.refreshTimerDisplay();
    this.bindEvents();
    void this.createLevel();
  }

  /** 正式游戏阶段逐帧扣减时间并平滑刷新进度条。 */
  protected update(deltaTime: number): void {
    if (
      !this._timerRunning ||
      this._gameStatus !== PuzzleGameStatus.Running ||
      this.levelConfig.timeLimitSeconds === null
    ) {
      return;
    }

    this._remainingTime = Math.max(0, this._remainingTime - deltaTime);
    this.refreshTimerDisplay();
    if (this._remainingTime <= 0) {
      this.expireLevel();
    }
  }

  /** 面板关闭时注销事件并销毁动态拼图实例。 */
  protected onClose(): void {
    this._levelRequestId += 1;
    this.stopLevelTimer();
    this.cancelSourcePreviewWait();
    this.hideSourcePreview();
    this.unbindEvents();
    this.clearPieces();
    this._grid = null;
    this._levelConfig = null;
    this._gameController = null;
    this._gameStatus = PuzzleGameStatus.Idle;
    super.onClose();
  }

  /**
   * 场景层恢复弹窗加载失败时，在仍然可见的游戏面板中展示明确提示。
   *
   * 本方法只更新已有 Prefab 绑定文本，不重开面板，也不改变当前关卡状态。
   */
  public showRecoverableError(message: string): void {
    this.feedbackLabel!.string = message;
  }

  /** 从 UIManager 打开参数中取得必填配置和控制器。 */
  private readOpenParams(params: unknown): UIGamePanelOpenParams {
    if (
      !params ||
      typeof params !== "object" ||
      !("levelConfig" in params) ||
      !params.levelConfig ||
      !("controller" in params) ||
      !(params.controller instanceof PuzzleGameController)
    ) {
      throw new Error(
        "打开 UIGamePanel 时必须传入 levelConfig 和 PuzzleGameController。",
      );
    }
    return params as UIGamePanelOpenParams;
  }

  /** 根据当前关卡配置准备切片尺寸和网格规则。 */
  private configureLevel(levelConfig: PuzzleLevelConfig): void {
    this._levelConfig = levelConfig;
    this._pieceWidth = levelConfig.boardWidth / levelConfig.columns;
    this._pieceHeight = levelConfig.boardHeight / levelConfig.rows;
    this._grid = new PuzzleGrid(
      levelConfig.rows,
      levelConfig.columns,
      this._pieceWidth,
      this._pieceHeight,
    );
    this.groupBorderRenderer.configure({
      rows: levelConfig.rows,
      columns: levelConfig.columns,
      pieceWidth: this._pieceWidth,
      pieceHeight: this._pieceHeight,
      boardCenterY: UIGamePanel.BOARD_CENTER_Y,
    });
    this.resetLevelTimer();
  }

  /** 返回当前关卡配置；未通过正常打开流程初始化时立即报错。 */
  private get levelConfig(): PuzzleLevelConfig {
    if (!this._levelConfig) {
      throw new Error("UIGamePanel 当前没有有效的关卡配置。");
    }
    return this._levelConfig;
  }

  /** 返回场景传入的唯一玩法控制器。 */
  private get gameController(): PuzzleGameController {
    if (!this._gameController) {
      throw new Error("UIGamePanel 当前没有有效的拼图控制器。");
    }
    return this._gameController;
  }

  /** 返回当前关卡网格；未初始化时立即报错。 */
  private get grid(): PuzzleGrid {
    if (!this._grid) {
      throw new Error("UIGamePanel 当前没有有效的拼图网格。");
    }
    return this._grid;
  }

  /** 返回已在 onLoad 创建的组合边框渲染器。 */
  private get groupBorderRenderer(): PuzzleGroupBorderRenderer {
    if (!this._groupBorderRenderer) {
      throw new Error("UIGamePanel 组合边框渲染器尚未初始化。");
    }
    return this._groupBorderRenderer;
  }

  /** 加载当前关卡整图，运行时裁成网格块并按打乱顺序放入规则网格。 */
  private async createLevel(): Promise<void> {
    const requestId = ++this._levelRequestId;
    this.cancelSourcePreviewWait();
    this.hideSourcePreview();
    this.clearPieces();
    this._gameStatus = this.gameController.status;
    this._toolPreviewRunning = false;
    this.resetLevelTimer();

    let loadingHandle: ResourceHandle<SpriteFrame> | null = null;
    try {
      // 关卡资源按 SpriteFrame 导入，裁切器使用完整底层纹理生成网格运行时切图。
      loadingHandle = await ResManager.acquire(
        this.levelConfig.sourceImagePath,
        SpriteFrame,
      );
      if (!this.node.isValid || requestId !== this._levelRequestId) {
        return;
      }
      const sourceFrame = loadingHandle.asset;

      // 关卡原图必须保持不可变，避免预览渲染后缓存对象被动态图集替换纹理。
      this.prepareSourceFrame(sourceFrame);
      this._levelSourceHandle = loadingHandle;
      loadingHandle = null;
      this._levelSourceFrame = sourceFrame;
      this._pieceFrames = PuzzleImageSlicer.slice(
        sourceFrame,
        this.levelConfig.rows,
        this.levelConfig.columns,
      );
      // 运行时切片共享同一张关卡纹理，禁止自动合图可避免重玩时复用旧图集区域。
      this._pieceFrames.forEach((frame) => {
        frame.packable = false;
      });
      await this.showSourcePreview(sourceFrame);
      if (!this.node.isValid || requestId !== this._levelRequestId) {
        return;
      }

      this.gameController.pieceIdsByCell.forEach((pieceId, displayIndex) => {
        const pieceNode = instantiate(this.piecePrefab!);
        const piece = pieceNode.getComponent(PuzzlePiece);
        if (!piece) {
          throw new Error("PuzzlePiece.prefab 缺少 PuzzlePiece 组件。");
        }

        this.puzzleContainer!.addChild(pieceNode);
        pieceNode.setPosition(this.getGridPosition(displayIndex));
        piece.setDisplaySize(this._pieceWidth, this._pieceHeight);
        piece.setData({
          id: pieceId,
          spriteFrame: this._pieceFrames[pieceId],
          onDragStart: this.onPieceDragStart,
          onDragMove: this.onPieceDragMove,
          onDrop: this.onPieceDrop,
        });
        this._pieces.set(pieceId, { piece });
      });
      this.feedbackLabel!.string = "拖动图片到目标格，与格内图片交换位置";
      this.startLevelTimer();
      this.renderBoardUpdate(this.gameController.currentBoardUpdate, false);
    } catch (error) {
      if (!this.node.isValid || requestId !== this._levelRequestId) {
        return;
      }
      this.hideSourcePreview();
      this.clearPieces();
      this.feedbackLabel!.string = `第 ${this.levelConfig.level} 关图片加载失败，请查看控制台`;
      Logger.error(`创建第 ${this.levelConfig.level} 关拼图失败。`, error);
    } finally {
      // 请求若在加载完成前已被重玩或关闭，所有权尚未转交给面板，必须在此立即归还。
      loadingHandle?.release();
    }
  }

  /**
   * 将关卡原图恢复为资源导入时的纹理状态，并禁止后续参与动态图集。
   *
   * `_resetDynamicAtlasFrame()` 是 Creator 3.8.4 提供的引擎接口，只在检测到原图
   * 已被自动合图时调用，用于兼容修改前已经运行过预览的缓存对象。
   */
  private prepareSourceFrame(sourceFrame: SpriteFrame): void {
    if (sourceFrame.original) {
      sourceFrame._resetDynamicAtlasFrame();
    }
    sourceFrame.packable = false;
  }

  /** 使用独立克隆展示完整原图，等待规定时长后再允许创建拼图。 */
  private async showSourcePreview(sourceFrame: SpriteFrame): Promise<void> {
    this.cancelSourcePreviewWait();

    if (!this._sourcePreviewFrame) {
      // 每关只创建一次预览克隆，并关闭自动合图，确保多次查看始终读取同一份正确区域。
      const previewFrame = sourceFrame.clone();
      previewFrame.packable = false;
      this._sourcePreviewFrame = previewFrame;
    }
    this.sourcePreviewSprite!.spriteFrame = this._sourcePreviewFrame;
    this.sourcePreviewNode!.active = true;
    this._sourcePreviewRemainingSeconds = UIGamePanel.SOURCE_PREVIEW_DURATION;
    this.refreshSourcePreviewCountdown();
    await this.waitForSourcePreview();
    this.hideSourcePreview();
  }

  /** 使用逐秒框架计时器显示 3、2、1，并在倒计时归零后结束预览。 */
  private waitForSourcePreview(): Promise<void> {
    return new Promise((resolve) => {
      this._sourcePreviewResolve = resolve;

      const countDown = (): void => {
        this._sourcePreviewRemainingSeconds -= 1;
        if (this._sourcePreviewRemainingSeconds <= 0) {
          this._sourcePreviewTimerId = null;
          this._sourcePreviewResolve = null;
          resolve();
          return;
        }

        this.refreshSourcePreviewCountdown();
        this._sourcePreviewTimerId = TimerManager.delay(countDown, 1);
      };

      this._sourcePreviewTimerId = TimerManager.delay(countDown, 1);
    });
  }

  /** 同步刷新预览层和底部提示中的剩余秒数。 */
  private refreshSourcePreviewCountdown(): void {
    const seconds = this._sourcePreviewRemainingSeconds;
    this.sourcePreviewCountdownLabel!.string = `观察原图  ${seconds}`;
    this.feedbackLabel!.string = `记住完整图片，${seconds} 秒后开始`;
  }

  /**
   * 取消尚未结束的预览等待。
   *
   * 清理计时器后仍要主动结束 Promise，让旧 createLevel 能继续执行请求编号校验，
   * 避免重玩或关闭面板后留下永久等待的异步任务。
   */
  private cancelSourcePreviewWait(): void {
    if (this._sourcePreviewTimerId !== null) {
      TimerManager.clear(this._sourcePreviewTimerId);
      this._sourcePreviewTimerId = null;
    }
    const resolve = this._sourcePreviewResolve;
    this._sourcePreviewResolve = null;
    this._sourcePreviewRemainingSeconds = 0;
    resolve?.();
  }

  /** 隐藏完整原图预览；专用 SpriteFrame 保留给本关下一次查看继续使用。 */
  private hideSourcePreview(): void {
    this.sourcePreviewNode!.active = false;
    this.sourcePreviewSprite!.spriteFrame = null;
    this.sourcePreviewCountdownLabel!.string = "观察原图";
  }

  /**
   * 释放预览专用 SpriteFrame。
   *
   * 此函数允许重复调用，只在重玩、关闭面板或关卡创建失败时释放本关专用对象。
   */
  private releaseSourcePreviewFrame(): void {
    if (!this._sourcePreviewFrame) {
      return;
    }
    this._sourcePreviewFrame.destroy();
    this._sourcePreviewFrame = null;
  }

  /** 绘制覆盖完整设计分辨率的预览蒙层，突出原图并拦住底层游戏画面。 */
  private drawSourcePreviewOverlay(): void {
    this.sourcePreviewOverlay!.clear();
    this.sourcePreviewOverlay!.fillColor = new Color(12, 16, 22, 210);
    this.sourcePreviewOverlay!.rect(-320, -568, 640, 1136);
    this.sourcePreviewOverlay!.fill();
  }

  /** 绘制进度条固定底色和满格填充，后续只缩放填充节点。 */
  private drawTimerBar(): void {
    const halfWidth = UIGamePanel.TIMER_BAR_WIDTH / 2;
    const halfHeight = UIGamePanel.TIMER_BAR_HEIGHT / 2;

    this.timerBarBackground!.clear();
    this.timerBarBackground!.fillColor = new Color(48, 56, 68, 220);
    this.timerBarBackground!.roundRect(
      -halfWidth,
      -halfHeight,
      UIGamePanel.TIMER_BAR_WIDTH,
      UIGamePanel.TIMER_BAR_HEIGHT,
      halfHeight,
    );
    this.timerBarBackground!.fill();

    this.timerBarFill!.clear();
    this.timerBarFill!.fillColor = new Color(55, 204, 118, 255);
    this.timerBarFill!.roundRect(
      0,
      -halfHeight,
      UIGamePanel.TIMER_BAR_WIDTH,
      UIGamePanel.TIMER_BAR_HEIGHT,
      halfHeight,
    );
    this.timerBarFill!.fill();
  }

  /** 恢复本关完整时间，但在原图观察阶段不开始扣减。 */
  private resetLevelTimer(): void {
    this._timerRunning = false;
    this._remainingTime = this.levelConfig.timeLimitSeconds ?? 0;
    this.refreshTimerDisplay();
  }

  /** 原图预览结束且拼图创建完成后开始关卡计时。 */
  private startLevelTimer(): void {
    this._timerRunning =
      this._gameStatus === PuzzleGameStatus.Running;
    this._remainingTime = this.levelConfig.timeLimitSeconds ?? 0;
    this.refreshTimerDisplay();
  }

  /** 停止时间衰减，供完成、失败、重玩和退出流程重复调用。 */
  private stopLevelTimer(): void {
    this._timerRunning = false;
  }

  /** 根据当前剩余比例刷新进度条长度和整秒文本。 */
  private refreshTimerDisplay(): void {
    const limit = this.levelConfig.timeLimitSeconds;
    if (limit === null) {
      this.timerBarFill!.node.setScale(1, 1, 1);
      this.timerLabel!.string = "无限时间";
      return;
    }
    const ratio =
      limit > 0 ? Math.max(0, Math.min(1, this._remainingTime / limit)) : 0;
    this.timerBarFill!.node.setScale(ratio, 1, 1);
    this.timerLabel!.string = `${Math.ceil(this._remainingTime)} 秒`;
  }

  /** 时间归零后锁定所有拼图，并请求控制器确认失败状态。 */
  private expireLevel(): void {
    if (
      !this._timerRunning ||
      this._gameStatus !== PuzzleGameStatus.Running
    ) {
      return;
    }
    this._timerRunning = false;
    if (this._groupAnimationRunning) {
      this.finishConnectedGroupAnimation(true, true);
    }
    this.restoreDraggingGroup();
    this.clearDraggingState();
    this._pieces.forEach((runtime) => runtime.piece.setInteractable(false));
    this.feedbackLabel!.string = "时间到，本关失败";
    EventCenter.emit(GameEvent.PuzzleTimeExpired);
  }

  /** 判断当前是否处于允许使用游戏道具的正式拼图阶段。 */
  private canUseGameTool(): boolean {
    const totalPieces = this.levelConfig.rows * this.levelConfig.columns;
    return (
      this._timerRunning &&
      this._gameStatus === PuzzleGameStatus.Running &&
      !this._toolPreviewRunning &&
      !this._groupAnimationRunning &&
      this._activeDragAnchorPieceId === null &&
      this._pieces.size === totalPieces
    );
  }

  /** 使用增加时间道具，为当前关卡补充固定秒数。 */
  private onAddTimeTool = (): void => {
    if (!this.canUseGameTool()) {
      return;
    }
    if (this.levelConfig.timeLimitSeconds === null) {
      this.feedbackLabel!.string = "本关时间无限，无需增加时间";
      return;
    }
    this._remainingTime += UIGamePanel.TIME_TOOL_BONUS_SECONDS;
    this.refreshTimerDisplay();
    this.feedbackLabel!.string = `增加 ${UIGamePanel.TIME_TOOL_BONUS_SECONDS} 秒`;
  };

  /**
   * 使用查看原图道具。
   *
   * 观察期间暂停关卡计时并锁住拼图，预览结束后恢复原来的剩余时间，
   * 不重新创建拼图，也不会改变已经完成的组合关系。
   */
  private onViewSourceTool = (): void => {
    if (!this.canUseGameTool() || !this._levelSourceFrame) {
      return;
    }
    void this.runToolSourcePreview(this._levelSourceFrame);
  };

  /** 执行道具原图预览，并在异步等待结束后恢复本轮游戏状态。 */
  private async runToolSourcePreview(sourceFrame: SpriteFrame): Promise<void> {
    const requestId = this._levelRequestId;
    this._toolPreviewRunning = true;
    this.stopLevelTimer();
    this._pieces.forEach((runtime) => runtime.piece.setInteractable(false));

    await this.showSourcePreview(sourceFrame);
    if (
      !this.node.isValid ||
      requestId !== this._levelRequestId ||
      this._gameStatus !== PuzzleGameStatus.Running
    ) {
      return;
    }

    this._toolPreviewRunning = false;
    this._pieces.forEach((runtime) => runtime.piece.setInteractable(true));
    this._timerRunning = true;
    this.feedbackLabel!.string = "继续拖动相邻图片完成拼接";
  }

  /** 使用自动组合道具，通过一次格子交换制造一组正确邻接。 */
  private onAutoMergeTool = (): void => {
    if (!this.canUseGameTool()) {
      return;
    }

    const update = this.gameController.autoMerge();
    if (!update) {
      this.feedbackLabel!.string = "当前没有可自动组合的拼图";
      return;
    }

    this.gameController.pieceIdsByCell.forEach((pieceId, cellIndex) => {
      this._pieces
        .get(pieceId)!
        .piece.node.setPosition(this.getGridPosition(cellIndex));
    });
    this.renderBoardUpdate(update, true);
    if (this._gameStatus === PuzzleGameStatus.Running) {
      this.feedbackLabel!.string = "已自动完成 1 次正确组合";
    }
  };

  /**
   * 根据格子序号生成无间隙的规则网格中心坐标。
   *
   * 每张切片始终铺满自己的格子，组合内部没有人为间距；外轮廓由共享 Graphics
   * 覆盖在切片上方，因此合并后只消除公共边，不需要改变图片尺寸。
   */
  private getGridPosition(cellIndex: number): Vec3 {
    const cell = this.grid.getCell(cellIndex);
    const x =
      (cell.column - (this.levelConfig.columns - 1) / 2) * this._pieceWidth;
    const y =
      UIGamePanel.BOARD_CENTER_Y +
      ((this.levelConfig.rows - 1) / 2 - cell.row) * this._pieceHeight;
    return new Vec3(x, y, 0);
  }

  /**
   * 开始拖动时锁定唯一触摸，并把真实组合临时挂到活动根节点。
   *
   * 所有成员和格子先完整校验，再统一换父节点。之后拖动每帧只修改活动根节点的
   * Transform；单块和 10×10 大组合走同一条路径，不会随组合大小增加每帧写操作。
   */
  private onPieceDragStart = (
    pieceId: number,
    touchStartPosition: Readonly<Vec3>,
  ): boolean => {
    if (
      !this._timerRunning ||
      this._gameStatus !== PuzzleGameStatus.Running ||
      this._toolPreviewRunning ||
      this._groupAnimationRunning ||
      this._activeDragAnchorPieceId !== null
    ) {
      return false;
    }
    const group = this.gameController.getGroupByPieceId(pieceId);
    if (!group) {
      return false;
    }

    const draggingPieceIds = new Set(group.pieceIds);
    const dragEntries: Array<{
      id: number;
      runtime: PieceRuntime;
      cellIndex: number;
    }> = [];
    draggingPieceIds.forEach((id) => {
      const runtime = this._pieces.get(id);
      if (!runtime) {
        throw new Error(`拖拽组合缺少拼图 ${id} 的运行状态。`);
      }
      const cellIndex = this.gameController.getCellIndexByPieceId(id);
      dragEntries.push({ id, runtime, cellIndex });
    });
    if (this.activePieceContainer!.children.length !== 0) {
      throw new Error("活动组合容器在拖拽开始前仍有未清理节点。");
    }

    // 先完成整组校验再写入活动状态，异常快照不会把后续触摸永久锁住。
    this._activeDragAnchorPieceId = pieceId;
    this._draggingPieceIds = draggingPieceIds;
    this._dragOriginCells.clear();
    this.resetActiveGroupRoot();
    this._dragLastTouchPosition.set(
      this.convertUiPositionToPuzzle(touchStartPosition),
    );
    dragEntries.forEach(({ id, runtime, cellIndex }) => {
      this._dragOriginCells.set(id, cellIndex);
      runtime.piece.node.setParent(this.activePieceContainer!, true);
    });
    this.groupBorderRenderer.renderRestingGroups(
      this.gameController.groups,
      this.gameController.cellIndexByPieceId,
      group.id,
    );
    this.groupBorderRenderer.renderActiveGroup(
      group,
      this.gameController.cellIndexByPieceId,
    );
    return true;
  };

  /** 根据稳定 UI 触摸坐标只移动活动组合根节点，保持组合形状和边框完全同步。 */
  private onPieceDragMove = (
    pieceId: number,
    currentPosition: Readonly<Vec3>,
  ): void => {
    if (this._gameStatus !== PuzzleGameStatus.Running) {
      return;
    }
    if (
      this._activeDragAnchorPieceId !== pieceId ||
      !this._draggingPieceIds?.has(pieceId)
    ) {
      return;
    }
    const localPosition = this.convertUiPositionToPuzzle(currentPosition);
    const deltaX = localPosition.x - this._dragLastTouchPosition.x;
    const deltaY = localPosition.y - this._dragLastTouchPosition.y;
    this._dragLastTouchPosition.set(localPosition);
    const activePosition = this.activeGroupRoot!.position;
    this.activeGroupRoot!.setPosition(
      activePosition.x + deltaX,
      activePosition.y + deltaY,
      0,
    );
  };

  /**
   * 松手时验证整个组合是否能够平移到目标格。
   *
   * 取消触摸或源组合越界时完整复位；目标中的旧组合允许被回填链拆分，只有源组合
   * 保持整体形状。移动计划通过边界和占用校验后，才一次性提交全部格子变化。
   */
  private onPieceDrop = (pieceId: number, canceled: boolean): void => {
    if (this._gameStatus !== PuzzleGameStatus.Running) {
      return;
    }
    if (this._activeDragAnchorPieceId !== pieceId) {
      return;
    }

    if (canceled) {
      this.restoreDraggingGroup();
      this.feedbackLabel!.string = "拖拽已取消，组合已返回原位";
      this.clearDraggingState();
      return;
    }

    const sourceCellIndex = this._dragOriginCells.get(pieceId);
    if (
      sourceCellIndex === undefined ||
      !this._draggingPieceIds?.has(pieceId)
    ) {
      this.restoreDraggingGroup();
      this.clearDraggingState();
      Logger.error(`拼图 ${pieceId} 松手时缺少完整拖拽快照。`);
      this.feedbackLabel!.string = "拖拽状态异常，本次操作已复位";
      return;
    }

    const draggedAnchorPosition = this.getGridPosition(sourceCellIndex);
    draggedAnchorPosition.add(this.activeGroupRoot!.position);
    const targetCellIndex =
      this.getNearestGridCellIndex(draggedAnchorPosition) ?? -1;
    const plan = this.createDraggingMovePlan(pieceId, targetCellIndex);
    if (!plan.valid) {
      this.restoreDraggingGroup();
      this.feedbackLabel!.string = this.getMoveFailureFeedback(plan.reason);
      if (this.isInternalMoveFailure(plan.reason)) {
        Logger.error(
          `第 ${this.levelConfig.level} 关拖拽状态异常：${plan.reason}`,
        );
      }
      this.clearDraggingState();
      return;
    }

    this.releaseDraggingPiecesToBoard();
    const update = this.commitMovePlan(plan);
    this.clearDraggingState();
    if (!update) {
      this.feedbackLabel!.string = "当前关卡已结束，本次操作未生效";
      return;
    }
    const connectedPieceIds = this.renderBoardUpdate(update, true);
    // 完成事件会同步写入最终提示，不能再被本次普通落点反馈覆盖。
    if (this._gameStatus === PuzzleGameStatus.Running) {
      this.feedbackLabel!.string =
        connectedPieceIds.length >= 2
          ? `已连接 ${connectedPieceIds.length} 块`
          : "组合已放入目标格，继续寻找正确相邻位置";
    }
  };

  /**
   * 根据当前拖拽快照创建完整移动计划。
   *
   * 规划器会处理重叠平移形成的移动链。玩家拿起的组合始终整体平移，目标区域
   * 被覆盖的拼图依次回填到腾出的格子，旧目标组合可在提交后重新拆分或连接。
   */
  private createDraggingMovePlan(
    anchorPieceId: number,
    targetAnchorCellIndex: number,
  ): PuzzleMovePlan {
    return this.gameController.createMovePlan(
      anchorPieceId,
      targetAnchorCellIndex,
    );
  }

  /**
   * 一次性提交规划器返回的完整置换，并把所有受影响节点吸附到格子中心。
   *
   * 提交前再次核对来源、目标和反向索引；任何状态不一致都会在写入前抛错，避免
   * 快速触摸或后续代码改动造成半组已移动、半组仍在原位。
   */
  private commitMovePlan(plan: PuzzleMovePlan): PuzzleBoardUpdate | null {
    if (!plan.valid) {
      throw new Error("不能提交无效的拼图移动计划。");
    }

    for (const move of plan.moves) {
      const runtime = this._pieces.get(move.pieceId);
      if (
        !runtime ||
        this.gameController.getPieceIdAt(move.sourceCellIndex) !==
          move.pieceId
      ) {
        throw new Error(
          `拼图移动计划与界面实例不一致：piece=${move.pieceId}，` +
            `source=${move.sourceCellIndex}`,
        );
      }
    }

    const update = this.gameController.commitMovePlan(plan);
    if (!update) {
      return null;
    }
    for (const move of plan.moves) {
      this._pieces
        .get(move.pieceId)!
        .piece.node.setPosition(this.getGridPosition(move.targetCellIndex));
    }
    return update;
  }

  /** 将移动规划失败原因转换为玩家可理解、可排错的放置反馈。 */
  private getMoveFailureFeedback(reason: PuzzleMoveFailureReason): string {
    switch (reason) {
      case PuzzleMoveFailureReason.TargetOutOfBounds:
      case PuzzleMoveFailureReason.InvalidAnchor:
        return "组合超出棋盘边界，已返回原位";
      default:
        return "拼图占用状态异常，本次拖拽已复位";
    }
  }

  /** 区分玩家正常放置失败与必须进入控制台排查的内部状态错误。 */
  private isInternalMoveFailure(reason: PuzzleMoveFailureReason): boolean {
    switch (reason) {
      case PuzzleMoveFailureReason.InvalidAnchor:
      case PuzzleMoveFailureReason.TargetOutOfBounds:
        return false;
      default:
        return true;
    }
  }

  /** 放置失败时根据拖拽开始前记录的格子复位整个组合。 */
  private restoreDraggingGroup(): void {
    if (!this._draggingPieceIds) {
      return;
    }
    this.releaseDraggingPiecesToBoard();
    this._dragOriginCells.forEach((cellIndex, id) => {
      this._pieces.get(id)?.piece.node.setPosition(
        this.getGridPosition(cellIndex),
      );
    });
    this.groupBorderRenderer.renderRestingGroups(
      this.gameController.groups,
      this.gameController.cellIndexByPieceId,
    );
  }

  /** 清空本轮拖拽的临时引用；允许在成功和失败路径重复调用。 */
  private clearDraggingState(): void {
    this._activeDragAnchorPieceId = null;
    this._draggingPieceIds = null;
    this._dragOriginCells.clear();
    this._dragLastTouchPosition.set(0, 0, 0);
  }

  /**
   * 把活动组合成员放回静止拼图容器，并复位活动根节点。
   *
   * 先使用 keepWorldTransform 换父节点，再把根节点归零，防止提交前出现一帧额外
   * 位移。最终格子吸附由成功提交或失败复位各自负责。
   */
  private releaseDraggingPiecesToBoard(): void {
    this._draggingPieceIds?.forEach((pieceId) => {
      const node = this._pieces.get(pieceId)?.piece.node;
      if (node?.isValid) {
        node.setParent(this.puzzleContainer!, true);
      }
    });
    this.resetActiveGroupRoot();
    this.groupBorderRenderer.clearActiveGroup();
  }

  /** 把 UI 触摸坐标转换到不会随活动组合移动的棋盘坐标系。 */
  private convertUiPositionToPuzzle(position: Readonly<Vec3>): Vec3 {
    return this.puzzleContainerTransform!.convertToNodeSpaceAR(
      new Vec3(position.x, position.y, 0),
    );
  }

  /**
   * 使用活动组合根节点播放一次整体放大回弹。
   *
   * 动画期间图片和外轮廓属于同一个根节点，因此不会出现单块各自放大造成的裂缝；
   * 输入暂时锁定，动画结束后再把成员归还静止容器并恢复共享边框层。
   */
  private playConnectedGroupAnimation(group: PuzzleGroup): void {
    if (group.size < 2) {
      return;
    }
    if (this._groupAnimationRunning) {
      this.finishConnectedGroupAnimation(true, true);
    }
    if (this.activePieceContainer!.children.length !== 0) {
      throw new Error("活动组合容器在连接动画开始前仍有未清理节点。");
    }

    const center = this.getGroupCenter(group);
    this._groupAnimationRunning = true;
    this._animatingPieceIds.clear();
    this.activeGroupRoot!.setPosition(center);
    this.activeGroupRoot!.setScale(1, 1, 1);
    group.pieceIds.forEach((pieceId) => {
      const runtime = this._pieces.get(pieceId);
      if (!runtime) {
        throw new Error(`连接动画缺少拼图 ${pieceId} 的运行实例。`);
      }
      this._animatingPieceIds.add(pieceId);
      runtime.piece.node.setParent(this.activePieceContainer!, true);
    });

    this.groupBorderRenderer.renderRestingGroups(
      this.gameController.groups,
      this.gameController.cellIndexByPieceId,
      group.id,
    );
    this.groupBorderRenderer.renderActiveGroup(
      group,
      this.gameController.cellIndexByPieceId,
      { x: -center.x, y: -center.y },
    );

    tween(this.activeGroupRoot!)
      .to(
        UIGamePanel.CONNECTED_GROUP_ANIMATION_DURATION,
        {
          scale: new Vec3(
            UIGamePanel.CONNECTED_GROUP_SCALE,
            UIGamePanel.CONNECTED_GROUP_SCALE,
            1,
          ),
        },
        { easing: "quadOut" },
      )
      .to(
        UIGamePanel.CONNECTED_GROUP_ANIMATION_DURATION,
        { scale: new Vec3(1, 1, 1) },
        { easing: "quadIn" },
      )
      .call(() => this.finishConnectedGroupAnimation(false, true))
      .start();
  }

  /**
   * 结束组合动画并把所有成员恢复到正式棋盘容器。
   *
   * 方法允许被 Tween 回调、超时、重玩和销毁重复调用。中途停止时先恢复标准缩放，
   * 再按逻辑格子重新吸附，避免保留动画进行到一半的世界坐标。
   */
  private finishConnectedGroupAnimation(
    stopTween: boolean,
    renderBorders: boolean,
  ): void {
    if (stopTween) {
      Tween.stopAllByTarget(this.activeGroupRoot!);
    }
    this.activeGroupRoot!.setScale(1, 1, 1);
    this._animatingPieceIds.forEach((pieceId) => {
      const runtime = this._pieces.get(pieceId);
      if (!runtime?.piece.node.isValid) {
        return;
      }
      const cellIndex = this.gameController.getCellIndexByPieceId(pieceId);
      runtime.piece.node.setParent(this.puzzleContainer!, true);
      runtime.piece.node.setPosition(this.getGridPosition(cellIndex));
    });
    this._animatingPieceIds.clear();
    this._groupAnimationRunning = false;
    this.resetActiveGroupRoot();
    this.groupBorderRenderer.clearActiveGroup();
    if (renderBorders && this._levelConfig && this._grid) {
      this.groupBorderRenderer.renderRestingGroups(
        this.gameController.groups,
        this.gameController.cellIndexByPieceId,
      );
    }
  }

  /** 计算组合当前外接矩形中心，作为整体缩放动画的正确轴心。 */
  private getGroupCenter(group: PuzzleGroup): Vec3 {
    let minimumX = Number.POSITIVE_INFINITY;
    let maximumX = Number.NEGATIVE_INFINITY;
    let minimumY = Number.POSITIVE_INFINITY;
    let maximumY = Number.NEGATIVE_INFINITY;
    group.pieceIds.forEach((pieceId) => {
      const cellIndex = this.gameController.getCellIndexByPieceId(pieceId);
      const position = this.getGridPosition(cellIndex);
      minimumX = Math.min(minimumX, position.x);
      maximumX = Math.max(maximumX, position.x);
      minimumY = Math.min(minimumY, position.y);
      maximumY = Math.max(maximumY, position.y);
    });
    return new Vec3(
      (minimumX + maximumX) / 2,
      (minimumY + maximumY) / 2,
      0,
    );
  }

  /** 复位活动组合根节点的位置和缩放；不改变其子节点归属。 */
  private resetActiveGroupRoot(): void {
    this.activeGroupRoot!.setPosition(0, 0, 0);
    this.activeGroupRoot!.setScale(1, 1, 1);
  }

  /** 根据拖拽节点中心取得最近格子；超出棋盘半格范围时判定为无效落点。 */
  private getNearestGridCellIndex(position: Readonly<Vec3>): number | null {
    const column = Math.round(
      position.x / this._pieceWidth +
        (this.levelConfig.columns - 1) / 2,
    );
    const row = Math.round(
      (UIGamePanel.BOARD_CENTER_Y - position.y) / this._pieceHeight +
        (this.levelConfig.rows - 1) / 2,
    );
    return this.getCellIndex(row, column);
  }

  /** 把合法行列转换为格子编号，越界时返回 null。 */
  private getCellIndex(row: number, column: number): number | null {
    if (
      row < 0 ||
      row >= this.levelConfig.rows ||
      column < 0 ||
      column >= this.levelConfig.columns
    ) {
      return null;
    }
    return row * this.levelConfig.columns + column;
  }

  /** 根据规则棋盘的唯一结果刷新组合边框、动画和界面进度。 */
  private renderBoardUpdate(
    update: PuzzleBoardUpdate,
    playConnectedAnimation: boolean,
  ): number[] {
    this.groupBorderRenderer.renderRestingGroups(
      update.groups,
      this.gameController.cellIndexByPieceId,
    );

    const reportedPieceIds = update.largestConnectedGroup
      ? Array.from(update.largestConnectedGroup.pieceIds)
      : [];
    if (playConnectedAnimation && update.expandedGroups.length > 0) {
      const animationGroup = [...update.expandedGroups].sort(
        (first, second) => second.size - first.size || first.id - second.id,
      )[0];
      this.playConnectedGroupAnimation(animationGroup);
    }
    return reportedPieceIds;
  }

  /** 刷新已连接数量，并让计时、预览和输入服从控制器显式状态。 */
  private onStateChanged = (state?: PuzzleGameState): void => {
    if (!state) {
      return;
    }
    this._gameStatus = state.status;
    this.progressLabel!.string =
      `已连接 ${state.placedCount} / ${state.totalCount}`;

    if (state.status === PuzzleGameStatus.Paused) {
      this.stopLevelTimer();
      if (this._sourcePreviewTimerId !== null) {
        TimerManager.pause(this._sourcePreviewTimerId);
      }
      if (this._groupAnimationRunning) {
        this.finishConnectedGroupAnimation(true, true);
      }
      this.restoreDraggingGroup();
      this.clearDraggingState();
      this._pieces.forEach((runtime) => {
        runtime.piece.setInteractable(false);
      });
      this.feedbackLabel!.string = "游戏已暂停";
      return;
    }

    if (state.status === PuzzleGameStatus.Running) {
      if (this._sourcePreviewTimerId !== null) {
        TimerManager.resume(this._sourcePreviewTimerId);
      }
      const totalPieces =
        this.levelConfig.rows * this.levelConfig.columns;
      if (
        this._pieces.size === totalPieces &&
        !this.sourcePreviewNode!.active &&
        !this._toolPreviewRunning
      ) {
        this._timerRunning = true;
        this._pieces.forEach((runtime) => {
          runtime.piece.setInteractable(true);
        });
        this.feedbackLabel!.string = "继续拖动相邻图片完成拼接";
      }
      return;
    }

    this.stopLevelTimer();
    this._pieces.forEach((runtime) => {
      runtime.piece.setInteractable(false);
    });
  };

  /** 通关后保持完整图片位于规则棋盘，并锁定全部拖拽输入。 */
  private onCompleted = (): void => {
    this.stopLevelTimer();
    this._pieces.forEach((runtime) => {
      runtime.piece.setInteractable(false);
    });
    this.feedbackLabel!.string = `第 ${this.levelConfig.level} 关完成！`;
  };

  /** 按钮请求重新开始当前关卡。 */
  private onRestart = (): void => EventCenter.emit(GameEvent.PuzzleRestart);

  /** 收到统一重玩事件后重新执行原图预览和拼图创建流程。 */
  private onRestartRequested = (): void => {
    void this.createLevel();
  };

  /** 请求场景返回大厅。 */
  private onBack = (): void => EventCenter.emit(GameEvent.BackToLobby);

  /** 注册按钮和拼图状态事件。 */
  private bindEvents(): void {
    if (this._eventsBound) {
      return;
    }
    this._eventsBound = true;
    this.restartButton!.node.on(Button.EventType.CLICK, this.onRestart, this);
    this.backButton!.node.on(Button.EventType.CLICK, this.onBack, this);
    this.addTimeToolButton!.node.on(
      Button.EventType.CLICK,
      this.onAddTimeTool,
      this,
    );
    this.viewSourceToolButton!.node.on(
      Button.EventType.CLICK,
      this.onViewSourceTool,
      this,
    );
    this.autoMergeToolButton!.node.on(
      Button.EventType.CLICK,
      this.onAutoMergeTool,
      this,
    );
    EventCenter.on(GameEvent.PuzzleStateChanged, this.onStateChanged, this);
    EventCenter.on(GameEvent.PuzzleCompleted, this.onCompleted, this);
    EventCenter.on(GameEvent.PuzzleRestart, this.onRestartRequested, this);
  }

  /** 注销按钮和拼图状态事件。 */
  private unbindEvents(): void {
    if (!this._eventsBound) {
      return;
    }
    this._eventsBound = false;
    this.restartButton!.node.off(Button.EventType.CLICK, this.onRestart, this);
    this.backButton!.node.off(Button.EventType.CLICK, this.onBack, this);
    this.addTimeToolButton!.node.off(
      Button.EventType.CLICK,
      this.onAddTimeTool,
      this,
    );
    this.viewSourceToolButton!.node.off(
      Button.EventType.CLICK,
      this.onViewSourceTool,
      this,
    );
    this.autoMergeToolButton!.node.off(
      Button.EventType.CLICK,
      this.onAutoMergeTool,
      this,
    );
    EventCenter.off(GameEvent.PuzzleStateChanged, this.onStateChanged, this);
    EventCenter.off(GameEvent.PuzzleCompleted, this.onCompleted, this);
    EventCenter.off(GameEvent.PuzzleRestart, this.onRestartRequested, this);
  }

  /** 销毁上一轮界面实例和运行时切片；棋盘占用由控制器独立管理。 */
  private clearPieces(): void {
    this.finishConnectedGroupAnimation(true, false);
    Tween.stopAllByTarget(this.activeGroupRoot!);
    this._pieces.forEach((runtime) => runtime.piece.node.destroy());
    this._pieces.clear();
    this.groupBorderRenderer.clear();
    this.resetActiveGroupRoot();
    this.clearDraggingState();
    this._pieceFrames.forEach((frame) => frame.destroy());
    this._pieceFrames = [];
    this.releaseSourcePreviewFrame();
    this._levelSourceFrame = null;
    // Creator 会在帧末完成 destroy；延迟到下一轮任务再释放共享纹理，避免派生帧尚未销毁。
    const sourceHandle = this._levelSourceHandle;
    if (sourceHandle) {
      TimerManager.delay(() => sourceHandle.release(), 0);
    }
    this._levelSourceHandle = null;
    this._toolPreviewRunning = false;
  }
}
