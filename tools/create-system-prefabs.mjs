#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** 项目根目录。 */
const projectRoot = path.resolve(import.meta.dirname, "..");

/** Creator 编辑器实际脚本编译产物。 */
const creatorChunkDirectory = path.join(
  projectRoot,
  "temp/programming/packer-driver/targets/editor/chunks",
);

/** Cocos UI 默认渲染层。 */
const uiLayer = 33554432;

/** EditBox 宿主节点不能共存的 UI 渲染组件。 */
const editBoxConflictingRendererTypes = new Set([
  "cc.Graphics",
  "cc.Label",
  "cc.Mask",
  "cc.ParticleSystem2D",
  "cc.RichText",
  "cc.TiledMap",
  "cc.UIMeshRenderer",
]);

/** Prefab 输出目录。 */
const directories = {
  home: path.join(projectRoot, "assets/resources/prefabs/home"),
  popup: path.join(projectRoot, "assets/resources/prefabs/popup"),
  item: path.join(projectRoot, "assets/resources/prefabs/item"),
};

/** 已准备的 Prefab meta。 */
const preparedMetas = new Map();

/** Creator 实际注册的业务脚本类型。 */
const scriptTypes = {};

/** 已由 Creator 导入的首页和通用 UI SpriteFrame。 */
const spriteFrames = {};

/** 命令行指定的生成目标；未指定时保持原有全量生成行为。 */
const selectedTargets = new Set(process.argv.slice(2));

/** 生成大厅入口、设置、玩家资料和头像项 Prefab。 */
function main() {
  ensureDirectory(directories.home);
  ensureDirectory(directories.popup);
  ensureDirectory(directories.item);

  Object.assign(scriptTypes, {
    UIHomePanel: resolveCreatorScriptType(
      "UIHomePanel",
      "assets/app/ui/home/UIHomePanel.ts.meta",
    ),
    UISettingsPanel: resolveCreatorScriptType(
      "UISettingsPanel",
      "assets/app/ui/popup/UISettingsPanel.ts.meta",
    ),
    UIProfilePanel: resolveCreatorScriptType(
      "UIProfilePanel",
      "assets/app/ui/popup/UIProfilePanel.ts.meta",
    ),
    PuzzleAvatarItem: resolveCreatorScriptType(
      "PuzzleAvatarItem",
      "assets/app/ui/item/PuzzleAvatarItem.ts.meta",
    ),
    PuzzleAvatarRenderer: resolveCreatorScriptType(
      "PuzzleAvatarRenderer",
      "assets/app/ui/common/PuzzleAvatarRenderer.ts.meta",
    ),
  });
  Object.assign(spriteFrames, {
    warmPrimaryButton: resolveSpriteFrameUuid(
      "assets/resources/textures/common/kenney-ui/warm_primary_button.png.meta",
    ),
    playIcon: resolveSpriteFrameUuid(
      "assets/resources/textures/common/kenney-ui/play_icon.png.meta",
    ),
    albumPanelOne: resolveSpriteFrameUuid(
      "assets/resources/textures/game/levels/level_001/level_001_source.png.meta",
    ),
    albumPanelTwo: resolveSpriteFrameUuid(
      "assets/resources/textures/game/levels/level_002/level_002_source.png.meta",
    ),
    albumPanelThree: resolveSpriteFrameUuid(
      "assets/resources/textures/game/levels/level_003/level_003_source.png.meta",
    ),
    albumPanelFour: resolveSpriteFrameUuid(
      "assets/resources/textures/game/levels/level_004/level_004_source.png.meta",
    ),
    albumPanelFive: resolveSpriteFrameUuid(
      "assets/resources/textures/game/levels/level_005/level_005_source.png.meta",
    ),
  });

  if (shouldGenerate("home")) {
    preparePrefabMeta("UIHomePanel", directories.home);
    writePrefab("UIHomePanel", directories.home, createHomePrefab());
  }
  if (shouldGenerate("settings")) {
    preparePrefabMeta("UISettingsPanel", directories.popup);
    writePrefab(
      "UISettingsPanel",
      directories.popup,
      createSettingsPrefab(),
    );
  }
  if (shouldGenerate("profile")) {
    preparePrefabMeta("UIProfilePanel", directories.popup);
    writePrefab("UIProfilePanel", directories.popup, createProfilePrefab());
  }
  if (shouldGenerate("avatar-item")) {
    preparePrefabMeta("PuzzleAvatarItem", directories.item);
    writePrefab("PuzzleAvatarItem", directories.item, createAvatarItemPrefab());
  }
  console.log(
    `大厅系统 Prefab 已生成并完成结构校验：${[
      "home",
      "settings",
      "profile",
      "avatar-item",
    ]
      .filter(shouldGenerate)
      .join("、")}`,
  );
}

/** 判断本次是否需要生成指定 Prefab 目标。 */
function shouldGenerate(target) {
  return selectedTargets.size === 0 || selectedTargets.has(target);
}

/** 创建包含第一卷画册、头像和设置入口的首页 Prefab。 */
function createHomePrefab() {
  const objects = [createPrefabAsset("UIHomePanel")];
  const rootId = addNode(objects, "UIHomePanel", null, 0, 0, 640, 1136);
  addWidget(objects, rootId);
  const backgroundGraphicsId = addGraphics(objects, rootId);
  const heroCardId = addNode(
    objects,
    "HeroCard",
    rootId,
    0,
    -25,
    564,
    660,
  );
  const heroCardGraphicsId = addGraphics(objects, heroCardId);
  const titleLabelId = addTextNode(
    objects,
    rootId,
    "TitleLabel",
    "千年拾光",
    0,
    405,
    480,
    72,
    50,
    color(88, 61, 42),
  );
  addTextNode(
    objects,
    rootId,
    "SubtitleLabel",
    "每一片，都是一段时光",
    0,
    345,
    470,
    48,
    24,
    color(128, 98, 72),
  );
  const albumEraLabelId = addTextNode(
    objects,
    heroCardId,
    "AlbumEraLabel",
    "第一卷 · 宋韵人间",
    0,
    270,
    420,
    44,
    23,
    color(164, 101, 52),
  );
  const albumTitleLabelId = addTextNode(
    objects,
    heroCardId,
    "AlbumTitleLabel",
    "《汴京一日》",
    0,
    220,
    450,
    62,
    38,
    color(72, 57, 45),
  );
  const albumSubtitleLabelId = addTextNode(
    objects,
    heroCardId,
    "AlbumSubtitleLabel",
    "循着一日光影，拼回汴京人间",
    0,
    172,
    470,
    42,
    20,
    color(126, 105, 80),
  );

  const albumPanelNames = [
    "城门晨曦",
    "街巷早市",
    "茶坊雅集",
    "河畔舟行",
    "上元灯夜",
  ];
  const albumPanelSpriteFrames = [
    spriteFrames.albumPanelOne,
    spriteFrames.albumPanelTwo,
    spriteFrames.albumPanelThree,
    spriteFrames.albumPanelFour,
    spriteFrames.albumPanelFive,
  ];
  const albumPanelSpriteIds = albumPanelSpriteFrames.map(
    (spriteFrameUuid, index) => {
      const x = -200 + index * 100;
      const panel = addSpriteNode(
        objects,
        heroCardId,
        `AlbumPanel${index + 1}`,
        x,
        70,
        88,
        88,
        spriteFrameUuid,
      );
      addTextNode(
        objects,
        heroCardId,
        `AlbumPanel${index + 1}Label`,
        albumPanelNames[index],
        x,
        5,
        94,
        34,
        17,
        color(104, 82, 60),
      );
      return panel.spriteId;
    },
  );
  const albumProgressNodeId = addNode(
    objects,
    "AlbumProgressOverlay",
    heroCardId,
    0,
    70,
    500,
    100,
  );
  const albumProgressGraphicsId = addGraphics(
    objects,
    albumProgressNodeId,
  );
  const tipLabelId = addTextNode(
    objects,
    heroCardId,
    "TipLabel",
    "已点亮 0 / 5 · 再通 5 关展开长卷",
    0,
    -65,
    480,
    50,
    21,
    color(91, 126, 99),
  );
  const start = addSpriteButton(
    objects,
    heroCardId,
    "StartButton",
    "继续修复 · 第 1 关",
    0,
    -180,
    360,
    108,
    color(91, 62, 36),
    spriteFrames.warmPrimaryButton,
    spriteFrames.playIcon,
  );
  addTextNode(
    objects,
    heroCardId,
    "NextAlbumLabel",
    "下一卷 · 静候开启",
    0,
    -270,
    420,
    40,
    19,
    color(150, 127, 99),
  );

  const profileNodeId = addNode(
    objects,
    "ProfileButton",
    rootId,
    -205,
    460,
    210,
    90,
  );
  const profileButtonGraphicsId = addGraphics(objects, profileNodeId);
  const profileButtonId = addButton(objects, profileNodeId);
  const avatar = addAvatarRenderer(
    objects,
    profileNodeId,
    "ProfileAvatar",
    -64,
    0,
    72,
    "光",
  );
  const profileNameLabelId = addTextNode(
    objects,
    profileNodeId,
    "ProfileNameLabel",
    "拼图玩家",
    40,
    0,
    130,
    46,
    23,
    color(103, 75, 49),
  );

  const settings = addTextButton(
    objects,
    rootId,
    "SettingsButton",
    "设",
    250,
    460,
    82,
    82,
    color(255, 245, 220),
    true,
  );
  const scriptId = addBusinessScript(
    objects,
    rootId,
    scriptTypes.UIHomePanel,
    {
      backgroundGraphics: ref(backgroundGraphicsId),
      heroCardGraphics: ref(heroCardGraphicsId),
      albumProgressGraphics: ref(albumProgressGraphicsId),
      titleLabel: ref(titleLabelId),
      albumEraLabel: ref(albumEraLabelId),
      albumTitleLabel: ref(albumTitleLabelId),
      albumSubtitleLabel: ref(albumSubtitleLabelId),
      albumPanelOneSprite: ref(albumPanelSpriteIds[0]),
      albumPanelTwoSprite: ref(albumPanelSpriteIds[1]),
      albumPanelThreeSprite: ref(albumPanelSpriteIds[2]),
      albumPanelFourSprite: ref(albumPanelSpriteIds[3]),
      albumPanelFiveSprite: ref(albumPanelSpriteIds[4]),
      startButton: ref(start.buttonId),
      startButtonLabel: ref(start.labelId),
      tipLabel: ref(tipLabelId),
      profileButton: ref(profileButtonId),
      profileButtonGraphics: ref(profileButtonGraphicsId),
      profileAvatarRenderer: ref(avatar.rendererId),
      profileNameLabel: ref(profileNameLabelId),
      settingsButton: ref(settings.buttonId),
      settingsButtonGraphics: ref(settings.graphicsId),
    },
  );
  validateBindings(objects, scriptId, {
    backgroundGraphics: "cc.Graphics",
    heroCardGraphics: "cc.Graphics",
    albumProgressGraphics: "cc.Graphics",
    titleLabel: "cc.Label",
    albumEraLabel: "cc.Label",
    albumTitleLabel: "cc.Label",
    albumSubtitleLabel: "cc.Label",
    albumPanelOneSprite: "cc.Sprite",
    albumPanelTwoSprite: "cc.Sprite",
    albumPanelThreeSprite: "cc.Sprite",
    albumPanelFourSprite: "cc.Sprite",
    albumPanelFiveSprite: "cc.Sprite",
    startButton: "cc.Button",
    startButtonLabel: "cc.Label",
    tipLabel: "cc.Label",
    profileButton: "cc.Button",
    profileButtonGraphics: "cc.Graphics",
    profileAvatarRenderer: scriptTypes.PuzzleAvatarRenderer,
    profileNameLabel: "cc.Label",
    settingsButton: "cc.Button",
    settingsButtonGraphics: "cc.Graphics",
  });
  attachPrefabInfos(objects);
  return objects;
}

/** 创建设置弹窗 Prefab。 */
function createSettingsPrefab() {
  const objects = [createPrefabAsset("UISettingsPanel")];
  const rootId = addNode(objects, "UISettingsPanel", null, 0, 0, 640, 1136);
  const overlayGraphicsId = addGraphics(objects, rootId);
  addBlockInputEvents(objects, rootId);
  const panelId = addNode(objects, "Panel", rootId, 0, 0, 540, 910);
  const panelGraphicsId = addGraphics(objects, panelId);
  addTextNode(
    objects,
    panelId,
    "TitleLabel",
    "设置",
    0,
    390,
    300,
    64,
    40,
    color(96, 68, 45),
  );
  addTextNode(
    objects,
    panelId,
    "SubtitleLabel",
    "留一点安静给自己",
    0,
    338,
    320,
    42,
    21,
    color(153, 124, 91),
  );
  const close = addTextButton(
    objects,
    panelId,
    "CloseButton",
    "×",
    220,
    390,
    58,
    58,
    color(108, 75, 45),
    true,
  );
  addTextNode(
    objects,
    panelId,
    "SoundTitle",
    "声音",
    -150,
    246,
    150,
    54,
    30,
    color(101, 73, 48),
  );
  const sound = addTextButton(
    objects,
    panelId,
    "SoundButton",
    "开",
    170,
    246,
    110,
    56,
    color(104, 72, 40),
    true,
  );
  addTextNode(
    objects,
    panelId,
    "VibrationTitle",
    "震动",
    -150,
    151,
    150,
    54,
    30,
    color(101, 73, 48),
  );
  const vibration = addTextButton(
    objects,
    panelId,
    "VibrationButton",
    "开",
    170,
    151,
    110,
    56,
    color(104, 72, 40),
    true,
  );
  addTextNode(
    objects,
    panelId,
    "MoreTitle",
    "更多",
    -190,
    72,
    100,
    45,
    24,
    color(159, 126, 89),
  );
  const help = addActionRow(objects, panelId, "HelpButton", "帮助中心", 5);
  const rating = addActionRow(objects, panelId, "RatingButton", "为游戏评分", -78);
  const privacy = addActionRow(objects, panelId, "PrivacyButton", "隐私政策", -161);
  const terms = addActionRow(objects, panelId, "TermsButton", "服务条款", -244);
  const feedbackLabelId = addTextNode(
    objects,
    panelId,
    "FeedbackLabel",
    "",
    0,
    -340,
    460,
    46,
    21,
    color(157, 102, 72),
  );
  const versionLabelId = addTextNode(
    objects,
    panelId,
    "VersionLabel",
    "版本 v1.0.0",
    0,
    -408,
    360,
    40,
    20,
    color(160, 140, 116),
  );
  const scriptId = addBusinessScript(
    objects,
    rootId,
    scriptTypes.UISettingsPanel,
    {
      overlayGraphics: ref(overlayGraphicsId),
      panelGraphics: ref(panelGraphicsId),
      closeButton: ref(close.buttonId),
      closeButtonGraphics: ref(close.graphicsId),
      soundButton: ref(sound.buttonId),
      soundGraphics: ref(sound.graphicsId),
      soundValueLabel: ref(sound.labelId),
      vibrationButton: ref(vibration.buttonId),
      vibrationGraphics: ref(vibration.graphicsId),
      vibrationValueLabel: ref(vibration.labelId),
      helpButton: ref(help.buttonId),
      helpGraphics: ref(help.graphicsId),
      ratingButton: ref(rating.buttonId),
      ratingGraphics: ref(rating.graphicsId),
      privacyButton: ref(privacy.buttonId),
      privacyGraphics: ref(privacy.graphicsId),
      termsButton: ref(terms.buttonId),
      termsGraphics: ref(terms.graphicsId),
      feedbackLabel: ref(feedbackLabelId),
      versionLabel: ref(versionLabelId),
    },
  );
  validateBindings(objects, scriptId, {
    overlayGraphics: "cc.Graphics",
    panelGraphics: "cc.Graphics",
    closeButton: "cc.Button",
    closeButtonGraphics: "cc.Graphics",
    soundButton: "cc.Button",
    soundGraphics: "cc.Graphics",
    soundValueLabel: "cc.Label",
    vibrationButton: "cc.Button",
    vibrationGraphics: "cc.Graphics",
    vibrationValueLabel: "cc.Label",
    helpButton: "cc.Button",
    helpGraphics: "cc.Graphics",
    ratingButton: "cc.Button",
    ratingGraphics: "cc.Graphics",
    privacyButton: "cc.Button",
    privacyGraphics: "cc.Graphics",
    termsButton: "cc.Button",
    termsGraphics: "cc.Graphics",
    feedbackLabel: "cc.Label",
    versionLabel: "cc.Label",
  });
  attachPrefabInfos(objects);
  return objects;
}

/** 创建玩家资料弹窗 Prefab。 */
function createProfilePrefab() {
  const objects = [createPrefabAsset("UIProfilePanel")];
  const rootId = addNode(objects, "UIProfilePanel", null, 0, 0, 640, 1136);
  const overlayGraphicsId = addGraphics(objects, rootId);
  addBlockInputEvents(objects, rootId);
  const panelId = addNode(objects, "Panel", rootId, 0, 0, 540, 910);
  const panelGraphicsId = addGraphics(objects, panelId);
  addTextNode(
    objects,
    panelId,
    "TitleLabel",
    "玩家资料",
    0,
    390,
    320,
    64,
    40,
    color(39, 48, 64),
  );
  const close = addTextButton(
    objects,
    panelId,
    "CloseButton",
    "×",
    220,
    390,
    58,
    58,
    color(73, 83, 99),
    true,
  );
  const currentAvatar = addAvatarRenderer(
    objects,
    panelId,
    "CurrentAvatar",
    0,
    275,
    112,
    "光",
  );
  addTextNode(
    objects,
    panelId,
    "NameTitle",
    "玩家名称",
    -175,
    175,
    160,
    50,
    24,
    color(69, 79, 95),
  );
  const nameInput = addEditBox(
    objects,
    panelId,
    "NameEditBox",
    "拼图玩家",
    -35,
    112,
    300,
    56,
  );
  const saveName = addTextButton(
    objects,
    panelId,
    "SaveNameButton",
    "保存",
    195,
    112,
    144,
    56,
    color(255, 255, 255),
    true,
  );
  addTextNode(
    objects,
    panelId,
    "AvatarListTitle",
    "选择头像",
    -175,
    42,
    180,
    48,
    26,
    color(69, 79, 95),
  );
  const avatarListContentId = addNode(
    objects,
    "AvatarListContent",
    panelId,
    0,
    -145,
    500,
    330,
  );
  const feedbackLabelId = addTextNode(
    objects,
    panelId,
    "FeedbackLabel",
    "",
    0,
    -405,
    460,
    42,
    21,
    color(77, 126, 94),
  );
  const scriptId = addBusinessScript(
    objects,
    rootId,
    scriptTypes.UIProfilePanel,
    {
      overlayGraphics: ref(overlayGraphicsId),
      panelGraphics: ref(panelGraphicsId),
      closeButton: ref(close.buttonId),
      closeButtonGraphics: ref(close.graphicsId),
      currentAvatarRenderer: ref(currentAvatar.rendererId),
      nameEditBox: ref(nameInput.editBoxId),
      nameInputGraphics: ref(nameInput.graphicsId),
      saveNameButton: ref(saveName.buttonId),
      saveNameGraphics: ref(saveName.graphicsId),
      avatarListContent: ref(avatarListContentId),
      feedbackLabel: ref(feedbackLabelId),
    },
  );
  validateBindings(objects, scriptId, {
    overlayGraphics: "cc.Graphics",
    panelGraphics: "cc.Graphics",
    closeButton: "cc.Button",
    closeButtonGraphics: "cc.Graphics",
    currentAvatarRenderer: scriptTypes.PuzzleAvatarRenderer,
    nameEditBox: "cc.EditBox",
    nameInputGraphics: "cc.Graphics",
    saveNameButton: "cc.Button",
    saveNameGraphics: "cc.Graphics",
    avatarListContent: "cc.Node",
    feedbackLabel: "cc.Label",
  });
  attachPrefabInfos(objects);
  return objects;
}

/** 创建对象池复用的头像列表项 Prefab。 */
function createAvatarItemPrefab() {
  const objects = [createPrefabAsset("PuzzleAvatarItem")];
  const rootId = addNode(objects, "PuzzleAvatarItem", null, 0, 0, 140, 145);
  const buttonId = addButton(objects, rootId);
  const avatar = addAvatarRenderer(
    objects,
    rootId,
    "Avatar",
    0,
    22,
    78,
    "光",
  );
  const nameLabelId = addTextNode(
    objects,
    rootId,
    "NameLabel",
    "晨光",
    0,
    -38,
    130,
    34,
    22,
    color(53, 64, 81),
  );
  const selectedLabelId = addTextNode(
    objects,
    rootId,
    "SelectedLabel",
    "当前",
    0,
    -66,
    120,
    28,
    18,
    color(207, 139, 35),
  );
  const scriptId = addBusinessScript(
    objects,
    rootId,
    scriptTypes.PuzzleAvatarItem,
    {
      selectButton: ref(buttonId),
      avatarRenderer: ref(avatar.rendererId),
      nameLabel: ref(nameLabelId),
      selectedLabel: ref(selectedLabelId),
    },
  );
  validateBindings(objects, scriptId, {
    selectButton: "cc.Button",
    avatarRenderer: scriptTypes.PuzzleAvatarRenderer,
    nameLabel: "cc.Label",
    selectedLabel: "cc.Label",
  });
  attachPrefabInfos(objects);
  return objects;
}

/** 添加设置页标准动作行。 */
function addActionRow(objects, parentId, name, text, y) {
  return addTextButton(
    objects,
    parentId,
    name,
    `${text}    ›`,
    0,
    y,
    440,
    68,
    color(105, 76, 50),
    true,
  );
}

/** 添加图形头像节点及其显式渲染器绑定。 */
function addAvatarRenderer(
  objects,
  parentId,
  name,
  x,
  y,
  diameter,
  symbol,
) {
  const nodeId = addNode(
    objects,
    name,
    parentId,
    x,
    y,
    diameter,
    diameter,
  );
  const graphicsId = addGraphics(objects, nodeId);
  const symbolLabelId = addTextNode(
    objects,
    nodeId,
    "SymbolLabel",
    symbol,
    0,
    0,
    diameter,
    diameter,
    Math.round(diameter * 0.45),
    color(255, 255, 255),
  );
  const rendererId = addBusinessScript(
    objects,
    nodeId,
    scriptTypes.PuzzleAvatarRenderer,
    {
      graphics: ref(graphicsId),
      symbolLabel: ref(symbolLabelId),
    },
  );
  return { nodeId, rendererId, graphicsId, symbolLabelId };
}

/** 添加使用已导入 SpriteFrame 的主操作按钮。 */
function addSpriteButton(
  objects,
  parentId,
  name,
  text,
  x,
  y,
  width,
  height,
  labelColor,
  backgroundSpriteFrameUuid,
  iconSpriteFrameUuid,
) {
  const nodeId = addNode(objects, name, parentId, x, y, width, height);
  const buttonId = addButton(objects, nodeId);
  addSpriteNode(
    objects,
    nodeId,
    `${name}Background`,
    0,
    0,
    width,
    height,
    backgroundSpriteFrameUuid,
  );
  addSpriteNode(
    objects,
    nodeId,
    `${name}Icon`,
    -112,
    0,
    34,
    38,
    iconSpriteFrameUuid,
    color(91, 62, 36),
  );
  const labelId = addTextNode(
    objects,
    nodeId,
    `${name}Label`,
    text,
    18,
    2,
    width - 82,
    height - 24,
    30,
    labelColor,
  );
  return { nodeId, buttonId, labelId };
}

/** 添加指定 SpriteFrame 的纯展示图片节点。 */
function addSpriteNode(
  objects,
  parentId,
  name,
  x,
  y,
  width,
  height,
  spriteFrameUuid,
  tint = color(255, 255, 255),
) {
  const nodeId = addNode(objects, name, parentId, x, y, width, height);
  const spriteId = addSprite(objects, nodeId, spriteFrameUuid, tint);
  return { nodeId, spriteId };
}

/** 添加带 Graphics 和文字的按钮。 */
function addTextButton(
  objects,
  parentId,
  name,
  text,
  x,
  y,
  width,
  height,
  labelColor,
  withGraphics,
) {
  const nodeId = addNode(objects, name, parentId, x, y, width, height);
  const graphicsId = withGraphics ? addGraphics(objects, nodeId) : null;
  const buttonId = addButton(objects, nodeId);
  const labelId = addTextNode(
    objects,
    nodeId,
    `${name}Label`,
    text,
    0,
    0,
    width - 12,
    height - 8,
    Math.min(28, Math.round(height * 0.44)),
    labelColor,
  );
  return { nodeId, graphicsId, buttonId, labelId };
}

/** 添加带文字和占位符 Label 的输入框。 */
function addEditBox(objects, parentId, name, text, x, y, width, height) {
  const nodeId = addNode(objects, name, parentId, x, y, width, height);
  // EditBox 在启用时会给宿主节点补充 Sprite，不能与 Graphics 同节点共存。
  // 单独使用子节点绘制底板，既保留程序化外观，也避免 Creator 反序列化时报渲染组件冲突。
  const backgroundNodeId = addNode(
    objects,
    `${name}Background`,
    nodeId,
    0,
    0,
    width,
    height,
  );
  const graphicsId = addGraphics(objects, backgroundNodeId);
  const textLabelId = addTextNode(
    objects,
    nodeId,
    "TextLabel",
    text,
    0,
    0,
    width - 28,
    height - 8,
    24,
    color(55, 65, 82),
  );
  const placeholderLabelId = addTextNode(
    objects,
    nodeId,
    "PlaceholderLabel",
    "请输入名称",
    0,
    0,
    width - 28,
    height - 8,
    24,
    color(145, 154, 168),
  );
  objects[objects[placeholderLabelId].node.__id__]._active = false;
  const editBoxId = addObject(objects, {
    __type__: "cc.EditBox",
    _name: "",
    _objFlags: 0,
    node: ref(nodeId),
    _enabled: true,
    _textLabel: ref(textLabelId),
    _placeholderLabel: ref(placeholderLabelId),
    _returnType: 0,
    _string: text,
    _tabIndex: 0,
    _backgroundImage: null,
    _inputFlag: 5,
    _inputMode: 6,
    _maxLength: 12,
    editingDidBegan: [],
    textChanged: [],
    editingDidEnded: [],
    editingReturn: [],
    _id: "",
  });
  objects[nodeId]._components.push(ref(editBoxId));
  addSprite(objects, nodeId);
  return { nodeId, graphicsId, editBoxId };
}

/** 添加文本节点并返回 Label 组件编号。 */
function addTextNode(
  objects,
  parentId,
  name,
  text,
  x,
  y,
  width,
  height,
  fontSize,
  labelColor,
) {
  const nodeId = addNode(objects, name, parentId, x, y, width, height);
  return addLabel(objects, nodeId, text, fontSize, labelColor);
}

/** 添加节点及 UITransform。 */
function addNode(objects, name, parentId, x, y, width, height) {
  const nodeId = addObject(objects, {
    __type__: "cc.Node",
    _name: name,
    _objFlags: 0,
    _parent: parentId === null ? null : ref(parentId),
    _children: [],
    _active: true,
    _components: [],
    _prefab: null,
    _lpos: vec3(x, y, 0),
    _lrot: { __type__: "cc.Quat", x: 0, y: 0, z: 0, w: 1 },
    _lscale: vec3(1, 1, 1),
    _layer: uiLayer,
    _euler: vec3(0, 0, 0),
    _id: "",
  });
  if (parentId !== null) {
    objects[parentId]._children.push(ref(nodeId));
  }
  const transformId = addObject(objects, {
    __type__: "cc.UITransform",
    _name: "",
    _objFlags: 0,
    node: ref(nodeId),
    _enabled: true,
    _contentSize: { __type__: "cc.Size", width, height },
    _anchorPoint: { __type__: "cc.Vec2", x: 0.5, y: 0.5 },
    _id: "",
  });
  objects[nodeId]._components.push(ref(transformId));
  return nodeId;
}

/** 添加 Label 组件。 */
function addLabel(objects, nodeId, text, fontSize, labelColor) {
  const id = addObject(objects, {
    __type__: "cc.Label",
    _name: "",
    _objFlags: 0,
    node: ref(nodeId),
    _enabled: true,
    _color: labelColor,
    _string: text,
    _horizontalAlign: 1,
    _verticalAlign: 1,
    _actualFontSize: fontSize,
    _fontSize: fontSize,
    _fontFamily: "Arial",
    _lineHeight: fontSize + 8,
    _overflow: 1,
    _enableWrapText: false,
    _font: null,
    _isSystemFontUsed: true,
    _id: "",
  });
  objects[nodeId]._components.push(ref(id));
  return id;
}

/** 添加 Graphics 组件。 */
function addGraphics(objects, nodeId) {
  const id = addObject(objects, {
    __type__: "cc.Graphics",
    _name: "",
    _objFlags: 0,
    node: ref(nodeId),
    _enabled: true,
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: color(255, 255, 255),
    _lineWidth: 1,
    _strokeColor: color(0, 0, 0),
    _lineJoin: 0,
    _lineCap: 0,
    _fillColor: color(255, 255, 255),
    _miterLimit: 10,
    _id: "",
  });
  objects[nodeId]._components.push(ref(id));
  return id;
}

/** 添加 Sprite 渲染器；未传 SpriteFrame 时作为 EditBox 的透明宿主。 */
function addSprite(
  objects,
  nodeId,
  spriteFrameUuid = null,
  tint = color(255, 255, 255),
) {
  const id = addObject(objects, {
    __type__: "cc.Sprite",
    _name: "",
    _objFlags: 0,
    node: ref(nodeId),
    _enabled: true,
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: tint,
    _spriteFrame: spriteFrameUuid
      ? assetRef(spriteFrameUuid, "cc.SpriteFrame")
      : null,
    _type: 0,
    _fillType: 0,
    _sizeMode: spriteFrameUuid ? 0 : 1,
    _fillCenter: { __type__: "cc.Vec2", x: 0, y: 0 },
    _fillStart: 0,
    _fillRange: 0,
    _isTrimmedMode: true,
    _useGrayscale: false,
    _atlas: null,
    _id: "",
  });
  objects[nodeId]._components.push(ref(id));
  return id;
}

/** 添加缩放反馈按钮。 */
function addButton(objects, nodeId) {
  const id = addObject(objects, {
    __type__: "cc.Button",
    _name: "",
    _objFlags: 0,
    node: ref(nodeId),
    _enabled: true,
    transition: 3,
    duration: 0.1,
    zoomScale: 0.94,
    _target: ref(nodeId),
    _clickEvents: [],
    _interactable: true,
    _id: "",
  });
  objects[nodeId]._components.push(ref(id));
  return id;
}

/** 添加全屏输入拦截组件。 */
function addBlockInputEvents(objects, nodeId) {
  const id = addObject(objects, {
    __type__: "cc.BlockInputEvents",
    _name: "",
    _objFlags: 0,
    node: ref(nodeId),
    _enabled: true,
    _id: "",
  });
  objects[nodeId]._components.push(ref(id));
  return id;
}

/** 添加全屏 Widget。 */
function addWidget(objects, nodeId) {
  const id = addObject(objects, {
    __type__: "cc.Widget",
    _name: "",
    _objFlags: 0,
    node: ref(nodeId),
    _enabled: true,
    _alignFlags: 45,
    _target: null,
    _left: 0,
    _right: 0,
    _top: 0,
    _bottom: 0,
    _horizontalCenter: 0,
    _verticalCenter: 0,
    _isAbsLeft: true,
    _isAbsRight: true,
    _isAbsTop: true,
    _isAbsBottom: true,
    _isAbsHorizontalCenter: true,
    _isAbsVerticalCenter: true,
    _originalWidth: 640,
    _originalHeight: 1136,
    _alignMode: 2,
    _lockFlags: 0,
    _id: "",
  });
  objects[nodeId]._components.push(ref(id));
  return id;
}

/** 添加业务脚本及 Inspector 绑定。 */
function addBusinessScript(objects, nodeId, scriptType, bindings) {
  const id = addObject(objects, {
    __type__: scriptType,
    _name: "",
    _objFlags: 0,
    node: ref(nodeId),
    _enabled: true,
    ...bindings,
    _id: "",
  });
  objects[nodeId]._components.push(ref(id));
  return id;
}

/** 从脚本 meta 和 Creator 编译产物中交叉取得序列化类 ID。 */
function resolveCreatorScriptType(className, relativeMetaPath) {
  const meta = readJson(path.join(projectRoot, relativeMetaPath), "脚本 meta");
  const expected = compressScriptUuid(meta.uuid);
  const actual = findCompiledScriptTypes(className);
  if (actual.size !== 1 || !actual.has(expected)) {
    throw new Error(
      `${className} 尚未被 Creator 正确导入：${expected} / ${[
        ...actual,
      ].join(",")}`,
    );
  }
  return expected;
}

/** 从 Creator 生成的图片 meta 中取得唯一 SpriteFrame UUID。 */
function resolveSpriteFrameUuid(relativeMetaPath) {
  const metaPath = path.join(projectRoot, relativeMetaPath);
  const meta = readJson(metaPath, "图片 meta");
  const spriteFramesInMeta = Object.values(meta.subMetas ?? {}).filter(
    (subMeta) => subMeta?.importer === "sprite-frame",
  );
  if (
    spriteFramesInMeta.length !== 1 ||
    typeof spriteFramesInMeta[0].uuid !== "string"
  ) {
    throw new Error(`${relativeMetaPath} 必须包含唯一 SpriteFrame 子资源。`);
  }
  return spriteFramesInMeta[0].uuid;
}

/** 扫描 Creator 实际编译产物中的指定 ccclass。 */
function findCompiledScriptTypes(className) {
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `_RF\\.push\\(\\{\\},\\s*["']([^"']+)["'],\\s*["']${escaped}["'],\\s*undefined\\)`,
    "g",
  );
  const types = new Set();
  for (const filePath of listFilesRecursively(creatorChunkDirectory)) {
    if (!filePath.endsWith(".js")) {
      continue;
    }
    const source = fs.readFileSync(filePath, "utf8");
    for (const match of source.matchAll(pattern)) {
      types.add(match[1]);
    }
  }
  return types;
}

/** 递归列出目录文件。 */
function listFilesRecursively(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursively(entryPath) : [entryPath];
  });
}

/** 创建或保留 Prefab meta。 */
function preparePrefabMeta(name, directory) {
  const prefabPath = path.join(directory, `${name}.prefab`);
  const metaPath = `${prefabPath}.meta`;
  if (fs.existsSync(prefabPath) && !fs.existsSync(metaPath)) {
    throw new Error(`${prefabPath} 已存在但缺少 meta。`);
  }
  const meta = fs.existsSync(metaPath)
    ? readJson(metaPath, `${name} Prefab meta`)
    : {
        ver: "1.1.50",
        importer: "prefab",
        imported: true,
        uuid: crypto.randomUUID(),
        files: [".json"],
        subMetas: {},
        userData: {},
      };
  meta.userData = { ...meta.userData, syncNodeName: name };
  preparedMetas.set(prefabPath, { metaPath, meta });
}

/** 创建正式资源目录及其稳定目录 meta。 */
function ensureDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
  const metaPath = `${directory}.meta`;
  if (fs.existsSync(metaPath)) {
    return;
  }
  writeJsonIfChanged(metaPath, {
    ver: "1.2.0",
    importer: "directory",
    imported: true,
    uuid: crypto.randomUUID(),
    files: [],
    subMetas: {},
    userData: {},
  });
}

/** 校验并写入 Prefab 和 meta。 */
function writePrefab(name, directory, objects) {
  validateReferenceRange(objects, name);
  validateEditBoxRendererCompatibility(objects, name);
  const prefabPath = path.join(directory, `${name}.prefab`);
  const prepared = preparedMetas.get(prefabPath);
  if (!prepared) {
    throw new Error(`${name} 尚未准备 Prefab meta。`);
  }
  writeJsonIfChanged(prefabPath, objects);
  writeJsonIfChanged(prepared.metaPath, prepared.meta);
}

/**
 * 阻止 EditBox 与其他 UI 渲染组件挂在同一节点。
 *
 * Creator 启用 EditBox 时会确保宿主节点存在 Sprite；若节点已经挂载 Graphics
 * 等渲染组件，运行时补 Sprite 会因组件互斥而直接报错。
 */
function validateEditBoxRendererCompatibility(objects, name) {
  for (const node of objects) {
    if (node?.__type__ !== "cc.Node") {
      continue;
    }
    const componentTypes = (node._components ?? []).map(
      (reference) => objects[reference.__id__]?.__type__,
    );
    if (!componentTypes.includes("cc.EditBox")) {
      continue;
    }
    const conflictingType = componentTypes.find((type) =>
      editBoxConflictingRendererTypes.has(type),
    );
    if (conflictingType) {
      throw new Error(
        `${name} 的 ${node._name} 不能同时挂载 cc.EditBox 和 ${conflictingType}。`,
      );
    }
  }
}

/** 校验脚本字段指向预期对象类型。 */
function validateBindings(objects, scriptId, required) {
  for (const [field, expectedType] of Object.entries(required)) {
    const target = objects[objects[scriptId][field]?.__id__];
    if (target?.__type__ !== expectedType) {
      throw new Error(
        `${objects[0]._name}.${field} 必须绑定 ${expectedType}。`,
      );
    }
  }
}

/** 校验全部内部引用均位于对象表范围内。 */
function validateReferenceRange(objects, name) {
  const visit = (value) => {
    if (!value || typeof value !== "object") {
      return;
    }
    if (
      Object.keys(value).length === 1 &&
      Object.hasOwn(value, "__id__") &&
      (!Number.isInteger(value.__id__) ||
        value.__id__ < 0 ||
        value.__id__ >= objects.length)
    ) {
      throw new Error(`${name} 存在越界引用：${value.__id__}`);
    }
    Object.values(value).forEach(visit);
  };
  visit(objects);
}

/** 为每个节点补齐稳定 PrefabInfo。 */
function attachPrefabInfos(objects) {
  for (const [nodeId, node] of objects.entries()) {
    if (node?.__type__ !== "cc.Node") {
      continue;
    }
    const fileId = crypto
      .createHash("sha1")
      .update(`${objects[0]._name}:${nodeId}:${node._name}`)
      .digest("base64")
      .replace(/[=+/]/g, "")
      .slice(0, 22);
    const infoId = addObject(objects, {
      __type__: "cc.PrefabInfo",
      root: ref(nodeId),
      asset: ref(0),
      fileId,
    });
    node._prefab = ref(infoId);
  }
}

/** 创建 Prefab 资源头。 */
function createPrefabAsset(name) {
  return {
    __type__: "cc.Prefab",
    _name: name,
    _objFlags: 0,
    _native: "",
    data: ref(1),
    optimizationPolicy: 0,
    asyncLoadAssets: false,
    persistent: false,
  };
}

/** 追加序列化对象并返回编号。 */
function addObject(objects, object) {
  objects.push(object);
  return objects.length - 1;
}

/** 读取 JSON 并保留上下文。 */
function readJson(filePath, description) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`读取${description}失败：${filePath}`, { cause: error });
  }
}

/** 仅在内容变化时写入 JSON。 */
function writeJsonIfChanged(filePath, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, "utf8") === content) {
    return;
  }
  fs.writeFileSync(filePath, content, "utf8");
}

/** 压缩 Creator 脚本 UUID。 */
function compressScriptUuid(uuid) {
  const hex = uuid.replaceAll("-", "").toLowerCase();
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = hex.slice(0, 5);
  for (let index = 5; index < hex.length; index += 3) {
    const value = Number.parseInt(hex.slice(index, index + 3), 16);
    result += alphabet[value >> 6] + alphabet[value & 63];
  }
  return result;
}

/** 创建内部对象引用。 */
function ref(id) {
  return { __id__: id };
}

/** 创建外部资源引用并声明 Creator 期望类型。 */
function assetRef(uuid, expectedType) {
  return {
    __uuid__: uuid,
    __expectedType__: expectedType,
  };
}

/** 创建三维向量。 */
function vec3(x, y, z) {
  return { __type__: "cc.Vec3", x, y, z };
}

/** 创建颜色。 */
function color(r, g, b, a = 255) {
  return { __type__: "cc.Color", r, g, b, a };
}

main();
