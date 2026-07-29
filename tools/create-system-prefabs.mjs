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

  preparePrefabMeta("UIHomePanel", directories.home);
  preparePrefabMeta("UISettingsPanel", directories.popup);
  preparePrefabMeta("UIProfilePanel", directories.popup);
  preparePrefabMeta("PuzzleAvatarItem", directories.item);
  writePrefab("UIHomePanel", directories.home, createHomePrefab());
  writePrefab(
    "UISettingsPanel",
    directories.popup,
    createSettingsPrefab(),
  );
  writePrefab("UIProfilePanel", directories.popup, createProfilePrefab());
  writePrefab("PuzzleAvatarItem", directories.item, createAvatarItemPrefab());
  console.log("大厅系统 Prefab 已生成并完成结构校验。");
}

/** 创建包含头像和设置入口的首页 Prefab。 */
function createHomePrefab() {
  const objects = [createPrefabAsset("UIHomePanel")];
  const rootId = addNode(objects, "UIHomePanel", null, 0, 0, 640, 1136);
  addWidget(objects, rootId);
  const titleLabelId = addTextNode(
    objects,
    rootId,
    "TitleLabel",
    "光影拼图",
    0,
    160,
    480,
    80,
    52,
    color(255, 255, 255),
  );
  const start = addTextButton(
    objects,
    rootId,
    "StartButton",
    "开始第 1 关",
    0,
    40,
    300,
    76,
    color(120, 205, 255),
    false,
  );
  const tipLabelId = addTextNode(
    objects,
    rootId,
    "TipLabel",
    "完成拼图，点亮光影",
    0,
    -50,
    560,
    50,
    24,
    color(195, 210, 230),
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
    color(255, 255, 255),
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
    color(255, 255, 255),
    true,
  );
  const scriptId = addBusinessScript(
    objects,
    rootId,
    scriptTypes.UIHomePanel,
    {
      titleLabel: ref(titleLabelId),
      startButton: ref(start.buttonId),
      startButtonLabel: ref(start.labelId),
      tipLabel: ref(tipLabelId),
      profileButton: ref(profileButtonId),
      profileAvatarRenderer: ref(avatar.rendererId),
      profileNameLabel: ref(profileNameLabelId),
      settingsButton: ref(settings.buttonId),
      settingsButtonGraphics: ref(settings.graphicsId),
    },
  );
  validateBindings(objects, scriptId, {
    titleLabel: "cc.Label",
    startButton: "cc.Button",
    startButtonLabel: "cc.Label",
    tipLabel: "cc.Label",
    profileButton: "cc.Button",
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
  addTextNode(
    objects,
    panelId,
    "SoundTitle",
    "声音",
    -155,
    270,
    150,
    54,
    30,
    color(48, 58, 75),
  );
  const sound = addTextButton(
    objects,
    panelId,
    "SoundButton",
    "开",
    170,
    270,
    110,
    56,
    color(255, 255, 255),
    true,
  );
  addTextNode(
    objects,
    panelId,
    "VibrationTitle",
    "震动",
    -155,
    185,
    150,
    54,
    30,
    color(48, 58, 75),
  );
  const vibration = addTextButton(
    objects,
    panelId,
    "VibrationButton",
    "开",
    170,
    185,
    110,
    56,
    color(255, 255, 255),
    true,
  );
  addTextNode(
    objects,
    panelId,
    "MoreTitle",
    "更多",
    -190,
    100,
    100,
    45,
    24,
    color(112, 123, 140),
  );
  const help = addActionRow(objects, panelId, "HelpButton", "帮助中心", 30);
  const rating = addActionRow(objects, panelId, "RatingButton", "为游戏评分", -55);
  const privacy = addActionRow(objects, panelId, "PrivacyButton", "隐私政策", -140);
  const terms = addActionRow(objects, panelId, "TermsButton", "服务条款", -225);
  const feedbackLabelId = addTextNode(
    objects,
    panelId,
    "FeedbackLabel",
    "",
    0,
    -325,
    460,
    46,
    21,
    color(104, 116, 134),
  );
  const versionLabelId = addTextNode(
    objects,
    panelId,
    "VersionLabel",
    "版本 v1.0.0",
    0,
    -405,
    360,
    40,
    20,
    color(135, 145, 160),
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
    color(54, 65, 83),
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

/** 添加 EditBox 等组件需要的透明 Sprite 渲染器。 */
function addSprite(objects, nodeId) {
  const id = addObject(objects, {
    __type__: "cc.Sprite",
    _name: "",
    _objFlags: 0,
    node: ref(nodeId),
    _enabled: true,
    _customMaterial: null,
    _srcBlendFactor: 2,
    _dstBlendFactor: 4,
    _color: color(255, 255, 255),
    _spriteFrame: null,
    _type: 1,
    _fillType: 0,
    _sizeMode: 1,
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

/** 创建三维向量。 */
function vec3(x, y, z) {
  return { __type__: "cc.Vec3", x, y, z };
}

/** 创建颜色。 */
function color(r, g, b, a = 255) {
  return { __type__: "cc.Color", r, g, b, a };
}

main();
