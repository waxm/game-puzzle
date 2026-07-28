/** 测试专用的轻量事件目标，只实现核心框架实际使用的事件接口。 */
class MockEventTarget {
  /** 事件名到监听记录的映射。 */
  _listeners = new Map();

  /** 注册普通监听。 */
  on(eventName, callback, target) {
    const listeners = this._listeners.get(eventName) ?? [];
    listeners.push({ callback, target, once: false });
    this._listeners.set(eventName, listeners);
  }

  /** 注册一次性监听。 */
  once(eventName, callback, target) {
    const listeners = this._listeners.get(eventName) ?? [];
    listeners.push({ callback, target, once: true });
    this._listeners.set(eventName, listeners);
  }

  /** 注销与 Cocos EventTarget 兼容的监听。 */
  off(eventName, callback, target) {
    const listeners = this._listeners.get(eventName);
    if (!listeners) {
      return;
    }
    if (!callback && target === undefined) {
      this._listeners.delete(eventName);
      return;
    }
    const nextListeners = listeners.filter((listener) => {
      const callbackMatched = callback ? listener.callback === callback : true;
      const targetMatched = target !== undefined ? listener.target === target : true;
      return !(callbackMatched && targetMatched);
    });
    if (nextListeners.length > 0) {
      this._listeners.set(eventName, nextListeners);
    } else {
      this._listeners.delete(eventName);
    }
  }

  /** 派发事件，并保持派发期间增删监听的行为稳定。 */
  emit(eventName, ...args) {
    const snapshot = [...(this._listeners.get(eventName) ?? [])];
    for (const listener of snapshot) {
      if (!(this._listeners.get(eventName) ?? []).includes(listener)) {
        continue;
      }
      if (listener.once) {
        const listeners = this._listeners.get(eventName) ?? [];
        const nextListeners = listeners.filter((item) => item !== listener);
        if (nextListeners.length > 0) {
          this._listeners.set(eventName, nextListeners);
        } else {
          this._listeners.delete(eventName);
        }
      }
      listener.callback.call(listener.target, ...args);
    }
  }

  /** 返回指定事件当前监听数量。 */
  listenerCount(eventName) {
    return (this._listeners.get(eventName) ?? []).length;
  }

  /** 清空当前事件目标的全部监听。 */
  reset() {
    this._listeners.clear();
  }

  /** 删除当前事件目标上由指定 target 注册的全部监听。 */
  targetOff(target) {
    for (const eventName of [...this._listeners.keys()]) {
      this.off(eventName, undefined, target);
    }
  }
}

/** 测试专用 Cocos Component。 */
export class Component {
  /** 组件所属节点。 */
  node = null;

  /** 组件当前是否有效。 */
  isValid = true;

  /** unscheduleAllCallbacks 调用次数。 */
  unscheduleAllCount = 0;

  /** 模拟清理组件通过 schedule 注册的全部任务。 */
  unscheduleAllCallbacks() {
    this.unscheduleAllCount += 1;
  }
}

/** 测试专用三维向量。 */
export class Vec3 {
  /** 创建三维向量。 */
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /** X 分量。 */
  x;

  /** Y 分量。 */
  y;

  /** Z 分量。 */
  z;

  /** 返回独立副本。 */
  clone() {
    return new Vec3(this.x, this.y, this.z);
  }

  /** 使用向量或三个分量原地更新当前值。 */
  set(valueOrX, y, z) {
    if (valueOrX instanceof Vec3) {
      this.x = valueOrX.x;
      this.y = valueOrX.y;
      this.z = valueOrX.z;
      return this;
    }
    this.x = valueOrX ?? 0;
    this.y = y ?? 0;
    this.z = z ?? 0;
    return this;
  }
}

/** 测试专用四元数。 */
export class Quat {
  /** 创建四元数。 */
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  /** X 分量。 */
  x;

  /** Y 分量。 */
  y;

  /** Z 分量。 */
  z;

  /** W 分量。 */
  w;

  /** 返回独立副本。 */
  clone() {
    return new Quat(this.x, this.y, this.z, this.w);
  }
}

/** 测试专用 Tween 静态控制器。 */
export class Tween {
  /** 已执行停止操作的目标记录。 */
  static stoppedTargets = [];

  /** 记录指定目标的全部 Tween 已停止。 */
  static stopAllByTarget(target) {
    this.stoppedTargets.push(target);
  }

  /** 清空 Tween 测试记录。 */
  static reset() {
    this.stoppedTargets.length = 0;
  }
}

/** 测试专用 Cocos Node。 */
export class Node extends MockEventTarget {
  /** 核心框架使用到的节点事件。 */
  static EventType = {
    NODE_DESTROYED: "node-destroyed",
    TOUCH_START: "touch-start",
    TOUCH_MOVE: "touch-move",
    TOUCH_END: "touch-end",
    TOUCH_CANCEL: "touch-cancel",
  };

  /** 创建一个可挂载组件和子节点的测试节点。 */
  constructor(name = "") {
    super();
    this.name = name;
  }

  /** 节点名称。 */
  name;

  /** 节点显示状态。 */
  active = true;

  /** 节点本地坐标。 */
  position = new Vec3();

  /** 节点本地旋转。 */
  rotation = new Quat();

  /** 节点本地缩放。 */
  scale = new Vec3(1, 1, 1);

  /** 节点渲染层。 */
  layer = 0;

  /** 当前父节点。 */
  parent = null;

  /** 当前子节点。 */
  children = [];

  /** 节点当前是否有效。 */
  isValid = true;

  /** 节点是否已进入销毁流程。 */
  _destroying = false;

  /** 节点上挂载的组件。 */
  _components = [];

  /** 添加子节点，并从旧父节点安全移除。 */
  addChild(node) {
    node._detachFromParent();
    node.parent = this;
    this.children.push(node);
  }

  /** 设置父节点。测试不模拟世界坐标，仅维护层级关系。 */
  setParent(parent) {
    if (parent) {
      parent.addChild(this);
    } else {
      this._detachFromParent();
    }
  }

  /** 挂载组件实例或组件构造函数。 */
  addComponent(componentOrType) {
    const component =
      typeof componentOrType === "function"
        ? new componentOrType()
        : componentOrType;
    component.node = this;
    component.isValid = true;
    this._components.push(component);
    return component;
  }

  /** 按构造函数取得第一个匹配组件。 */
  getComponent(type) {
    if (typeof type === "string") {
      return (
        this._components.find(
          (component) => component.constructor.name === type,
        ) ?? null
      );
    }
    return this._components.find((component) => component instanceof type) ?? null;
  }

  /** 设置本地坐标。 */
  setPosition(valueOrX, y, z) {
    this.position =
      valueOrX instanceof Vec3
        ? valueOrX.clone()
        : new Vec3(valueOrX ?? 0, y ?? 0, z ?? 0);
  }

  /** 设置本地旋转。 */
  setRotation(rotation) {
    this.rotation = rotation.clone();
  }

  /** 设置本地缩放。 */
  setScale(valueOrX, y, z) {
    this.scale =
      valueOrX instanceof Vec3
        ? valueOrX.clone()
        : new Vec3(valueOrX ?? 1, y ?? valueOrX ?? 1, z ?? valueOrX ?? 1);
  }

  /**
   * 同步模拟节点销毁。
   *
   * NODE_DESTROYED 必须在组件和子节点失效前派发，才能覆盖 UIManager 依赖的
   * “销毁前仍可访问 Inspector 绑定”语义。
   */
  destroy() {
    if (!this.isValid || this._destroying) {
      return;
    }
    this._destroying = true;
    this.emit(Node.EventType.NODE_DESTROYED, this);

    for (const child of [...this.children]) {
      child.destroy();
    }
    for (const component of [...this._components]) {
      if (typeof component.onDestroy === "function") {
        component.onDestroy();
      }
      component.isValid = false;
    }

    this._detachFromParent();
    this.children.length = 0;
    this._components.length = 0;
    this._listeners.clear();
    this.isValid = false;
    this._destroying = false;
  }

  /** 从父节点 children 中移除当前节点。 */
  _detachFromParent() {
    if (!this.parent) {
      return;
    }
    const index = this.parent.children.indexOf(this);
    if (index >= 0) {
      this.parent.children.splice(index, 1);
    }
    this.parent = null;
  }
}

/** 判断模拟对象是否仍然有效。 */
export function isValid(value) {
  return Boolean(value) && value.isValid !== false;
}

/** 测试专用资源基类，记录引用计数和销毁状态。 */
export class Asset {
  /** 当前 addRef 与 decRef 的净引用数量。 */
  refCount = 0;

  /** 当前资源是否有效。 */
  isValid = true;

  /** 增加一次资源引用。 */
  addRef() {
    this.refCount += 1;
    return this;
  }

  /** 减少一次资源引用。 */
  decRef() {
    this.refCount -= 1;
    return this;
  }

  /** 销毁当前测试资源。 */
  destroy() {
    this.isValid = false;
  }
}

/** 测试专用 JSON 资源。 */
export class JsonAsset extends Asset {
  /** 创建并保存普通 JSON 数据。 */
  constructor(json = null) {
    super();
    this.json = json;
  }

  /** JSON 普通数据。 */
  json;
}

/** 测试专用 Prefab，通过工厂创建新节点。 */
export class Prefab extends Asset {
  /** 创建一个带节点工厂的 Prefab。 */
  constructor(factory = () => new Node("Prefab")) {
    super();
    this.factory = factory;
  }

  /** Prefab 实例工厂。 */
  factory;
}

/** 测试专用音频资源。 */
export class AudioClip extends Asset {
  /** 创建指定秒数的音频资源。 */
  constructor(duration = 1) {
    super();
    this.duration = duration;
  }

  /** 音频时长。 */
  duration;

  /** 返回音频时长。 */
  getDuration() {
    return this.duration;
  }
}

/** 测试专用图片帧资源。 */
export class SpriteFrame extends Asset {}

/** 测试专用 UI 尺寸组件。 */
export class UITransform extends Component {
  /** 当前内容宽度。 */
  width = 0;

  /** 当前内容高度。 */
  height = 0;

  /** 记录组件内容尺寸。 */
  setContentSize(width, height) {
    this.width = width;
    this.height = height;
  }
}

/** 测试专用图片显示组件。 */
export class Sprite extends Component {
  /** 当前显示图片帧。 */
  spriteFrame = null;
}

/** 测试专用文本组件。 */
export class Label extends Component {
  /** 当前文本。 */
  string = "";
}

/** 测试专用触摸事件。 */
export class EventTouch {
  /** 创建指定触摸编号和 UI 坐标的事件。 */
  constructor(id = 0, x = 0, y = 0) {
    this.id = id;
    this.location = { x, y };
  }

  /** 返回触摸编号。 */
  getID() {
    return this.id;
  }

  /** 返回 UI 坐标。 */
  getUILocation() {
    return { ...this.location };
  }
}

/** 测试专用音频播放组件。 */
export class AudioSource extends Component {
  /** 当前背景音乐资源。 */
  clip = null;

  /** 当前是否循环。 */
  loop = false;

  /** 当前音量。 */
  volume = 1;

  /** 是否允许组件加载后自动播放。 */
  playOnAwake = false;

  /** 当前是否正在播放背景音乐。 */
  playing = false;

  /** 播放调用次数。 */
  playCount = 0;

  /** 停止调用次数。 */
  stopCount = 0;

  /** 暂停调用次数。 */
  pauseCount = 0;

  /** 一次性音效播放记录。 */
  oneShotCalls = [];

  /** 模拟播放。 */
  play() {
    this.playCount += 1;
    this.playing = true;
  }

  /** 模拟停止。 */
  stop() {
    this.stopCount += 1;
    this.playing = false;
  }

  /** 模拟暂停。 */
  pause() {
    this.pauseCount += 1;
    this.playing = false;
  }

  /** 记录一次性音效播放。 */
  playOneShot(clip, volume) {
    this.oneShotCalls.push({ clip, volume });
  }
}

/** 根据测试 Prefab 创建节点实例。 */
export function instantiate(prefab) {
  if (!(prefab instanceof Prefab)) {
    throw new TypeError("测试 instantiate 只接受 Prefab。");
  }
  const node = prefab.factory();
  if (!(node instanceof Node)) {
    throw new TypeError("Prefab 工厂必须返回 Node。");
  }
  return node;
}

/** 测试专用节点对象池。 */
export class NodePool {
  /** 当前池内节点。 */
  _nodes = [];

  /** 回收节点。 */
  put(node) {
    node.setParent(null);
    this._nodes.push(node);
  }

  /** 取出最近回收的节点。 */
  get() {
    return this._nodes.pop() ?? null;
  }

  /** 返回池内节点数量。 */
  size() {
    return this._nodes.length;
  }

  /** 销毁并清空池内节点。 */
  clear() {
    for (const node of this._nodes) {
      node.destroy();
    }
    this._nodes.length = 0;
  }
}

/** 测试专用内存 localStorage。 */
class MockLocalStorage {
  /** 内存键值表。 */
  _values = new Map();

  /** 返回键数量。 */
  get length() {
    return this._values.size;
  }

  /** 保存字符串。 */
  setItem(key, value) {
    this._values.set(String(key), String(value));
  }

  /** 读取字符串。 */
  getItem(key) {
    return this._values.get(String(key)) ?? null;
  }

  /** 删除字符串。 */
  removeItem(key) {
    this._values.delete(String(key));
  }

  /** 按顺序取得键。 */
  key(index) {
    return [...this._values.keys()][index] ?? null;
  }

  /** 清空全部测试数据。 */
  clear() {
    this._values.clear();
  }
}

/** 测试专用 Creator Scheduler。 */
class MockScheduler {
  /** 当前注册任务。 */
  _records = [];

  /** 注册 Scheduler 任务。 */
  schedule(callback, target, interval, repeat, delay, paused) {
    this._records.push({
      callback,
      target,
      interval,
      repeat,
      delay,
      paused,
      remainingRuns: repeat === macro.REPEAT_FOREVER ? Infinity : repeat + 1,
    });
  }

  /** 注销指定目标上的指定回调。 */
  unschedule(callback, target) {
    this._records = this._records.filter(
      (record) => record.callback !== callback || record.target !== target,
    );
  }

  /** 暂停指定目标。 */
  pauseTarget(target) {
    this._records
      .filter((record) => record.target === target)
      .forEach((record) => {
        record.paused = true;
      });
  }

  /** 恢复指定目标。 */
  resumeTarget(target) {
    this._records
      .filter((record) => record.target === target)
      .forEach((record) => {
        record.paused = false;
      });
  }

  /** 判断指定目标是否暂停。 */
  isTargetPaused(target) {
    return this._records.some(
      (record) => record.target === target && record.paused,
    );
  }

  /** 执行当前所有未暂停任务一次。 */
  runAllOnce() {
    for (const record of [...this._records]) {
      if (!this._records.includes(record) || record.paused) {
        continue;
      }
      record.callback();
      if (!this._records.includes(record) || record.remainingRuns === Infinity) {
        continue;
      }
      record.remainingRuns -= 1;
      if (record.remainingRuns <= 0) {
        this._records = this._records.filter((item) => item !== record);
      }
    }
  }

  /** 返回当前 Scheduler 任务数量。 */
  count() {
    return this._records.length;
  }

  /** 清空全部 Scheduler 任务。 */
  reset() {
    this._records.length = 0;
  }
}

/** 测试专用资源加载器。 */
class MockLoader {
  /** 单资源注册表。 */
  _assets = new Map();

  /** 目录资源注册表。 */
  _directories = new Map();

  /** 下一次需要延迟完成的路径。 */
  _deferredPaths = new Set();

  /** 下一次需要失败的路径。 */
  _failures = new Map();

  /** 尚未完成的加载请求。 */
  _pendingLoads = [];

  /** 单资源加载调用次数。 */
  loadCount = 0;

  /** 目录加载调用次数。 */
  loadDirCount = 0;

  /** 注册单资源。 */
  register(path, asset) {
    this._assets.set(path, asset);
  }

  /** 注册目录资源。 */
  registerDir(path, assets) {
    this._directories.set(path, [...assets]);
  }

  /** 让指定路径的下一次请求保持等待。 */
  deferNextLoad(path) {
    this._deferredPaths.add(path);
  }

  /** 让指定路径的下一次请求失败。 */
  failNextLoad(path, error = new Error(`模拟资源加载失败：${path}`)) {
    this._failures.set(path, error);
  }

  /** 模拟加载单资源。 */
  load(path, type, callback) {
    this.loadCount += 1;
    const request = { kind: "asset", path, type, callback };
    if (this._deferredPaths.delete(path)) {
      this._pendingLoads.push(request);
      return;
    }
    this._finishLoad(request);
  }

  /** 模拟加载目录资源。 */
  loadDir(path, type, callback) {
    this.loadDirCount += 1;
    const request = { kind: "directory", path, type, callback };
    if (this._deferredPaths.delete(path)) {
      this._pendingLoads.push(request);
      return;
    }
    this._finishLoad(request);
  }

  /** 完成最早等待的指定路径请求。 */
  completeNextLoad(path) {
    const index = this._pendingLoads.findIndex(
      (request) => path === undefined || request.path === path,
    );
    if (index < 0) {
      throw new Error(`没有等待中的资源请求：${path ?? "任意路径"}`);
    }
    const [request] = this._pendingLoads.splice(index, 1);
    this._finishLoad(request);
  }

  /** 根据注册数据结束单个请求。 */
  _finishLoad(request) {
    const failure = this._failures.get(request.path);
    if (failure) {
      this._failures.delete(request.path);
      request.callback(failure, null);
      return;
    }

    if (request.kind === "directory") {
      const assets = this._directories.get(request.path);
      request.callback(
        assets ? null : new Error(`模拟目录资源不存在：${request.path}`),
        assets ? [...assets] : null,
      );
      return;
    }

    const asset = this._assets.get(request.path);
    request.callback(
      asset ? null : new Error(`模拟资源不存在：${request.path}`),
      asset ?? null,
    );
  }

  /** 清空加载器状态。 */
  reset() {
    this._assets.clear();
    this._directories.clear();
    this._deferredPaths.clear();
    this._failures.clear();
    this._pendingLoads.length = 0;
    this.loadCount = 0;
    this.loadDirCount = 0;
  }
}

/** 测试专用 Asset Bundle。 */
export class Bundle extends MockLoader {
  /** 创建具名分包。 */
  constructor(name) {
    super();
    this.name = name;
  }

  /** 分包名。 */
  name;
}

/** 测试专用 AssetManager。 */
class MockAssetManager {
  /** 可加载分包注册表。 */
  _bundles = new Map();

  /** 下一次需要延迟完成的分包。 */
  _deferredBundleNames = new Set();

  /** 下一次需要失败的分包。 */
  _failures = new Map();

  /** 尚未完成的分包请求。 */
  _pendingLoads = [];

  /** 已移除分包记录。 */
  removedBundles = [];

  /** 分包加载调用次数。 */
  loadBundleCount = 0;

  /** 注册可加载分包。 */
  registerBundle(name, bundle) {
    this._bundles.set(name, bundle);
  }

  /** 让指定分包的下一次加载保持等待。 */
  deferNextBundle(name) {
    this._deferredBundleNames.add(name);
  }

  /** 让指定分包的下一次加载失败。 */
  failNextBundle(name, error = new Error(`模拟分包加载失败：${name}`)) {
    this._failures.set(name, error);
  }

  /** 模拟加载分包。 */
  loadBundle(name, callback) {
    this.loadBundleCount += 1;
    const request = { name, callback };
    if (this._deferredBundleNames.delete(name)) {
      this._pendingLoads.push(request);
      return;
    }
    this._finishLoad(request);
  }

  /** 完成指定分包最早的等待请求。 */
  completeNextBundle(name) {
    const index = this._pendingLoads.findIndex(
      (request) => name === undefined || request.name === name,
    );
    if (index < 0) {
      throw new Error(`没有等待中的分包请求：${name ?? "任意分包"}`);
    }
    const [request] = this._pendingLoads.splice(index, 1);
    this._finishLoad(request);
  }

  /** 根据注册状态结束分包请求。 */
  _finishLoad(request) {
    const failure = this._failures.get(request.name);
    if (failure) {
      this._failures.delete(request.name);
      request.callback(failure, null);
      return;
    }
    const bundle = this._bundles.get(request.name);
    request.callback(
      bundle ? null : new Error(`模拟分包不存在：${request.name}`),
      bundle ?? null,
    );
  }

  /** 模拟移除分包。 */
  removeBundle(bundle) {
    this.removedBundles.push(bundle);
  }

  /** 清空 AssetManager 状态。 */
  reset() {
    this._bundles.clear();
    this._deferredBundleNames.clear();
    this._failures.clear();
    this._pendingLoads.length = 0;
    this.removedBundles.length = 0;
    this.loadBundleCount = 0;
  }
}

/** 测试专用场景 Director。 */
class MockDirector {
  /** Creator Scheduler。 */
  scheduler = new MockScheduler();

  /** 当前场景。 */
  _scene = null;

  /** 后续场景加载行为队列。 */
  _loadBehaviors = [];

  /** 尚未完成的场景请求。 */
  _pendingLoads = [];

  /** 当前注册的常驻根节点。 */
  _persistRootNodes = new Set();

  /** 场景加载调用记录。 */
  loadCalls = [];

  /** 返回 Scheduler。 */
  getScheduler() {
    return this.scheduler;
  }

  /** 返回当前场景。 */
  getScene() {
    return this._scene;
  }

  /** 设置当前测试场景名。 */
  setSceneName(name) {
    const scene = name ? new Node(name) : null;
    if (scene) {
      for (const node of this._persistRootNodes) {
        if (node.isValid) {
          scene.addChild(node);
        }
      }
    }
    this._scene = scene;
  }

  /** 注册根层级常驻节点。 */
  addPersistRootNode(node) {
    if (!this._scene || node.parent !== this._scene) {
      throw new Error("常驻节点必须先加入当前场景根层级。");
    }
    this._persistRootNodes.add(node);
  }

  /** 取消根节点常驻状态。 */
  removePersistRootNode(node) {
    this._persistRootNodes.delete(node);
  }

  /** 判断节点是否已注册为常驻节点。 */
  isPersistRootNode(node) {
    return this._persistRootNodes.has(node);
  }

  /** 返回当前有效常驻根节点，供框架测试检查所有权。 */
  getPersistRootNodes() {
    return [...this._persistRootNodes].filter((node) => node.isValid);
  }

  /** 让下一次场景加载等待测试主动完成。 */
  deferNextLoad() {
    this._loadBehaviors.push({ type: "deferred" });
  }

  /** 让下一次场景加载通过回调失败。 */
  failNextLoad(error = new Error("模拟场景加载失败。")) {
    this._loadBehaviors.push({ type: "failed", error });
  }

  /** 让下一次场景加载同步抛错。 */
  throwNextLoad(error = new Error("模拟场景加载调用失败。")) {
    this._loadBehaviors.push({ type: "throw", error });
  }

  /** 模拟 Creator 场景加载。 */
  loadScene(name, callback) {
    this.loadCalls.push(name);
    const behavior = this._loadBehaviors.shift() ?? { type: "loaded" };
    if (behavior.type === "throw") {
      throw behavior.error;
    }
    if (behavior.type === "deferred") {
      this._pendingLoads.push({ name, callback });
      return;
    }
    if (behavior.type === "failed") {
      callback(behavior.error);
      return;
    }
    this.setSceneName(name);
    callback(null);
  }

  /** 完成最早等待中的场景请求。 */
  completeNextLoad(error = null) {
    const request = this._pendingLoads.shift();
    if (!request) {
      throw new Error("没有等待中的场景加载请求。");
    }
    if (!error) {
      this.setSceneName(request.name);
    }
    request.callback(error);
  }

  /** 清空 Director 状态。 */
  reset() {
    for (const node of this._persistRootNodes) {
      if (node.isValid) {
        node.destroy();
      }
    }
    this._persistRootNodes.clear();
    this.scheduler.reset();
    this._scene = null;
    this._loadBehaviors.length = 0;
    this._pendingLoads.length = 0;
    this.loadCalls.length = 0;
  }
}

/** Creator 常量模拟。 */
export const macro = {
  REPEAT_FOREVER: -1,
};

/** 全局 resources 加载器模拟。 */
export const resources = new MockLoader();

/** 全局 assetManager 模拟。 */
export const assetManager = new MockAssetManager();

/** 全局 director 模拟。 */
export const director = new MockDirector();

/** 测试专用 Game 生命周期事件名。 */
export class Game {
  /** 应用进入后台。 */
  static EVENT_HIDE = "game-on-hide";

  /** 应用回到前台。 */
  static EVENT_SHOW = "game-on-show";
}

/** 全局应用生命周期事件目标模拟。 */
export const game = new MockEventTarget();

/** Cocos 系统接口模拟。 */
export const sys = {
  localStorage: new MockLocalStorage(),
};

/** AssetManager 命名空间模拟。 */
export const AssetManager = {
  Bundle,
};

/** 装饰器模拟，保证 Creator 组件源码可在 Node 中完成转换和加载。 */
export const _decorator = {
  ccclass: () => (target) => target,
  property: () => () => undefined,
};

/** 测试控制入口，用于重置和主动推进模拟引擎状态。 */
export const __mock = {
  /** 重置全部 Cocos 模拟状态。 */
  reset() {
    resources.reset();
    assetManager.reset();
    director.reset();
    game.reset();
    Tween.reset();
    sys.localStorage.clear();
  },
};
