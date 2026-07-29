import { _decorator, Color, Component, Graphics, Label } from "cc";
import type { PuzzleAvatarDefinition } from "../../game/profile/PuzzleAvatarCatalog";

const { ccclass, property } = _decorator;

/** 以纯图形方式展示头像，避免大厅入口依赖运行时纹理加载。 */
@ccclass("PuzzleAvatarRenderer")
export class PuzzleAvatarRenderer extends Component {
  /** 头像圆形底板和选中描边。 */
  @property({ type: Graphics })
  public graphics: Graphics | null = null;

  /** 头像中央符号。 */
  @property({ type: Label })
  public symbolLabel: Label | null = null;

  /** 校验 Prefab 中的显式绑定。 */
  protected onLoad(): void {
    if (!this.graphics || !this.symbolLabel) {
      throw new Error(
        `头像渲染器节点未绑定：${this.node.name}.graphics、symbolLabel`,
      );
    }
  }

  /** 按目录定义绘制头像，并可显示选中描边。 */
  public render(
    avatar: PuzzleAvatarDefinition,
    diameter: number,
    selected = false,
  ): void {
    if (!this.graphics || !this.symbolLabel) {
      throw new Error(`头像渲染器尚未完成绑定：${this.node.name}`);
    }
    const radius = diameter / 2;
    const [red, green, blue] = avatar.color;
    this.graphics.clear();
    this.graphics.fillColor = new Color(red, green, blue, 255);
    this.graphics.circle(0, 0, radius);
    this.graphics.fill();
    if (selected) {
      this.graphics.lineWidth = 5;
      this.graphics.strokeColor = new Color(255, 210, 92, 255);
      this.graphics.circle(0, 0, Math.max(1, radius - 3));
      this.graphics.stroke();
    }
    this.symbolLabel.string = avatar.symbol;
    this.symbolLabel.fontSize = Math.round(diameter * 0.45);
    this.symbolLabel.lineHeight = Math.round(diameter * 0.56);
  }
}
