import { _decorator, Button, Color, Graphics, Label } from "cc";
import { EventCenter } from "../../core/event/EventCenter";
import { UIBase } from "../../core/ui/UIBase";
import { GameEvent } from "../../game/GameEvent";

const { ccclass, property } = _decorator;

/** 关卡结算弹窗的展示模式。 */
export type UIResultMode = "success" | "failure";

/** 打开关卡结算弹窗时传入的结果参数。 */
export interface UIResultPanelOpenParams {
  /** 本次结算属于成功还是失败。 */
  mode: UIResultMode;

  /** 本次结算对应的关卡编号。 */
  level: number;

  /** 成功后已经解锁的下一关，最后一关或失败时为 null。 */
  nextLevel: number | null;

  /** 是否已经完成全部关卡。 */
  allCompleted: boolean;
}

/** 拼图关卡成功与失败共用的结算弹窗。 */
@ccclass("UIResultPanel")
export class UIResultPanel extends UIBase {
  /** 全屏半透明遮罩。 */
  @property({ type: Graphics })
  public overlayGraphics: Graphics | null = null;

  /** 弹窗主体背景。 */
  @property({ type: Graphics })
  public panelGraphics: Graphics | null = null;

  /** 结算标题。 */
  @property({ type: Label })
  public titleLabel: Label | null = null;

  /** 结算结果说明。 */
  @property({ type: Label })
  public messageLabel: Label | null = null;

  /** 根据结果执行重玩、下一关或完成操作的主按钮。 */
  @property({ type: Button })
  public primaryButton: Button | null = null;

  /** 主操作按钮背景。 */
  @property({ type: Graphics })
  public primaryButtonGraphics: Graphics | null = null;

  /** 主操作按钮文字。 */
  @property({ type: Label })
  public primaryButtonLabel: Label | null = null;

  /** 返回首页按钮。 */
  @property({ type: Button })
  public homeButton: Button | null = null;

  /** 返回首页按钮背景。 */
  @property({ type: Graphics })
  public homeButtonGraphics: Graphics | null = null;

  /** 是否已经注册按钮事件。 */
  private _eventsBound = false;

  /** 当前弹窗使用的结算参数。 */
  private _result: UIResultPanelOpenParams | null = null;

  /** 校验 Prefab 绑定、绘制固定背景并注册按钮。 */
  protected onLoad(): void {
    this.assertRequiredBindings({
      overlayGraphics: this.overlayGraphics,
      panelGraphics: this.panelGraphics,
      titleLabel: this.titleLabel,
      messageLabel: this.messageLabel,
      primaryButton: this.primaryButton,
      primaryButtonGraphics: this.primaryButtonGraphics,
      primaryButtonLabel: this.primaryButtonLabel,
      homeButton: this.homeButton,
      homeButtonGraphics: this.homeButtonGraphics,
    });
    this.drawView();
    this.bindEvents();
  }

  /** 打开弹窗时根据成功或失败结果刷新文案。 */
  protected onOpen(params?: unknown): void {
    super.onOpen(params);
    this._result = this.readOpenParams(params);
    this.refreshResultView(this._result);
    this.bindEvents();
  }

  /** 关闭弹窗时注销按钮事件。 */
  protected onClose(): void {
    this.unbindEvents();
    this._result = null;
    super.onClose();
  }

  /** 绘制遮罩、弹窗底板和两个按钮的固定外观。 */
  private drawView(): void {
    this.drawRoundedRect(
      this.overlayGraphics!,
      -320,
      -568,
      640,
      1136,
      0,
      new Color(16, 18, 22, 210),
    );
    this.drawRoundedRect(
      this.panelGraphics!,
      -250,
      -190,
      500,
      380,
      8,
      new Color(245, 247, 250, 255),
    );
    this.drawRoundedRect(
      this.primaryButtonGraphics!,
      -100,
      -34,
      200,
      68,
      8,
      new Color(45, 127, 249, 255),
    );
    this.drawRoundedRect(
      this.homeButtonGraphics!,
      -100,
      -34,
      200,
      68,
      8,
      new Color(91, 101, 116, 255),
    );
  }

  /** 使用指定 Graphics 绘制单色圆角矩形。 */
  private drawRoundedRect(
    graphics: Graphics,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    color: Color,
  ): void {
    graphics.clear();
    graphics.fillColor = color;
    graphics.roundRect(x, y, width, height, radius);
    graphics.fill();
  }

  /** 校验 UIManager 传入的结算参数。 */
  private readOpenParams(params: unknown): UIResultPanelOpenParams {
    if (
      !params ||
      typeof params !== "object" ||
      !("mode" in params) ||
      !("level" in params) ||
      !("nextLevel" in params) ||
      !("allCompleted" in params)
    ) {
      throw new Error("打开 UIResultPanel 时必须传入完整结算参数。");
    }
    const mode = params.mode;
    const level = params.level;
    const nextLevel = params.nextLevel;
    const allCompleted = params.allCompleted;
    if (
      (mode !== "success" && mode !== "failure") ||
      typeof level !== "number" ||
      !Number.isInteger(level) ||
      level <= 0 ||
      (nextLevel !== null &&
        (typeof nextLevel !== "number" ||
          !Number.isInteger(nextLevel) ||
          nextLevel <= 0)) ||
      typeof allCompleted !== "boolean" ||
      (mode === "failure" && (nextLevel !== null || allCompleted)) ||
      (mode === "success" && allCompleted !== (nextLevel === null))
    ) {
      throw new Error("UIResultPanel 收到的结算参数无效。");
    }
    return {
      mode,
      level,
      nextLevel,
      allCompleted,
    };
  }

  /** 根据结算模式设置标题、说明和主按钮操作文案。 */
  private refreshResultView(result: UIResultPanelOpenParams): void {
    if (result.mode === "failure") {
      this.titleLabel!.color = new Color(224, 70, 70, 255);
      this.titleLabel!.string = "挑战失败";
      this.messageLabel!.string = `第 ${result.level} 关时间已经用完`;
      this.primaryButtonLabel!.string = "重玩";
      return;
    }

    if (result.allCompleted || result.nextLevel === null) {
      this.titleLabel!.color = new Color(45, 127, 80, 255);
      this.titleLabel!.string = "全部通关";
      this.messageLabel!.string = "所有拼图关卡都已完成";
      this.primaryButtonLabel!.string = "返回首页";
      return;
    }

    this.titleLabel!.color = new Color(45, 127, 80, 255);
    this.titleLabel!.string = "挑战成功";
    this.messageLabel!.string = `第 ${result.nextLevel} 关已解锁`;
    this.primaryButtonLabel!.string = "下一关";
  }

  /** 注册主操作和返回首页按钮；重复调用不会重复绑定。 */
  private bindEvents(): void {
    if (this._eventsBound) {
      return;
    }
    this._eventsBound = true;
    this.primaryButton!.node.on(Button.EventType.CLICK, this.onPrimary, this);
    this.homeButton!.node.on(Button.EventType.CLICK, this.onHome, this);
  }

  /** 注销结算弹窗按钮事件；允许重复调用。 */
  private unbindEvents(): void {
    if (!this._eventsBound) {
      return;
    }
    this._eventsBound = false;
    this.primaryButton!.node.off(Button.EventType.CLICK, this.onPrimary, this);
    this.homeButton!.node.off(Button.EventType.CLICK, this.onHome, this);
  }

  /** 根据当前结算结果请求重玩、下一关或返回首页。 */
  private onPrimary = (): void => {
    if (!this._result) {
      return;
    }
    if (this._result.mode === "failure") {
      EventCenter.emit(GameEvent.PuzzleRestart);
      return;
    }
    if (this._result.nextLevel !== null) {
      EventCenter.emit(GameEvent.PuzzleNextLevel, this._result.nextLevel);
      return;
    }
    EventCenter.emit(GameEvent.BackToLobby);
  };

  /** 请求离开游戏并返回首页场景。 */
  private onHome = (): void => EventCenter.emit(GameEvent.BackToLobby);
}
