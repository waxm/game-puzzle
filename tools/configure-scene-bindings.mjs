#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** 项目根目录。 */
const projectRoot = path.resolve(import.meta.dirname, "..");

/** UI 节点使用的 Cocos 2D Layer。 */
const uiLayer = 33554432;

/** 需要配置显式节点绑定的场景。 */
const sceneConfigs = [
  {
    name: "Lobby",
    path: "assets/scene/Lobby.scene",
  },
  {
    name: "Game",
    path: "assets/scene/Game.scene",
  },
];

/** 全部正式场景；用于执行不依赖业务入口结构的公共清理。 */
const allSceneConfigs = [
  {
    name: "Boot",
    path: "assets/scene/Boot.scene",
  },
  ...sceneConfigs,
];

/** 配置全部场景并在写入前后校验引用结构。 */
function main() {
  for (const config of allSceneConfigs) {
    removeLegacyDirectionalLight(config);
    removeLegacyMainCamera(config);
  }
  for (const config of sceneConfigs) {
    configureScene(config);
  }
  console.log(
    "三个正式场景的废弃 3D 主光源和主相机已清理，Lobby.scene 与 Game.scene 的 UIRoot 显式绑定已配置完成。",
  );
}

/**
 * 删除 2D 场景模板遗留的主光源。
 *
 * 这三个场景只渲染 2D UI，保留 DirectionalLight 只会增加无效的反序列化和光照状态；
 * 使用可重复执行的迁移工具统一删除，避免人工修改序列化 JSON 或破坏内部引用。
 */
function removeLegacyDirectionalLight(config) {
  const scenePath = path.join(projectRoot, config.path);
  const objects = JSON.parse(fs.readFileSync(scenePath, "utf8"));
  validateReferenceRange(objects, config.name);

  const mainLightIds = objects
    .map((object, index) => ({ object, index }))
    .filter(
      ({ object }) =>
        object.__type__ === "cc.Node" && object._name === "Main Light",
    )
    .map(({ index }) => index);
  if (mainLightIds.length === 0) {
    const legacyType = objects.find(
      (object) =>
        object.__type__ === "cc.DirectionalLight" ||
        object.__type__ === "cc.StaticLightSettings",
    )?.__type__;
    if (legacyType) {
      throw new Error(
        `${config.name}.scene 存在未挂在 Main Light 下的废弃组件：${legacyType}`,
      );
    }
    return;
  }
  if (mainLightIds.length !== 1) {
    throw new Error(`${config.name}.scene 必须至多有一个 Main Light 节点。`);
  }

  const mainLightId = mainLightIds[0];
  const mainLight = objects[mainLightId];
  const componentIds = (mainLight._components ?? []).map(
    (component) => component.__id__,
  );
  if (
    componentIds.length !== 1 ||
    objects[componentIds[0]]?.__type__ !== "cc.DirectionalLight"
  ) {
    throw new Error(
      `${config.name}.Main Light 必须只包含一个 DirectionalLight。`,
    );
  }

  const directionalLightId = componentIds[0];
  const staticSettingsId = objects[directionalLightId]._staticSettings?.__id__;
  if (
    staticSettingsId === undefined ||
    objects[staticSettingsId]?.__type__ !== "cc.StaticLightSettings"
  ) {
    throw new Error(
      `${config.name}.DirectionalLight 缺少 StaticLightSettings。`,
    );
  }

  const sceneId = objects[0]?.scene?.__id__;
  const scene = objects[sceneId];
  if (scene?.__type__ !== "cc.Scene") {
    throw new Error(`${config.name}.scene 缺少有效的 cc.Scene 根对象。`);
  }
  scene._children = (scene._children ?? []).filter(
    (child) => child.__id__ !== mainLightId,
  );

  const compactedObjects = removeSerializedObjects(
    objects,
    new Set([mainLightId, directionalLightId, staticSettingsId]),
    config.name,
  );
  validateReferenceRange(compactedObjects, config.name);
  fs.writeFileSync(
    scenePath,
    `${JSON.stringify(compactedObjects, null, 2)}\n`,
    "utf8",
  );
}

/**
 * 删除 3D 模板遗留的 Main Camera。
 *
 * Canvas 已显式持有自己的正交 UI 相机；根节点下额外的透视相机会激活无用的 3D
 * 渲染路径，并且对当前纯 UI 场景没有任何画面贡献。
 */
function removeLegacyMainCamera(config) {
  const scenePath = path.join(projectRoot, config.path);
  const objects = JSON.parse(fs.readFileSync(scenePath, "utf8"));
  validateReferenceRange(objects, config.name);

  const mainCameraIds = objects
    .map((object, index) => ({ object, index }))
    .filter(
      ({ object }) =>
        object.__type__ === "cc.Node" && object._name === "Main Camera",
    )
    .map(({ index }) => index);
  if (mainCameraIds.length === 0) {
    return;
  }
  if (mainCameraIds.length !== 1) {
    throw new Error(`${config.name}.scene 必须至多有一个 Main Camera 节点。`);
  }

  const mainCameraId = mainCameraIds[0];
  const mainCamera = objects[mainCameraId];
  const componentIds = (mainCamera._components ?? []).map(
    (component) => component.__id__,
  );
  if (
    componentIds.length !== 1 ||
    objects[componentIds[0]]?.__type__ !== "cc.Camera"
  ) {
    throw new Error(`${config.name}.Main Camera 必须只包含一个 cc.Camera。`);
  }

  const sceneId = objects[0]?.scene?.__id__;
  const scene = objects[sceneId];
  if (scene?.__type__ !== "cc.Scene") {
    throw new Error(`${config.name}.scene 缺少有效的 cc.Scene 根对象。`);
  }
  scene._children = (scene._children ?? []).filter(
    (child) => child.__id__ !== mainCameraId,
  );

  const compactedObjects = removeSerializedObjects(
    objects,
    new Set([mainCameraId, componentIds[0]]),
    config.name,
  );
  validateReferenceRange(compactedObjects, config.name);
  fs.writeFileSync(
    scenePath,
    `${JSON.stringify(compactedObjects, null, 2)}\n`,
    "utf8",
  );
}

/** 删除一组序列化对象，并一次性重排保留对象中的全部内部引用。 */
function removeSerializedObjects(objects, removedIds, sceneName) {
  const idMap = new Map();
  const retainedObjects = [];
  for (let oldId = 0; oldId < objects.length; oldId += 1) {
    if (removedIds.has(oldId)) {
      continue;
    }
    idMap.set(oldId, retainedObjects.length);
    retainedObjects.push(objects[oldId]);
  }

  visitValue(retainedObjects, (oldId, referenceValue) => {
    if (removedIds.has(oldId)) {
      throw new Error(
        `${sceneName}.scene 删除对象后仍存在引用：__id__=${oldId}`,
      );
    }
    const newId = idMap.get(oldId);
    if (newId === undefined) {
      throw new Error(`${sceneName}.scene 存在无法重排的引用：__id__=${oldId}`);
    }
    referenceValue.__id__ = newId;
  });
  return retainedObjects;
}

/** 为单个场景创建或复用 UIRoot，并清理旧版场景音频绑定。 */
function configureScene(config) {
  const scenePath = path.join(projectRoot, config.path);
  const objects = JSON.parse(fs.readFileSync(scenePath, "utf8"));
  validateReferenceRange(objects, config.name);

  let canvasId = findNodeId(objects, "Canvas");
  let scriptId = findSceneScriptId(objects, objects[canvasId], config.name);
  ({ canvasId, scriptId } = removeLegacyAudioSource(
    objects,
    canvasId,
    scriptId,
    config.name,
  ));

  const canvas = objects[canvasId];
  const script = objects[scriptId];
  const uiRootId = ensureUIRoot(objects, canvasId, config.name);
  script.uiRoot = reference(uiRootId);

  validateSceneBindings(objects, config, scriptId, uiRootId);
  fs.writeFileSync(scenePath, `${JSON.stringify(objects, null, 2)}\n`, "utf8");
}

/** 获取场景中名称唯一的节点编号。 */
function findNodeId(objects, nodeName) {
  const nodeIds = objects
    .map((object, index) => ({ object, index }))
    .filter(({ object }) => object.__type__ === "cc.Node" && object._name === nodeName)
    .map(({ index }) => index);
  if (nodeIds.length !== 1) {
    throw new Error(`场景中必须有且只有一个 ${nodeName} 节点。`);
  }
  return nodeIds[0];
}

/** 从 Canvas 已挂载组件中取得唯一的业务场景脚本。 */
function findSceneScriptId(objects, canvas, sceneName) {
  const scriptIds = (canvas._components ?? [])
    .map((item) => item.__id__)
    .filter((id) => !String(objects[id]?.__type__).startsWith("cc."));
  if (scriptIds.length !== 1) {
    throw new Error(`${sceneName}.Canvas 必须挂载且只挂载一个场景业务脚本。`);
  }
  return scriptIds[0];
}

/** 创建或复用 Canvas 下的 UIRoot 节点。 */
function ensureUIRoot(objects, canvasId, sceneName) {
  const canvas = objects[canvasId];
  const existingId = (canvas._children ?? [])
    .map((item) => item.__id__)
    .find((id) => objects[id]?.__type__ === "cc.Node" && objects[id]._name === "UIRoot");
  if (existingId !== undefined) {
    ensureUITransform(objects, existingId, sceneName);
    return existingId;
  }

  const nodeId = objects.length;
  const transformId = nodeId + 1;
  objects.push({
    __type__: "cc.Node",
    _name: "UIRoot",
    _objFlags: 0,
    __editorExtras__: {},
    _parent: reference(canvasId),
    _children: [],
    _active: true,
    _components: [reference(transformId)],
    _prefab: null,
    _lpos: vector3(0, 0, 0),
    _lrot: quaternionIdentity(),
    _lscale: vector3(1, 1, 1),
    _mobility: 0,
    _layer: uiLayer,
    _euler: vector3(0, 0, 0),
    _id: createStableId(`${sceneName}:UIRoot`),
  });
  objects.push(createUITransform(nodeId, `${sceneName}:UIRoot:UITransform`));
  canvas._children.push(reference(nodeId));
  return nodeId;
}

/** 确保已有 UIRoot 带有尺寸正确的 UITransform。 */
function ensureUITransform(objects, nodeId, sceneName) {
  const node = objects[nodeId];
  const transformId = (node._components ?? [])
    .map((item) => item.__id__)
    .find((id) => objects[id]?.__type__ === "cc.UITransform");
  if (transformId !== undefined) {
    objects[transformId]._contentSize = size(640, 1136);
    return transformId;
  }

  const newTransformId = objects.length;
  objects.push(createUITransform(nodeId, `${sceneName}:UIRoot:UITransform`));
  node._components.push(reference(newTransformId));
  return newTransformId;
}

/**
 * 删除旧版 GameScene.audioSource Inspector 绑定及其专用组件。
 *
 * 音频现已由 AudioManager 的常驻节点统一持有。迁移时同步重排所有内部 __id__，避免
 * 直接删除序列化数组元素后让后续节点和组件引用整体错位。
 */
function removeLegacyAudioSource(objects, canvasId, scriptId, sceneName) {
  const script = objects[scriptId];
  const canvas = objects[canvasId];
  const generatedAudioSourceId = (canvas._components ?? [])
    .map((component) => component.__id__)
    .find(
      (componentId) =>
        objects[componentId]?.__type__ === "cc.AudioSource" &&
        objects[componentId]?._id === createStableId(`${sceneName}:AudioSource`),
    );
  if (
    !Object.hasOwn(script, "audioSource") &&
    generatedAudioSourceId === undefined
  ) {
    return { canvasId, scriptId };
  }

  const audioSourceId = script.audioSource?.__id__ ?? generatedAudioSourceId;
  delete script.audioSource;
  if (audioSourceId === undefined || audioSourceId === null) {
    return { canvasId, scriptId };
  }

  const audioSource = objects[audioSourceId];
  if (
    audioSource?.__type__ !== "cc.AudioSource" ||
    audioSource.node?.__id__ !== canvasId
  ) {
    throw new Error(`${sceneName}Scene.audioSource 不是 Canvas 上的 AudioSource。`);
  }

  canvas._components = (canvas._components ?? []).filter(
    (component) => component.__id__ !== audioSourceId,
  );

  let hasRemainingReference = false;
  visitValue(objects, (referenceId) => {
    if (referenceId === audioSourceId) {
      hasRemainingReference = true;
    }
  });
  if (hasRemainingReference) {
    throw new Error(`${sceneName}.scene 的旧 AudioSource 仍被其他对象引用。`);
  }

  objects.splice(audioSourceId, 1);
  remapReferencesAfterRemoval(objects, audioSourceId);
  return {
    canvasId: remapObjectId(canvasId, audioSourceId),
    scriptId: remapObjectId(scriptId, audioSourceId),
  };
}

/** 删除序列化对象后，把所有位于其后的 __id__ 向前移动一位。 */
function remapReferencesAfterRemoval(value, removedId) {
  if (Array.isArray(value)) {
    value.forEach((item) => remapReferencesAfterRemoval(item, removedId));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  if (Object.keys(value).length === 1 && Object.hasOwn(value, "__id__")) {
    if (value.__id__ === removedId) {
      throw new Error(`删除对象后仍存在未处理引用：__id__=${removedId}`);
    }
    if (value.__id__ > removedId) {
      value.__id__ -= 1;
    }
    return;
  }
  Object.values(value).forEach((item) =>
    remapReferencesAfterRemoval(item, removedId),
  );
}

/** 返回对象删除后的新数组下标。 */
function remapObjectId(objectId, removedId) {
  return objectId > removedId ? objectId - 1 : objectId;
}

/** 创建固定为设计分辨率的 UITransform 序列化对象。 */
function createUITransform(nodeId, seed) {
  return {
    __type__: "cc.UITransform",
    _name: "",
    _objFlags: 0,
    __editorExtras__: {},
    node: reference(nodeId),
    _enabled: true,
    __prefab: null,
    _contentSize: size(640, 1136),
    _anchorPoint: { __type__: "cc.Vec2", x: 0.5, y: 0.5 },
    _id: createStableId(seed),
  };
}

/** 校验生成后的节点、组件和脚本属性绑定完整。 */
function validateSceneBindings(objects, config, scriptId, uiRootId) {
  validateReferenceRange(objects, config.name);
  const script = objects[scriptId];
  if (script.uiRoot?.__id__ !== uiRootId) {
    throw new Error(`${config.name}Scene.uiRoot 绑定失败。`);
  }
  if (Object.hasOwn(script, "audioSource")) {
    throw new Error(`${config.name}Scene 不应再持有场景级 audioSource。`);
  }
}

/** 递归校验所有 __id__ 引用都位于序列化对象数组范围内。 */
function validateReferenceRange(objects, sceneName) {
  visitValue(objects, (referenceId) => {
    if (!Number.isInteger(referenceId) || referenceId < 0 || referenceId >= objects.length) {
      throw new Error(`${sceneName}.scene 存在越界引用：__id__=${referenceId}`);
    }
  });
}

/** 递归遍历 JSON 值中的内部引用。 */
function visitValue(value, onReference) {
  if (Array.isArray(value)) {
    value.forEach((item) => visitValue(item, onReference));
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  if (Object.keys(value).length === 1 && Object.hasOwn(value, "__id__")) {
    onReference(value.__id__, value);
    return;
  }
  Object.values(value).forEach((item) => visitValue(item, onReference));
}

/** 创建稳定的 Cocos 对象内部 ID，重复运行不会改变。 */
function createStableId(seed) {
  return crypto.createHash("sha256").update(seed).digest("base64").slice(0, 22);
}

/** 创建序列化对象内部引用。 */
function reference(id) {
  return { __id__: id };
}

/** 创建 Cocos Vec3 序列化值。 */
function vector3(x, y, z) {
  return { __type__: "cc.Vec3", x, y, z };
}

/** 创建 Cocos 四元数单位旋转。 */
function quaternionIdentity() {
  return { __type__: "cc.Quat", x: 0, y: 0, z: 0, w: 1 };
}

/** 创建 Cocos Size 序列化值。 */
function size(width, height) {
  return { __type__: "cc.Size", width, height };
}

main();
