import { _decorator, Button, Color, Graphics, Label } from "cc";
import { UIBase } from "../../core/ui/UIBase";
import { UIManager } from "../../core/ui/UIManager";
import { Logger } from "../../core/utils/Logger";
import {
  PuzzleAppInfo,
  PuzzleUIName,
} from "../../game/PuzzleGameKey";
import {
  PuzzleSettingsExternalAction,
  PuzzleSettingsManager,
} from "../../game/settings/PuzzleSettingsManager";

const { ccclass, property } = _decorator;

/** 设置弹窗，管理声音、震动和预留的外部入口。 */
@ccclass("UISettingsPanel")
export class UISettingsPanel extends UIBase {
  /** 全屏半透明输入遮罩。 */
  @property({ type: Graphics })
  public overlayGraphics: Graphics | null = null;

  /** 设置弹窗底板。 */
  @property({ type: Graphics })
  public panelGraphics: Graphics | null = null;

  /** 关闭按钮。 */
  @property({ type: Button })
  public closeButton: Button | null = null;

  /** 关闭按钮图形。 */
  @property({ type: Graphics })
  public closeButtonGraphics: Graphics | null = null;

  /** 声音开关按钮。 */
  @property({ type: Button })
  public soundButton: Button | null = null;

  /** 声音开关轨道。 */
  @property({ type: Graphics })
  public soundGraphics: Graphics | null = null;

  /** 声音开关文字。 */
  @property({ type: Label })
  public soundValueLabel: Label | null = null;

  /** 震动开关按钮。 */
  @property({ type: Button })
  public vibrationButton: Button | null = null;

  /** 震动开关轨道。 */
  @property({ type: Graphics })
  public vibrationGraphics: Graphics | null = null;

  /** 震动开关文字。 */
  @property({ type: Label })
  public vibrationValueLabel: Label | null = null;

  /** 帮助中心入口。 */
  @property({ type: Button })
  public helpButton: Button | null = null;

  /** 帮助中心入口背景。 */
  @property({ type: Graphics })
  public helpGraphics: Graphics | null = null;

  /** 评分入口。 */
  @property({ type: Button })
  public ratingButton: Button | null = null;

  /** 评分入口背景。 */
  @property({ type: Graphics })
  public ratingGraphics: Graphics | null = null;

  /** 隐私政策入口。 */
  @property({ type: Button })
  public privacyButton: Button | null = null;

  /** 隐私政策入口背景。 */
  @property({ type: Graphics })
  public privacyGraphics: Graphics | null = null;

  /** 服务条款入口。 */
  @property({ type: Button })
  public termsButton: Button | null = null;

  /** 服务条款入口背景。 */
  @property({ type: Graphics })
  public termsGraphics: Graphics | null = null;

  /** 外部动作反馈文字。 */
  @property({ type: Label })
  public feedbackLabel: Label | null = null;

  /** 底部版本号。 */
  @property({ type: Label })
  public versionLabel: Label | null = null;

  /** 是否已经注册全部按钮。 */
  private _eventsBound = false;

  /** 外部动作请求编号，用于丢弃关闭后的旧异步结果。 */
  private _actionRequestId = 0;

  /** 校验绑定、绘制固定外观并注册事件。 */
  protected onLoad(): void {
    this.assertRequiredBindings({
      overlayGraphics: this.overlayGraphics,
      panelGraphics: this.panelGraphics,
      closeButton: this.closeButton,
      closeButtonGraphics: this.closeButtonGraphics,
      soundButton: this.soundButton,
      soundGraphics: this.soundGraphics,
      soundValueLabel: this.soundValueLabel,
      vibrationButton: this.vibrationButton,
      vibrationGraphics: this.vibrationGraphics,
      vibrationValueLabel: this.vibrationValueLabel,
      helpButton: this.helpButton,
      helpGraphics: this.helpGraphics,
      ratingButton: this.ratingButton,
      ratingGraphics: this.ratingGraphics,
      privacyButton: this.privacyButton,
      privacyGraphics: this.privacyGraphics,
      termsButton: this.termsButton,
      termsGraphics: this.termsGraphics,
      feedbackLabel: this.feedbackLabel,
      versionLabel: this.versionLabel,
    });
    this.drawStaticView();
    this.bindEvents();
  }

  /** 打开时刷新持久化设置和版本信息。 */
  protected onOpen(params?: unknown): void {
    super.onOpen(params);
    this._actionRequestId += 1;
    this.feedbackLabel!.string = "";
    this.versionLabel!.string = `版本 v${PuzzleAppInfo.Version}`;
    this.refreshToggles();
    this.bindEvents();
  }

  /** 关闭时注销事件并取消旧异步反馈。 */
  protected onClose(): void {
    this._actionRequestId += 1;
    this.unbindEvents();
    super.onClose();
  }

  /** 绘制弹窗、关闭按钮和外部动作入口。 */
  private drawStaticView(): void {
    this.drawRoundedRect(
      this.overlayGraphics!,
      -320,
      -568,
      640,
      1136,
      0,
      new Color(14, 18, 26, 215),
    );
    this.drawRoundedRect(
      this.panelGraphics!,
      -270,
      -455,
      540,
      910,
      26,
      new Color(245, 248, 252, 255),
    );
    this.drawRoundedRect(
      this.closeButtonGraphics!,
      -28,
      -28,
      56,
      56,
      28,
      new Color(224, 230, 238, 255),
    );
    for (const graphics of [
      this.helpGraphics!,
      this.ratingGraphics!,
      this.privacyGraphics!,
      this.termsGraphics!,
    ]) {
      this.drawRoundedRect(
        graphics,
        -220,
        -34,
        440,
        68,
        14,
        new Color(232, 238, 247, 255),
      );
    }
  }

  /** 根据当前设置绘制两个开关。 */
  private refreshToggles(): void {
    const settings = PuzzleSettingsManager.getSettings();
    this.drawToggle(
      this.soundGraphics!,
      this.soundValueLabel!,
      settings.soundEnabled,
    );
    this.drawToggle(
      this.vibrationGraphics!,
      this.vibrationValueLabel!,
      settings.vibrationEnabled,
    );
  }

  /** 绘制开关轨道和当前文字。 */
  private drawToggle(
    graphics: Graphics,
    label: Label,
    enabled: boolean,
  ): void {
    this.drawRoundedRect(
      graphics,
      -52,
      -26,
      104,
      52,
      26,
      enabled
        ? new Color(56, 172, 112, 255)
        : new Color(151, 160, 174, 255),
    );
    graphics.fillColor = new Color(255, 255, 255, 255);
    graphics.circle(enabled ? 26 : -26, 0, 20);
    graphics.fill();
    label.string = enabled ? "开" : "关";
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

  /** 幂等注册所有设置按钮。 */
  private bindEvents(): void {
    if (this._eventsBound) {
      return;
    }
    this._eventsBound = true;
    this.closeButton!.node.on(Button.EventType.CLICK, this.onCloseClick, this);
    this.soundButton!.node.on(Button.EventType.CLICK, this.onSoundClick, this);
    this.vibrationButton!.node.on(
      Button.EventType.CLICK,
      this.onVibrationClick,
      this,
    );
    this.helpButton!.node.on(Button.EventType.CLICK, this.onHelpClick, this);
    this.ratingButton!.node.on(
      Button.EventType.CLICK,
      this.onRatingClick,
      this,
    );
    this.privacyButton!.node.on(
      Button.EventType.CLICK,
      this.onPrivacyClick,
      this,
    );
    this.termsButton!.node.on(Button.EventType.CLICK, this.onTermsClick, this);
  }

  /** 幂等注销所有设置按钮。 */
  private unbindEvents(): void {
    if (!this._eventsBound) {
      return;
    }
    this._eventsBound = false;
    this.closeButton!.node.off(Button.EventType.CLICK, this.onCloseClick, this);
    this.soundButton!.node.off(Button.EventType.CLICK, this.onSoundClick, this);
    this.vibrationButton!.node.off(
      Button.EventType.CLICK,
      this.onVibrationClick,
      this,
    );
    this.helpButton!.node.off(Button.EventType.CLICK, this.onHelpClick, this);
    this.ratingButton!.node.off(
      Button.EventType.CLICK,
      this.onRatingClick,
      this,
    );
    this.privacyButton!.node.off(
      Button.EventType.CLICK,
      this.onPrivacyClick,
      this,
    );
    this.termsButton!.node.off(Button.EventType.CLICK, this.onTermsClick, this);
  }

  /** 关闭当前设置弹窗。 */
  private onCloseClick(): void {
    UIManager.close(PuzzleUIName.Settings);
  }

  /** 切换声音并立即同步到 AudioManager。 */
  private onSoundClick(): void {
    const settings = PuzzleSettingsManager.getSettings();
    PuzzleSettingsManager.setSoundEnabled(!settings.soundEnabled);
    this.refreshToggles();
  }

  /** 切换震动并在开启时请求一次预览反馈。 */
  private onVibrationClick(): void {
    const settings = PuzzleSettingsManager.getSettings();
    PuzzleSettingsManager.setVibrationEnabled(!settings.vibrationEnabled);
    this.refreshToggles();
  }

  /** 请求打开帮助中心。 */
  private onHelpClick(): void {
    void this.handleExternalAction("help", "帮助中心");
  }

  /** 请求打开评分页面。 */
  private onRatingClick(): void {
    void this.handleExternalAction("rating", "评分");
  }

  /** 请求打开隐私政策。 */
  private onPrivacyClick(): void {
    void this.handleExternalAction("privacy", "隐私政策");
  }

  /** 请求打开服务条款。 */
  private onTermsClick(): void {
    void this.handleExternalAction("terms", "服务条款");
  }

  /** 执行可注入外部动作，并为未接入状态提供明确反馈。 */
  private async handleExternalAction(
    action: PuzzleSettingsExternalAction,
    title: string,
  ): Promise<void> {
    const requestId = ++this._actionRequestId;
    this.feedbackLabel!.string = "正在打开…";
    try {
      const opened = await PuzzleSettingsManager.openExternalAction(action);
      if (!this.isOpened || requestId !== this._actionRequestId) {
        return;
      }
      this.feedbackLabel!.string = opened
        ? ""
        : `${title}接口已预留，等待后续接入`;
    } catch (error) {
      if (!this.isOpened || requestId !== this._actionRequestId) {
        return;
      }
      this.feedbackLabel!.string = `${title}暂时无法打开`;
      Logger.error(`设置外部动作执行失败：${action}`, error);
    }
  }
}
