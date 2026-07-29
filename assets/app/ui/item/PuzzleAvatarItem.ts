import { _decorator, Button, Component, Label } from "cc";
import type { PoolLifecycle } from "../../core/pool/PoolManager";
import type { PuzzleAvatarDefinition } from "../../game/profile/PuzzleAvatarCatalog";
import { PuzzleAvatarRenderer } from "../common/PuzzleAvatarRenderer";

const { ccclass, property } = _decorator;

/** 头像选择列表项取出对象池时接收的数据。 */
export interface PuzzleAvatarItemData {
  /** 当前头像定义。 */
  avatar: PuzzleAvatarDefinition;

  /** 是否为玩家当前头像。 */
  selected: boolean;

  /** 玩家点击头像后的回调。 */
  onSelect: (avatarId: string) => void;
}

/** 可复用的头像选择列表项。 */
@ccclass("PuzzleAvatarItem")
export class PuzzleAvatarItem extends Component implements PoolLifecycle {
  /** 列表项点击区域。 */
  @property({ type: Button })
  public selectButton: Button | null = null;

  /** 头像图形渲染器。 */
  @property({ type: PuzzleAvatarRenderer })
  public avatarRenderer: PuzzleAvatarRenderer | null = null;

  /** 头像可读名称。 */
  @property({ type: Label })
  public nameLabel: Label | null = null;

  /** 当前选中提示。 */
  @property({ type: Label })
  public selectedLabel: Label | null = null;

  /** 当前头像稳定编号。 */
  private _avatarId = "";

  /** 当前选择回调，回收时必须清空。 */
  private _onSelect: ((avatarId: string) => void) | null = null;

  /** 是否已经绑定按钮事件。 */
  private _eventsBound = false;

  /** 校验 Prefab 绑定。 */
  protected onLoad(): void {
    if (
      !this.selectButton ||
      !this.avatarRenderer ||
      !this.nameLabel ||
      !this.selectedLabel
    ) {
      throw new Error(`头像列表项 Prefab 节点未完整绑定：${this.node.name}`);
    }
  }

  /** 从对象池取出时恢复全部展示和输入状态。 */
  public reuse(...args: unknown[]): void {
    const data = this.readData(args[0]);
    this._avatarId = data.avatar.id;
    this._onSelect = data.onSelect;
    this.avatarRenderer!.render(data.avatar, 78, data.selected);
    this.nameLabel!.string = data.avatar.displayName;
    this.selectedLabel!.string = data.selected ? "当前" : "";
    this.bindEvents();
  }

  /** 回收到对象池前注销事件并清空旧业务数据。 */
  public unuse(): void {
    this.unbindEvents();
    this._avatarId = "";
    this._onSelect = null;
    if (this.nameLabel) {
      this.nameLabel.string = "";
    }
    if (this.selectedLabel) {
      this.selectedLabel.string = "";
    }
  }

  /** 校验对象池传入的头像数据。 */
  private readData(value: unknown): PuzzleAvatarItemData {
    if (
      !value ||
      typeof value !== "object" ||
      !("avatar" in value) ||
      !("selected" in value) ||
      !("onSelect" in value) ||
      typeof value.selected !== "boolean" ||
      typeof value.onSelect !== "function"
    ) {
      throw new Error("头像列表项收到的复用参数无效。");
    }
    const avatar = value.avatar;
    if (
      !avatar ||
      typeof avatar !== "object" ||
      !("id" in avatar) ||
      typeof avatar.id !== "string"
    ) {
      throw new Error("头像列表项缺少有效头像定义。");
    }
    return value as PuzzleAvatarItemData;
  }

  /** 幂等注册选择事件。 */
  private bindEvents(): void {
    if (this._eventsBound) {
      return;
    }
    this._eventsBound = true;
    this.selectButton!.node.on(
      Button.EventType.CLICK,
      this.onClickSelect,
      this,
    );
  }

  /** 幂等注销选择事件。 */
  private unbindEvents(): void {
    if (!this._eventsBound || !this.selectButton) {
      return;
    }
    this._eventsBound = false;
    this.selectButton.node.off(
      Button.EventType.CLICK,
      this.onClickSelect,
      this,
    );
  }

  /** 把当前头像编号转发给资料面板。 */
  private onClickSelect(): void {
    if (this._avatarId.length > 0) {
      this._onSelect?.(this._avatarId);
    }
  }
}
