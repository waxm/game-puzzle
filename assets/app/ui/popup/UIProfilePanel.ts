import {
  _decorator,
  Button,
  Color,
  EditBox,
  Graphics,
  Label,
  Node,
} from "cc";
import { PoolManager } from "../../core/pool/PoolManager";
import { UIBase } from "../../core/ui/UIBase";
import { UIManager } from "../../core/ui/UIManager";
import { Logger } from "../../core/utils/Logger";
import {
  PuzzlePoolName,
  PuzzleResourcePath,
  PuzzleUIName,
} from "../../game/PuzzleGameKey";
import {
  PUZZLE_AVATAR_CATALOG,
  getPuzzleAvatar,
} from "../../game/profile/PuzzleAvatarCatalog";
import {
  PUZZLE_PROFILE_NAME_MAX_LENGTH,
  PuzzleProfileData,
  PuzzleProfileManager,
} from "../../game/profile/PuzzleProfileManager";
import { PuzzleSettingsManager } from "../../game/settings/PuzzleSettingsManager";
import { PuzzleAvatarRenderer } from "../common/PuzzleAvatarRenderer";
import {
  PuzzleAvatarItem,
  PuzzleAvatarItemData,
} from "../item/PuzzleAvatarItem";

const { ccclass, property } = _decorator;

/** 玩家名称与头像选择弹窗。 */
@ccclass("UIProfilePanel")
export class UIProfilePanel extends UIBase {
  /** 全屏半透明输入遮罩。 */
  @property({ type: Graphics })
  public overlayGraphics: Graphics | null = null;

  /** 资料弹窗底板。 */
  @property({ type: Graphics })
  public panelGraphics: Graphics | null = null;

  /** 关闭按钮。 */
  @property({ type: Button })
  public closeButton: Button | null = null;

  /** 关闭按钮图形。 */
  @property({ type: Graphics })
  public closeButtonGraphics: Graphics | null = null;

  /** 当前头像渲染器。 */
  @property({ type: PuzzleAvatarRenderer })
  public currentAvatarRenderer: PuzzleAvatarRenderer | null = null;

  /** 玩家名称输入框。 */
  @property({ type: EditBox })
  public nameEditBox: EditBox | null = null;

  /** 玩家名称输入框底板。 */
  @property({ type: Graphics })
  public nameInputGraphics: Graphics | null = null;

  /** 保存名称按钮。 */
  @property({ type: Button })
  public saveNameButton: Button | null = null;

  /** 保存名称按钮背景。 */
  @property({ type: Graphics })
  public saveNameGraphics: Graphics | null = null;

  /** 动态头像列表的显式父节点。 */
  @property({ type: Node })
  public avatarListContent: Node | null = null;

  /** 保存和加载反馈。 */
  @property({ type: Label })
  public feedbackLabel: Label | null = null;

  /** 当前借出的头像列表节点。 */
  private readonly _avatarItemNodes: Node[] = [];

  /** 是否已经注册固定按钮事件。 */
  private _eventsBound = false;

  /** 当前面板代次，用于丢弃关闭后的对象池异步结果。 */
  private _openGeneration = 0;

  /** 校验绑定、绘制固定外观并注册按钮。 */
  protected onLoad(): void {
    this.assertRequiredBindings({
      overlayGraphics: this.overlayGraphics,
      panelGraphics: this.panelGraphics,
      closeButton: this.closeButton,
      closeButtonGraphics: this.closeButtonGraphics,
      currentAvatarRenderer: this.currentAvatarRenderer,
      nameEditBox: this.nameEditBox,
      nameInputGraphics: this.nameInputGraphics,
      saveNameButton: this.saveNameButton,
      saveNameGraphics: this.saveNameGraphics,
      avatarListContent: this.avatarListContent,
      feedbackLabel: this.feedbackLabel,
    });
    this.nameEditBox!.maxLength = PUZZLE_PROFILE_NAME_MAX_LENGTH;
    this.drawStaticView();
    this.bindEvents();
  }

  /** 打开时加载当前资料，并异步准备可复用头像项。 */
  protected onOpen(params?: unknown): void {
    super.onOpen(params);
    const generation = ++this._openGeneration;
    this.feedbackLabel!.string = "";
    this.refreshProfile(PuzzleProfileManager.getProfile());
    this.bindEvents();
    void this.prepareAvatarList(generation);
  }

  /** 关闭时回收列表项、注销事件并使旧异步请求失效。 */
  protected onClose(): void {
    this._openGeneration += 1;
    this.unbindEvents();
    this.recycleAvatarItems();
    super.onClose();
  }

  /** 绘制遮罩、资料底板和操作按钮。 */
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
    this.drawRoundedRect(
      this.nameInputGraphics!,
      -150,
      -28,
      300,
      56,
      12,
      new Color(224, 230, 238, 255),
    );
    this.drawRoundedRect(
      this.saveNameGraphics!,
      -72,
      -28,
      144,
      56,
      14,
      new Color(45, 127, 249, 255),
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

  /** 刷新当前头像和名称输入框。 */
  private refreshProfile(profile: PuzzleProfileData): void {
    this.currentAvatarRenderer!.render(
      getPuzzleAvatar(profile.avatarId),
      112,
      false,
    );
    this.nameEditBox!.string = profile.name;
  }

  /** 创建头像对象池并渲染完整选择目录。 */
  private async prepareAvatarList(generation: number): Promise<void> {
    try {
      if (!PoolManager.has(PuzzlePoolName.AvatarItem)) {
        await PoolManager.create(PuzzlePoolName.AvatarItem, {
          prefabPath: PuzzleResourcePath.AvatarItemPrefab,
          initialSize: PUZZLE_AVATAR_CATALOG.length,
          maxSize: PUZZLE_AVATAR_CATALOG.length,
          lifecycleComponent: PuzzleAvatarItem,
        });
      }
      if (
        !this.isOpened ||
        generation !== this._openGeneration ||
        !this.node.isValid
      ) {
        return;
      }
      this.renderAvatarItems();
    } catch (error) {
      if (
        !this.isOpened ||
        generation !== this._openGeneration ||
        !this.node.isValid
      ) {
        return;
      }
      this.feedbackLabel!.string = "头像列表加载失败，请重新打开";
      Logger.error("头像列表对象池准备失败。", error);
    }
  }

  /** 从对象池取出头像项并加入显式列表容器。 */
  private renderAvatarItems(): void {
    this.recycleAvatarItems();
    const profile = PuzzleProfileManager.getProfile();
    PUZZLE_AVATAR_CATALOG.forEach((avatar, index) => {
      const data: PuzzleAvatarItemData = {
        avatar,
        selected: avatar.id === profile.avatarId,
        onSelect: this.onAvatarSelected,
      };
      const node = PoolManager.get(PuzzlePoolName.AvatarItem, data);
      if (!node) {
        throw new Error(`无法取得头像列表项：${avatar.id}`);
      }
      node.setParent(this.avatarListContent!);
      const column = index % 3;
      const row = Math.floor(index / 3);
      node.setPosition(-150 + column * 150, 85 - row * 170, 0);
      this._avatarItemNodes.push(node);
    });
  }

  /** 将本面板借出的全部头像项归还对象池。 */
  private recycleAvatarItems(): void {
    while (this._avatarItemNodes.length > 0) {
      const node = this._avatarItemNodes.pop()!;
      PoolManager.put(PuzzlePoolName.AvatarItem, node);
    }
  }

  /** 幂等注册关闭和保存名称按钮。 */
  private bindEvents(): void {
    if (this._eventsBound) {
      return;
    }
    this._eventsBound = true;
    this.closeButton!.node.on(Button.EventType.CLICK, this.onCloseClick, this);
    this.saveNameButton!.node.on(
      Button.EventType.CLICK,
      this.onSaveNameClick,
      this,
    );
  }

  /** 幂等注销关闭和保存名称按钮。 */
  private unbindEvents(): void {
    if (!this._eventsBound) {
      return;
    }
    this._eventsBound = false;
    this.closeButton!.node.off(Button.EventType.CLICK, this.onCloseClick, this);
    this.saveNameButton!.node.off(
      Button.EventType.CLICK,
      this.onSaveNameClick,
      this,
    );
  }

  /** 关闭当前资料弹窗。 */
  private onCloseClick(): void {
    UIManager.close(PuzzleUIName.Profile);
  }

  /** 校验并保存玩家名称。 */
  private onSaveNameClick(): void {
    try {
      const profile = PuzzleProfileManager.setName(this.nameEditBox!.string);
      this.refreshProfile(profile);
      this.feedbackLabel!.string = "名称已保存";
      PuzzleSettingsManager.vibrate();
    } catch (error) {
      this.feedbackLabel!.string = "请输入有效名称";
      Logger.warn("玩家名称保存失败。", error);
    }
  }

  /** 选择头像、持久化并刷新列表选中态。 */
  private onAvatarSelected = (avatarId: string): void => {
    try {
      const profile = PuzzleProfileManager.selectAvatar(avatarId);
      this.refreshProfile(profile);
      this.renderAvatarItems();
      this.feedbackLabel!.string = "头像已更新";
      PuzzleSettingsManager.vibrate();
    } catch (error) {
      this.feedbackLabel!.string = "头像选择失败";
      Logger.error(`头像选择失败：${avatarId}`, error);
    }
  };
}
