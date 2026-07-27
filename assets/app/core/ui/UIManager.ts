import { isValid, Node } from "cc";
import { ResManager } from "../resource/ResManager";
import type { PrefabInstance } from "../resource/ResManager";
import { Logger } from "../utils/Logger";
import { UIBase } from "./UIBase";

/**
 * UI 配置。
 *
 * 建议后续从 UIConfig.json 中读取，再统一注册到 UIManager。
 */
export interface UIConfig {
    /** UI 名称，例如 UISettingsPanel。 */
    name: string;

    /** Prefab 路径，不带扩展名。 */
    path: string;

    /** 所属 Asset Bundle，不填则从 resources 加载。 */
    bundleName?: string;

    /** 关闭后是否缓存节点。默认缓存。 */
    cache?: boolean;
}

/** UI 打开请求的最终状态。 */
export type UIOpenStatus = "opened" | "cancelled" | "failed";

/** UI 打开失败或取消时的明确原因。 */
export type UIOpenReason =
    | "missing-config"
    | "missing-path"
    | "invalid-root"
    | "prefab-load"
    | "missing-component"
    | "open-lifecycle"
    | "request-invalid";

/** UI 打开请求返回给场景层的结构化结果。 */
export interface UIOpenResult<T extends UIBase = UIBase> {
    /** 本次请求最终是成功、取消还是失败。 */
    readonly status: UIOpenStatus;

    /** 本次请求对应的 UI 注册名称。 */
    readonly name: string;

    /** 成功打开的面板；取消或失败时为 null。 */
    readonly panel: T | null;

    /** 取消或失败的具体阶段。 */
    readonly reason?: UIOpenReason;

    /** 底层资源加载或生命周期执行产生的原始错误。 */
    readonly error?: unknown;
}

/** 创建或复用面板节点时使用的内部结果。 */
interface UIPanelResolveResult<T extends UIBase> {
    /** 成功取得的面板组件。 */
    panel: T | null;

    /** 创建失败的具体阶段。 */
    reason?: UIOpenReason;

    /** 创建失败时保留的原始错误。 */
    error?: unknown;
}

/** 动态面板节点销毁前需要清理的组件和注册名称。 */
interface UIManagedPanelEntry {
    /** UIManager 中使用的注册名称。 */
    name: string;

    /** 节点仍完整时需要提前结束生命周期的面板组件。 */
    panel: UIBase;
}

/**
 * UI 管理器。
 *
 * 负责统一打开、关闭、显示、隐藏 UI 面板。
 */
export class UIManager {
    /** UI 挂载根节点。通常是 Canvas 下的 UI 根节点。 */
    private static _root: Node | null = null;

    /** UI 名称到配置的映射。 */
    private static readonly _configs: Map<string, UIConfig> = new Map();

    /** 当前已经打开过的 UI 组件。 */
    private static readonly _openedPanels: Map<string, UIBase> = new Map();

    /** 已缓存但未显示的 UI 节点。 */
    private static readonly _cachedNodes: Map<string, Node> = new Map();

    /** 动态节点到源 Prefab 资源句柄的映射，节点销毁时必须同步释放。 */
    private static readonly _prefabInstances: Map<Node, PrefabInstance> = new Map();

    /** 面板组件到所属节点的弱引用映射，组件销毁后 node 字段被清空时仍可安全清理。 */
    private static readonly _panelNodes: WeakMap<UIBase, Node> = new WeakMap();

    /** 节点销毁前需要结束生命周期的面板记录。 */
    private static readonly _managedPanels: Map<Node, UIManagedPanelEntry> = new Map();

    /** 已注册统一 NODE_DESTROYED 监听的节点，避免重复添加一次性回调。 */
    private static readonly _managedNodes: Set<Node> = new Set();

    /** 同名 UI 正在执行的打开任务，用于合并连续点击产生的并发请求。 */
    private static readonly _openingPromises: Map<string, Promise<UIOpenResult<UIBase>>> = new Map();

    /** 每个 UI 当前有效的打开请求版本，用于让关闭后的旧异步结果失效。 */
    private static readonly _openRequestVersions: Map<string, number> = new Map();

    /** UIManager 整体生命周期版本，clear 后旧任务不得再写回管理器。 */
    private static _lifecycleVersion = 0;

    /**
     * 初始化 UI 管理器。
     *
     * root 可以稍后通过 setRoot 设置。
     */
    public static init(root?: Node): void {
        if (root) {
            this.setRoot(root);
        }

        Logger.info("UI 管理器初始化完成。");
    }

    /**
     * 设置 UI 根节点。
     *
     * 所有动态打开的 UI 都会挂到这个节点下面。
     */
    public static setRoot(root: Node): void {
        this._root = root;
    }

    /**
     * 注册一个 UI 配置。
     */
    public static register(config: UIConfig): void {
        this._configs.set(config.name, config);
    }

    /**
     * 批量注册 UI 配置。
     */
    public static registerMany(configs: UIConfig[]): void {
        for (const config of configs) {
            this.register(config);
        }
    }

    /**
     * 挂载一个已经存在的 UI 面板。
     *
     * 适合调试阶段用代码创建 UI，或者接管场景里已经摆好的 UI 节点。
     */
    public static mount<T extends UIBase>(
        name: string,
        panel: T,
        config: Partial<Omit<UIConfig, "name">> = {},
    ): void {
        this.invalidateOpeningRequest(name);
        this._configs.set(name, {
            name,
            path: config.path ?? "",
            bundleName: config.bundleName,
            cache: config.cache ?? true,
        });

        const panelNode = panel.node;
        this.trackPanelNode(name, panel, panelNode);
        this._cachedNodes.set(name, panelNode);

        if (this._root && panelNode.parent !== this._root) {
            this._root.addChild(panelNode);
        }
    }

    /**
     * 打开 UI。
     *
     * @param name UI 名称
     * @param params 传给 UIBase.open 的参数
     */
    public static async open<T extends UIBase = UIBase>(
        name: string,
        params?: unknown,
    ): Promise<UIOpenResult<T>> {
        const config = this._configs.get(name);

        if (!config) {
            const error = new Error(`UI 配置不存在：${name}`);
            Logger.error(error.message);
            return this.failedResult(name, "missing-config", error);
        }

        const openedPanel = this._openedPanels.get(name);
        const openedNode = openedPanel ? this.getPanelNode(openedPanel) : null;
        if (
            openedPanel &&
            openedNode &&
            isValid(openedPanel, true) &&
            isValid(openedNode, true)
        ) {
            // open 只负责打开生命周期；已打开面板的数据变化由面板内部监听并刷新。
            if (!openedNode.active) {
                openedPanel.show();
            }
            return this.openedResult(name, openedPanel as T);
        }

        // 已销毁节点不能继续占用打开状态，否则后续请求会一直拿到无效组件。
        if (openedPanel) {
            this._openedPanels.delete(name);
            this._cachedNodes.delete(name);
            this.destroyManagedNode(openedNode);
        }

        const openingPromise = this._openingPromises.get(name);
        if (openingPromise) {
            // 加载中的重复请求直接复用首次任务，避免参数变化导致初始化逻辑重复执行。
            return openingPromise as Promise<UIOpenResult<T>>;
        }

        const requestVersion = (this._openRequestVersions.get(name) ?? 0) + 1;
        const lifecycleVersion = this._lifecycleVersion;
        this._openRequestVersions.set(name, requestVersion);

        const newOpeningPromise = this.openPanel<T>(
            config,
            params,
            requestVersion,
            lifecycleVersion,
        );

        this._openingPromises.set(
            name,
            newOpeningPromise as Promise<UIOpenResult<UIBase>>,
        );

        // Creator 当前编译目标不保证支持 Promise.finally，因此成功和失败都显式执行清理。
        void newOpeningPromise.then(
            () => this.finishOpeningRequest(name, newOpeningPromise),
            () => this.finishOpeningRequest(name, newOpeningPromise),
        );
        return newOpeningPromise;
    }

    /**
     * 完成单个 UI 的异步加载和打开流程。
     *
     * 请求版本会在 close 或 clear 时变化，旧请求即使加载完成也不能重新显示面板。
     */
    private static async openPanel<T extends UIBase>(
        config: UIConfig,
        params: unknown,
        requestVersion: number,
        lifecycleVersion: number,
    ): Promise<UIOpenResult<T>> {
        let resolved: UIPanelResolveResult<T>;
        try {
            resolved = await this.createOrReusePanel<T>(config);
        } catch (error) {
            // UIManager 的公开打开任务必须始终返回结果，不能把意外异常变成无人处理的 Promise。
            Logger.error(
                `UI 打开流程发生未预期异常：${config.name}，路径：${config.path}`,
                error,
            );
            return this.failedResult(config.name, "prefab-load", error);
        }
        const panel = resolved.panel;
        const panelNode = panel ? this.getPanelNode(panel) : null;
        if (
            !panel ||
            !panelNode ||
            !isValid(panel, true) ||
            !isValid(panelNode, true)
        ) {
            const reason = resolved.reason ?? "prefab-load";
            const error =
                resolved.error ??
                new Error(`UI 面板创建结果无效：${config.name}`);
            Logger.error(
                `UI 打开失败：${config.name}，阶段：${reason}，路径：${config.path}`,
                error,
            );
            return this.failedResult(config.name, reason, error);
        }

        if (!this.isOpeningRequestValid(config.name, requestVersion, lifecycleVersion)) {
            this.disposeAbandonedPanel(config.name, panel);
            return this.cancelledResult(config.name);
        }

        this._cachedNodes.delete(config.name);
        this._openedPanels.set(config.name, panel);
        try {
            panel.open(params);
            return this.openedResult(config.name, panel);
        } catch (error) {
            // 生命周期执行失败的面板不能继续缓存或占用打开状态，否则后续 open 会复用残缺实例。
            this._openedPanels.delete(config.name);
            this._cachedNodes.delete(config.name);
            Logger.error(`UI 生命周期打开失败：${config.name}`, error);
            this.destroyManagedNode(panelNode);
            return this.failedResult(config.name, "open-lifecycle", error);
        }
    }

    /**
     * 关闭 UI。
     *
     * @param name UI 名称
     * @param destroy 是否销毁节点，默认按配置决定是否缓存
     */
    public static close(name: string, destroy = false): void {
        this.invalidateOpeningRequest(name);

        const panel = this._openedPanels.get(name);

        if (!panel) {
            // 缓存面板虽然没有打开，但 destroy=true 时仍应按调用方要求彻底销毁。
            if (destroy) {
                const cachedNode = this._cachedNodes.get(name);
                this._cachedNodes.delete(name);
                if (cachedNode) {
                    this.destroyManagedNode(cachedNode);
                }
            }
            return;
        }

        const panelNode = this.getPanelNode(panel);
        const config = this._configs.get(name);
        const shouldCache = config?.cache ?? true;
        this._openedPanels.delete(name);

        // 场景树可能已经提交节点销毁，此时不得再访问被 Cocos 清空的组件字段。
        if (
            !panelNode ||
            !isValid(panel, true) ||
            !isValid(panelNode, true)
        ) {
            this._cachedNodes.delete(name);
            this.destroyManagedNode(panelNode);
            return;
        }

        let closeFailed = false;
        try {
            panel.close();
        } catch (error) {
            closeFailed = true;
            Logger.error(`UI 生命周期关闭失败：${name}`, error);
        }

        // 关闭失败说明面板内部状态不再可信，必须销毁，不能放回缓存复用。
        if (closeFailed || destroy || !shouldCache) {
            this._cachedNodes.delete(name);
            this.destroyManagedNode(panelNode);
            return;
        }

        this._cachedNodes.set(name, panelNode);
    }

    /**
     * 关闭全部已打开 UI。
     */
    public static closeAll(destroy = false): void {
        const names = Array.from(this._openedPanels.keys());

        for (const name of names) {
            this.close(name, destroy);
        }
    }

    /**
     * 获取当前已打开的 UI 面板。
     */
    public static get<T extends UIBase = UIBase>(name: string): T | null {
        const panel = this._openedPanels.get(name);
        const panelNode = panel ? this.getPanelNode(panel) : null;
        if (
            !panel ||
            !panelNode ||
            !isValid(panel, true) ||
            !isValid(panelNode, true)
        ) {
            if (panel) {
                this._openedPanels.delete(name);
            }
            return null;
        }
        return panel as T;
    }

    /**
     * 判断 UI 是否已经打开。
     */
    public static isOpened(name: string): boolean {
        return this.get(name) !== null;
    }

    /**
     * 清空 UI 管理器状态。
     *
     * 一般用于切换账号、重启游戏或测试。
     */
    public static clear(): void {
        // 先提升整体版本，让尚未完成的资源加载结果全部失效。
        this._lifecycleVersion += 1;
        this._openingPromises.clear();
        this.closeAll(true);

        for (const node of this._cachedNodes.values()) {
            this.destroyManagedNode(node);
        }

        this._cachedNodes.clear();
        // 防御性兜底：任何未进入 opened/cached 表的异步实例也必须归还 Prefab 所有权。
        for (const node of Array.from(this._prefabInstances.keys())) {
            this.destroyManagedNode(node);
        }
        this._openRequestVersions.clear();
        this._configs.clear();
        this._root = null;
    }

    /** 使指定 UI 当前尚未结束的打开任务失效。 */
    private static invalidateOpeningRequest(name: string): void {
        const nextVersion = (this._openRequestVersions.get(name) ?? 0) + 1;
        this._openRequestVersions.set(name, nextVersion);
        this._openingPromises.delete(name);
    }

    /** 打开任务结束后清理对应记录，但不得误删后来创建的新任务。 */
    private static finishOpeningRequest(
        name: string,
        promise: Promise<UIOpenResult<UIBase>>,
    ): void {
        if (this._openingPromises.get(name) === promise) {
            this._openingPromises.delete(name);
        }
    }

    /** 判断异步打开结果是否仍属于当前 UIManager 状态。 */
    private static isOpeningRequestValid(
        name: string,
        requestVersion: number,
        lifecycleVersion: number,
    ): boolean {
        return (
            lifecycleVersion === this._lifecycleVersion &&
            requestVersion === this._openRequestVersions.get(name)
        );
    }

    /**
     * 处理已经失效的异步加载结果。
     *
     * 原本来自缓存的节点继续保持缓存；新实例没有管理器持有者，必须直接销毁。
     */
    private static disposeAbandonedPanel(name: string, panel: UIBase): void {
        const panelNode = this.getPanelNode(panel);
        if (!panelNode) {
            return;
        }
        if (
            this._cachedNodes.get(name) === panelNode &&
            isValid(panel, true) &&
            isValid(panelNode, true)
        ) {
            try {
                panel.close();
            } catch (error) {
                // 缓存面板若连取消清理都失败，必须销毁，不能把不可信状态留给下一次打开。
                this._cachedNodes.delete(name);
                Logger.error(`取消 UI 打开请求时关闭缓存面板失败：${name}`, error);
                this.destroyManagedNode(panelNode);
            }
            return;
        }

        if (this._cachedNodes.get(name) === panelNode) {
            this._cachedNodes.delete(name);
        }
        this.destroyManagedNode(panelNode);
    }

    /**
     * 创建或复用 UI 面板。
     */
    private static async createOrReusePanel<T extends UIBase>(
        config: UIConfig,
    ): Promise<UIPanelResolveResult<T>> {
        let node = this._cachedNodes.get(config.name) ?? null;
        let createdNode = false;

        if (!node || !isValid(node, true)) {
            if (node) {
                this._cachedNodes.delete(config.name);
                this.destroyManagedNode(node);
            }
            if (!config.path) {
                return {
                    panel: null,
                    reason: "missing-path",
                    error: new Error(`UI 配置缺少 Prefab 路径：${config.name}`),
                };
            }

            try {
                const prefabInstance = await ResManager.instantiatePrefab(
                    config.path,
                    {
                        bundleName: config.bundleName,
                    },
                );
                node = prefabInstance.node;
                createdNode = true;
                this.trackPrefabInstance(prefabInstance);

                // 新实例挂到场景前先保持隐藏，避免 Prefab 默认文本在业务数据填充前显示一帧。
                node.active = false;
            } catch (error) {
                if (createdNode && node) {
                    this.destroyManagedNode(node);
                }
                return { panel: null, reason: "prefab-load", error };
            }
        }

        const root = this._root;
        if (!root || !isValid(root, true)) {
            if (createdNode) {
                this.destroyManagedNode(node);
            }
            return {
                panel: null,
                reason: "invalid-root",
                error: new Error(`UI 根节点不可用：${config.name}`),
            };
        }

        try {
            if (node.parent !== root) {
                root.addChild(node);
            }
        } catch (error) {
            if (createdNode) {
                this.destroyManagedNode(node);
            }
            return { panel: null, reason: "invalid-root", error };
        }

        const panel = node.getComponent(UIBase) as T | null;

        if (!panel) {
            Logger.warn(`UI 节点缺少 UIBase 组件：${config.name}`);
            this.destroyManagedNode(node);
            return {
                panel: null,
                reason: "missing-component",
                error: new Error(`UI 节点缺少 UIBase 组件：${config.name}`),
            };
        }

        this.trackPanelNode(config.name, panel, node);
        return { panel };
    }

    /** 创建成功打开结果，保证所有调用方读取统一字段。 */
    private static openedResult<T extends UIBase>(
        name: string,
        panel: T,
    ): UIOpenResult<T> {
        return { status: "opened", name, panel };
    }

    /** 创建因关闭、切场景或后发请求而失效的取消结果。 */
    private static cancelledResult<T extends UIBase>(
        name: string,
    ): UIOpenResult<T> {
        return {
            status: "cancelled",
            name,
            panel: null,
            reason: "request-invalid",
        };
    }

    /** 创建保留失败阶段和原始错误的结果。 */
    private static failedResult<T extends UIBase>(
        name: string,
        reason: UIOpenReason,
        error: unknown,
    ): UIOpenResult<T> {
        return { status: "failed", name, panel: null, reason, error };
    }

    /**
     * 销毁动态 UI 节点并归还它持有的源 Prefab 资源所有权。
     *
     * 节点可能已被场景提前销毁，因此释放句柄不能依赖 node.isValid；该函数可重复调用。
     */
    private static destroyManagedNode(node: Node | null): void {
        if (!node) {
            return;
        }
        if (isValid(node, true)) {
            node.destroy();
            return;
        }

        // 已完成销毁的节点执行兜底；已提交 destroy 的节点等待 NODE_DESTROYED 统一清理。
        if (!node.isValid) {
            this.handleManagedNodeDestroyed(node);
        }
    }

    /**
     * 记录动态实例，并从创建时就监听节点销毁。
     *
     * 节点可能随 Scene 被外部销毁，不能只依赖 UIManager.close 才归还 Prefab 所有权。
     */
    private static trackPrefabInstance(prefabInstance: PrefabInstance): void {
        const node = prefabInstance.node;
        this._prefabInstances.set(node, prefabInstance);
        this.ensureManagedNodeDestroyListener(node);
    }

    /**
     * 记录面板和所属节点的稳定关系。
     *
     * Component 完成销毁后自身 node 字段会被引擎置空，因此后续清理不能临时读取它。
     */
    private static trackPanelNode(name: string, panel: UIBase, node: Node): void {
        this._panelNodes.set(panel, node);
        this._managedPanels.set(node, { name, panel });
        this.ensureManagedNodeDestroyListener(node);
    }

    /** 取得面板创建时记录的节点，兼容组件已被 Cocos 清空 node 字段的阶段。 */
    private static getPanelNode(panel: UIBase): Node | null {
        const trackedNode = this._panelNodes.get(panel);
        if (trackedNode) {
            return trackedNode;
        }

        const panelNode = panel.node as Node | null;
        if (panelNode) {
            this._panelNodes.set(panel, panelNode);
        }
        return panelNode;
    }

    /** 为节点注册唯一销毁监听；回调触发时子节点和 Inspector 绑定仍然有效。 */
    private static ensureManagedNodeDestroyListener(node: Node): void {
        if (this._managedNodes.has(node)) {
            return;
        }
        this._managedNodes.add(node);
        node.once(
            Node.EventType.NODE_DESTROYED,
            this.handleManagedNodeDestroyed,
            this,
        );
    }

    /**
     * 节点开始销毁时提前结束 UI 生命周期，再归还 Prefab 资源所有权。
     *
     * Cocos 的 NODE_DESTROYED 事件早于子节点销毁；这是最后一个能安全访问按钮、
     * Label 和其他动态子节点的阶段，同时也让稍后的场景 onExit 只执行幂等空清理。
     */
    private static handleManagedNodeDestroyed(node: Node): void {
        this._managedNodes.delete(node);
        const entry = this._managedPanels.get(node);
        if (entry) {
            this._managedPanels.delete(node);
            if (this._openedPanels.get(entry.name) === entry.panel) {
                this._openedPanels.delete(entry.name);
            }
            if (this._cachedNodes.get(entry.name) === node) {
                this._cachedNodes.delete(entry.name);
            }
            try {
                entry.panel.disposeBeforeNodeDestroy();
            } catch (error) {
                Logger.error(`UI 节点销毁前清理失败：${entry.name}`, error);
            }
        }
        this.releaseManagedNodeResources(node);
    }

    /** 移除 Prefab 跟踪记录并幂等归还源资源所有权。 */
    private static releaseManagedNodeResources(node: Node): void {
        const prefabInstance = this._prefabInstances.get(node);
        if (!prefabInstance) {
            return;
        }
        this._prefabInstances.delete(node);
        prefabInstance.release();
    }
}
