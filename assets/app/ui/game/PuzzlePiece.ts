import {
  _decorator,
  EventTouch,
  Label,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
  Vec3,
} from "cc";
import type { PoolLifecycle } from "../../core/pool/PoolManager";
import { UIBase } from "../../core/ui/UIBase";

const { ccclass, property } = _decorator;

/** 拼图块初始化参数。 */
export interface PuzzlePieceParams {
  /** 拼图编号。 */
  id: number;

  /** 拼图块显示的运行时切图。 */
  spriteFrame: SpriteFrame;

  /** 开始拖动时请求面板锁定当前组合；返回 false 表示当前不能操作。 */
  onDragStart: (id: number, touchStartPosition: Readonly<Vec3>) => boolean;

  /** 拖动时把当前 UI 触摸坐标交给面板，用于移动整个组合根节点。 */
  onDragMove: (id: number, currentPosition: Readonly<Vec3>) => void;

  /** 拖动结束时通知面板执行目标格交换；取消触摸时只允许复位。 */
  onDrop: (id: number, canceled: boolean) => void;
}

/**
 * 单个拼图块 Prefab 脚本。
 *
 * 本组件只显示一张完整格子切片并采集触摸输入，不判断组合、边框、网格交换和
 * 邻接关系。组合视图和棋盘状态统一由 UIGamePanel 管理。
 */
@ccclass("PuzzlePiece")
export class PuzzlePiece extends UIBase implements PoolLifecycle {
  /** 超过此距离才进入拖拽，避免轻点或触摸抖动误换格。 */
  private static readonly DRAG_START_DISTANCE = 6;

  /** 拼图块根节点尺寸，用于匹配当前关卡网格。 */
  @property({ type: UITransform })
  public pieceTransform: UITransform | null = null;

  /** 拼图块图片。 */
  @property({ type: Sprite })
  public imageSprite: Sprite | null = null;

  /** 图片缺失时用于排错的拼图编号。 */
  @property({ type: Label })
  public numberLabel: Label | null = null;

  /** 当前拼图编号。 */
  private _pieceId = -1;

  /** 当前触摸开始点的 UI 坐标，用于判断是否超过拖拽启动距离。 */
  private readonly _touchStartPosition = new Vec3();

  /** 当前由本组件接管的触摸编号；null 表示没有活动触摸。 */
  private _activeTouchId: number | null = null;

  /** 当前触摸是否已经通过距离阈值并被面板接受为拖拽。 */
  private _dragStarted = false;

  /** 当前是否允许拖拽。 */
  private _interactable = true;

  /** 输入事件是否已经注册，保证首次加载与对象池复用都保持幂等。 */
  private _inputEventsBound = false;

  /** 开始拖动回调。 */
  private _onDragStart:
    | ((id: number, touchStartPosition: Readonly<Vec3>) => boolean)
    | null = null;

  /** 拖动坐标回调。 */
  private _onDragMove:
    | ((id: number, currentPosition: Readonly<Vec3>) => void)
    | null = null;

  /** 拖动结束回调。 */
  private _onDrop: ((id: number, canceled: boolean) => void) | null = null;

  /** 节点加载时校验 Prefab 绑定并注册拖拽事件。 */
  protected onLoad(): void {
    this.assertRequiredBindings({
      pieceTransform: this.pieceTransform,
      imageSprite: this.imageSprite,
      numberLabel: this.numberLabel,
    });
    this.bindInputEvents();
  }

  /** 节点从对象池取出时恢复输入并接收本轮唯一业务参数。 */
  public reuse(...args: unknown[]): void {
    const params = args[0];
    if (args.length !== 1 || !this.isPuzzlePieceParams(params)) {
      throw new Error("PuzzlePiece 对象池复用参数无效。");
    }
    this.resetTouchState();
    this.bindInputEvents();
    this.setData(params);
  }

  /** 节点回收到对象池前注销输入、清空切图和全部旧回调引用。 */
  public unuse(): void {
    this._interactable = false;
    this.unbindInputEvents();
    this.resetTouchState();
    this._pieceId = -1;
    this._onDragStart = null;
    this._onDragMove = null;
    this._onDrop = null;
    if (this.imageSprite) {
      this.imageSprite.spriteFrame = null;
    }
    if (this.numberLabel) {
      this.numberLabel.string = "";
      this.numberLabel.node.active = false;
    }
  }

  /**
   * 根据关卡配置设置拼图块尺寸。
   *
   * 根节点和 Sprite 共用同一个 UITransform，因此切片始终铺满规则格子。组合外框
   * 由面板的轮廓渲染层统一绘制，不再因连接状态切换单块遮罩或缩放图片。
   */
  public setDisplaySize(width: number, height: number): void {
    if (width <= 0 || height <= 0) {
      throw new Error(`拼图块显示尺寸无效：${width}×${height}`);
    }
    this.pieceTransform!.setContentSize(width, height);
  }

  /** 初始化拼图块图片和拖拽回调。 */
  public setData(params: PuzzlePieceParams): void {
    this._pieceId = params.id;
    this._onDragStart = params.onDragStart;
    this._onDragMove = params.onDragMove;
    this._onDrop = params.onDrop;
    this._interactable = true;
    this.imageSprite!.spriteFrame = params.spriteFrame;
    this.numberLabel!.string = `${params.id + 1}`;
    this.numberLabel!.node.active = false;
  }

  /** 设置是否允许继续拖动，通关后用于锁定完整图片。 */
  public setInteractable(interactable: boolean): void {
    this._interactable = interactable;
    if (!interactable) {
      this.resetTouchState();
    }
  }

  /**
   * 拼图块销毁时只清理纯运行状态。
   *
   * Creator 销毁父节点前会先销毁子节点并清空序列化组件引用，因此这里不能再次
   * 执行会访问 Sprite、Label 或 Node 的 unuse；节点销毁流程会自动移除输入监听。
   */
  protected onDestroy(): void {
    this._interactable = false;
    this._inputEventsBound = false;
    this.resetTouchState();
    this._pieceId = -1;
    this._onDragStart = null;
    this._onDragMove = null;
    this._onDrop = null;
    super.onDestroy();
  }

  /** 幂等注册四类触摸事件，回收后再次取出时恢复输入能力。 */
  private bindInputEvents(): void {
    if (this._inputEventsBound) {
      return;
    }
    this._inputEventsBound = true;
    this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.on(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
  }

  /** 幂等注销全部触摸事件，避免空闲池节点继续持有面板输入引用。 */
  private unbindInputEvents(): void {
    if (!this._inputEventsBound) {
      return;
    }
    this._inputEventsBound = false;
    this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this);
    this.node.off(Node.EventType.TOUCH_MOVE, this.onTouchMove, this);
    this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this);
    this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchCancel, this);
  }

  /** 在对象池边界校验外部参数，禁止无依据断言后写入旧节点。 */
  private isPuzzlePieceParams(value: unknown): value is PuzzlePieceParams {
    if (!value || typeof value !== "object") {
      return false;
    }
    const params = value as Partial<PuzzlePieceParams>;
    const id = params.id;
    return (
      typeof id === "number" &&
      Number.isInteger(id) &&
      id >= 0 &&
      params.spriteFrame instanceof SpriteFrame &&
      typeof params.onDragStart === "function" &&
      typeof params.onDragMove === "function" &&
      typeof params.onDrop === "function"
    );
  }

  /** 记录唯一活动触摸及起点；此时尚不移动节点，等待超过拖拽阈值。 */
  private onTouchStart(event: EventTouch): void {
    if (!this._interactable || this._activeTouchId !== null) {
      return;
    }
    const position = this.getTouchPosition(event);
    this._activeTouchId = event.getID();
    this._dragStarted = false;
    this._touchStartPosition.set(position);
  }

  /** 超过启动距离后申请拖拽，并持续把同一触摸的稳定 UI 坐标交给面板。 */
  private onTouchMove(event: EventTouch): void {
    if (
      !this._interactable ||
      this._activeTouchId === null ||
      event.getID() !== this._activeTouchId
    ) {
      return;
    }

    const position = this.getTouchPosition(event);
    if (!this._dragStarted) {
      const totalDeltaX = position.x - this._touchStartPosition.x;
      const totalDeltaY = position.y - this._touchStartPosition.y;
      if (
        Math.hypot(totalDeltaX, totalDeltaY) <
        PuzzlePiece.DRAG_START_DISTANCE
      ) {
        return;
      }
      if (!this._onDragStart?.(this._pieceId, this._touchStartPosition)) {
        // 面板已被其他触摸占用时，本次触摸后续事件全部忽略。
        this.resetTouchState();
        return;
      }
      this._dragStarted = true;
    }

    this._onDragMove?.(this._pieceId, position);
  }

  /** 拖动结束后由面板选择最近目标格并交换格子内容。 */
  private onTouchEnd(event: EventTouch): void {
    this.finishTouch(event, false);
  }

  /** 触摸被系统中断时通知面板强制复位，不允许把当前位置当作有效落点。 */
  private onTouchCancel(event: EventTouch): void {
    this.finishTouch(event, true);
  }

  /** 结束当前唯一触摸，并区分正常松手和系统取消两条提交路径。 */
  private finishTouch(event: EventTouch, canceled: boolean): void {
    if (
      this._activeTouchId === null ||
      event.getID() !== this._activeTouchId
    ) {
      return;
    }
    if (this._dragStarted) {
      this._onDrop?.(this._pieceId, canceled);
    }
    this.resetTouchState();
  }

  /** 返回不受拼图临时父节点移动影响的稳定 UI 触摸坐标。 */
  private getTouchPosition(event: EventTouch): Vec3 {
    const location = event.getUILocation();
    return new Vec3(location.x, location.y, 0);
  }

  /** 清空本组件的触摸编号和阈值状态；允许在禁用、结束和销毁时重复调用。 */
  private resetTouchState(): void {
    this._activeTouchId = null;
    this._dragStarted = false;
    this._touchStartPosition.set(0, 0, 0);
  }
}
