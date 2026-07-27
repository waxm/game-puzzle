import {
    Asset,
    AssetManager,
    JsonAsset,
    Node,
    Prefab,
    assetManager,
    instantiate,
    resources,
} from "cc";
import { Logger } from "../utils/Logger";

/** 资源加载位置。 */
export interface LoadOptions {
    /** Asset Bundle 名称，不传时从 resources 加载。 */
    bundleName?: string;
}

/**
 * 资源所有权句柄。
 *
 * 每次 acquire 都会为资源增加一次引用；持有者不再使用资源时必须调用 release。
 * release 可以重复调用，只有第一次会真正减少引用计数。
 */
export interface ResourceHandle<T extends Asset> {
    /** 当前句柄持有的资源。 */
    readonly asset: T;

    /** 不带扩展名的资源加载路径。 */
    readonly path: string;

    /** 资源所属分包；null 表示 resources。 */
    readonly bundleName: string | null;

    /** 句柄是否已经释放。 */
    readonly released: boolean;

    /** 归还本次 acquire 取得的资源所有权。 */
    release(): void;
}

/** Prefab 实例及其源 Prefab 资源所有权。 */
export interface PrefabInstance {
    /** 实例化得到的节点。 */
    readonly node: Node;

    /** 源 Prefab 的资源句柄。 */
    readonly prefabHandle: ResourceHandle<Prefab>;

    /** 释放源 Prefab 所有权；调用方应先销毁不再使用的实例节点。 */
    release(): void;
}

/** ResManager 内部使用的可幂等释放句柄。 */
class ManagedResourceHandle<T extends Asset> implements ResourceHandle<T> {
    /** 当前句柄是否已经归还所有权。 */
    private _released = false;

    /** 返回句柄释放状态。 */
    public get released(): boolean {
        return this._released;
    }

    /** 创建一个与单次 acquire 一一对应的资源句柄。 */
    public constructor(
        public readonly asset: T,
        public readonly path: string,
        public readonly bundleName: string | null,
        private readonly _onRelease: (handle: ManagedResourceHandle<T>) => void,
    ) {}

    /** 幂等归还资源引用，避免清理链路重复执行时发生 decRef 过量。 */
    public release(): void {
        if (this._released) {
            return;
        }
        this._released = true;
        this._onRelease(this);
    }
}

/** 资源管理器，统一处理加载、所有权和 Asset Bundle 生命周期。 */
export class ResManager {
    /** 已完成加载并由资源管理器记录的 Asset Bundle。 */
    private static readonly _bundles: Map<string, AssetManager.Bundle> = new Map();

    /** 正在加载的 Asset Bundle 任务，用于合并同名并发请求。 */
    private static readonly _bundleLoadPromises: Map<string, Promise<AssetManager.Bundle>> = new Map();

    /** 分包名到当前请求编号的映射，用于使移除或重置前的异步结果失效。 */
    private static readonly _bundleLoadRequestIds: Map<string, number> = new Map();

    /** 当前仍由业务持有的资源句柄。 */
    private static readonly _activeHandles: Set<ResourceHandle<Asset>> = new Set();

    /** 资源键到业务引用次数的映射，用于诊断泄漏并保护仍在使用的分包。 */
    private static readonly _referenceCounts: Map<string, number> = new Map();

    /** 全局递增的分包请求编号。 */
    private static _nextBundleLoadRequestId = 1;

    /** 资源管理器生命周期版本，重置前发起的加载不得写回新状态。 */
    private static _lifecycleVersion = 0;

    /**
     * 加载 Asset Bundle。
     *
     * 同名并发请求会复用一个 Promise；removeBundle 或 reset 会使尚未完成的旧请求失效。
     */
    public static loadBundle(bundleName: string): Promise<AssetManager.Bundle> {
        const cachedBundle = this._bundles.get(bundleName);
        if (cachedBundle) {
            return Promise.resolve(cachedBundle);
        }

        const loadingPromise = this._bundleLoadPromises.get(bundleName);
        if (loadingPromise) {
            return loadingPromise;
        }

        const lifecycleVersion = this._lifecycleVersion;
        const requestId = this._nextBundleLoadRequestId++;
        this._bundleLoadRequestIds.set(bundleName, requestId);
        const promise = new Promise<AssetManager.Bundle>((resolve, reject) => {
            assetManager.loadBundle(bundleName, (error, bundle) => {
                const isCurrentRequest = this._bundleLoadRequestIds.get(bundleName) === requestId;
                if (isCurrentRequest) {
                    this._bundleLoadPromises.delete(bundleName);
                    this._bundleLoadRequestIds.delete(bundleName);
                }

                if (error || !bundle) {
                    const reason = error ?? new Error(`分包加载结果为空：${bundleName}`);
                    Logger.error(`分包加载失败：${bundleName}`, reason);
                    reject(reason);
                    return;
                }

                // 移除、重置或后发请求会让本次结果失去所有者，旧结果不得重新进入缓存。
                if (!isCurrentRequest || lifecycleVersion !== this._lifecycleVersion) {
                    const newerRequestExists = this._bundleLoadRequestIds.has(bundleName);
                    if (!newerRequestExists && !this.hasActiveBundleHandles(bundleName)) {
                        assetManager.removeBundle(bundle);
                    }
                    reject(new Error(`分包加载请求已失效：${bundleName}`));
                    return;
                }

                this._bundles.set(bundleName, bundle);
                Logger.info(`分包加载完成：${bundleName}`);
                resolve(bundle);
            });
        });

        // 引擎可能同步执行回调，已结束的请求不能重新写回任务表。
        if (this._bundleLoadRequestIds.get(bundleName) === requestId) {
            this._bundleLoadPromises.set(bundleName, promise);
        }
        return promise;
    }

    /** 获取已经加载过的 Asset Bundle。 */
    public static getBundle(bundleName: string): AssetManager.Bundle | null {
        return this._bundles.get(bundleName) ?? null;
    }

    /**
     * 加载资源并取得一次明确所有权。
     *
     * 成功后资源会 addRef；调用方必须保存返回句柄，并在节点、音频或业务状态不再使用时 release。
     */
    public static async acquire<T extends Asset>(
        path: string,
        type: new (...args: any[]) => T,
        options: LoadOptions = {},
    ): Promise<ResourceHandle<T>> {
        const lifecycleVersion = this._lifecycleVersion;
        const asset = await this.loadAsset(path, type, options);
        // load 回调 resolve 后到本函数继续执行前仍可能发生 reset，因此建立引用前再校验一次。
        this.assertLifecycle(lifecycleVersion, path, options.bundleName);
        asset.addRef();

        const handle = new ManagedResourceHandle(
            asset,
            path,
            options.bundleName ?? null,
            (releasedHandle) => this.releaseHandle(releasedHandle),
        );
        this._activeHandles.add(handle);
        const key = this.createResourceKey(path, options.bundleName);
        this._referenceCounts.set(key, (this._referenceCounts.get(key) ?? 0) + 1);
        return handle;
    }

    /**
     * 加载目录资源并为每项建立独立所有权。
     *
     * 调用方可按实际使用时机逐个释放；发生中途异常时不会遗留已经 addRef 的半成品句柄。
     */
    public static async acquireDir<T extends Asset>(
        path: string,
        type: new (...args: any[]) => T,
        options: LoadOptions = {},
    ): Promise<ResourceHandle<T>[]> {
        const lifecycleVersion = this._lifecycleVersion;
        const loader = await this.getLoader(options.bundleName);
        this.assertLifecycle(lifecycleVersion, path, options.bundleName);

        const assets = await new Promise<T[]>((resolve, reject) => {
            loader.loadDir(path, type, (error: Error | null, result: T[]) => {
                if (error || !result) {
                    const reason = error ?? new Error("资源目录加载结果为空。");
                    Logger.error(`资源目录加载失败：${this.describeLocation(path, options.bundleName)}`, reason);
                    reject(reason);
                    return;
                }
                try {
                    this.assertLifecycle(lifecycleVersion, path, options.bundleName);
                    resolve(result);
                } catch (reason) {
                    reject(reason);
                }
            });
        });

        // Promise 回调结束与当前 continuation 之间也存在重置窗口，addRef 前必须二次确认。
        this.assertLifecycle(lifecycleVersion, path, options.bundleName);
        return Promise.all(assets.map((asset) => this.retainLoadedAsset(asset, path, options.bundleName)));
    }

    /** 加载 JSON 配置，并在取出普通数据后立即归还 JsonAsset 所有权。 */
    public static async loadJson<T = unknown>(path: string, options: LoadOptions = {}): Promise<T> {
        const handle = await this.acquire(path, JsonAsset, options);
        try {
            return handle.asset.json as T;
        } finally {
            handle.release();
        }
    }

    /** 加载并实例化 Prefab，返回节点以及必须随节点销毁而释放的源资源句柄。 */
    public static async instantiatePrefab(path: string, options: LoadOptions = {}): Promise<PrefabInstance> {
        const prefabHandle = await this.acquire(path, Prefab, options);
        try {
            const node = instantiate(prefabHandle.asset);
            return {
                node,
                prefabHandle,
                release: () => prefabHandle.release(),
            };
        } catch (error) {
            prefabHandle.release();
            throw error;
        }
    }

    /** 返回指定资源当前由业务持有的引用次数，主要用于调试释放问题。 */
    public static getReferenceCount(path: string, options: LoadOptions = {}): number {
        return this._referenceCounts.get(this.createResourceKey(path, options.bundleName)) ?? 0;
    }

    /** 返回当前尚未释放的全部业务句柄数量。 */
    public static getActiveHandleCount(): number {
        return this._activeHandles.size;
    }

    /**
     * 移除指定分包。
     *
     * 只要分包内仍有业务句柄就拒绝移除；这是强约束，不能用 removeBundle 绕过资源所有权。
     */
    public static removeBundle(bundleName: string): boolean {
        if (this.hasActiveBundleHandles(bundleName)) {
            Logger.warn(`分包仍有资源被持有，拒绝移除：${bundleName}`);
            return false;
        }

        // 即使分包还在加载也要使请求失效，防止回调稍后重新写入缓存。
        this._bundleLoadPromises.delete(bundleName);
        this._bundleLoadRequestIds.delete(bundleName);
        const bundle = this._bundles.get(bundleName);
        if (bundle) {
            assetManager.removeBundle(bundle);
            this._bundles.delete(bundleName);
            Logger.info(`分包已移除：${bundleName}`);
        }
        return true;
    }

    /**
     * 重置资源管理器。
     *
     * 先使旧异步请求失效，再释放所有尚未归还的业务句柄，最后移除分包；顺序不可颠倒。
     */
    public static reset(): void {
        this._lifecycleVersion += 1;
        this._bundleLoadPromises.clear();
        this._bundleLoadRequestIds.clear();

        const handles = Array.from(this._activeHandles);
        for (const handle of handles) {
            handle.release();
        }

        const bundleNames = Array.from(this._bundles.keys());
        for (const bundleName of bundleNames) {
            this.removeBundle(bundleName);
        }
        this._referenceCounts.clear();
    }

    /** 加载单个资源，但不在这里建立所有权；仅供 acquire 内部调用。 */
    private static async loadAsset<T extends Asset>(
        path: string,
        type: new (...args: any[]) => T,
        options: LoadOptions,
    ): Promise<T> {
        const lifecycleVersion = this._lifecycleVersion;
        const loader = await this.getLoader(options.bundleName);
        this.assertLifecycle(lifecycleVersion, path, options.bundleName);

        return new Promise((resolve, reject) => {
            loader.load(path, type, (error: Error | null, asset: T) => {
                if (error || !asset) {
                    const reason = error ?? new Error("资源加载结果为空。");
                    Logger.error(`资源加载失败：${this.describeLocation(path, options.bundleName)}`, reason);
                    reject(reason);
                    return;
                }
                try {
                    this.assertLifecycle(lifecycleVersion, path, options.bundleName);
                    resolve(asset);
                } catch (reason) {
                    reject(reason);
                }
            });
        });
    }

    /** 为 loadDir 已返回的资源建立所有权，保持引用统计入口唯一。 */
    private static retainLoadedAsset<T extends Asset>(
        asset: T,
        path: string,
        bundleName?: string,
    ): ResourceHandle<T> {
        asset.addRef();
        const handle = new ManagedResourceHandle(
            asset,
            path,
            bundleName ?? null,
            (releasedHandle) => this.releaseHandle(releasedHandle),
        );
        this._activeHandles.add(handle);
        const key = this.createResourceKey(path, bundleName);
        this._referenceCounts.set(key, (this._referenceCounts.get(key) ?? 0) + 1);
        return handle;
    }

    /** 处理单个句柄归还，确保引用统计和 Asset.decRef 始终成对发生。 */
    private static releaseHandle<T extends Asset>(handle: ManagedResourceHandle<T>): void {
        if (!this._activeHandles.delete(handle)) {
            return;
        }

        const key = this.createResourceKey(handle.path, handle.bundleName ?? undefined);
        const count = this._referenceCounts.get(key) ?? 0;
        if (count <= 1) {
            this._referenceCounts.delete(key);
        } else {
            this._referenceCounts.set(key, count - 1);
        }
        handle.asset.decRef();
    }

    /** 根据加载选项取得 resources 或指定 Asset Bundle。 */
    private static async getLoader(bundleName?: string): Promise<typeof resources | AssetManager.Bundle> {
        return bundleName ? this.loadBundle(bundleName) : resources;
    }

    /** 旧生命周期的异步结果必须失败，不能继续建立业务引用。 */
    private static assertLifecycle(version: number, path: string, bundleName?: string): void {
        if (version !== this._lifecycleVersion) {
            throw new Error(`资源加载已因管理器重置而失效：${this.describeLocation(path, bundleName)}`);
        }
    }

    /** 判断指定分包是否仍有业务所有权未归还。 */
    private static hasActiveBundleHandles(bundleName: string): boolean {
        for (const handle of this._activeHandles) {
            if (handle.bundleName === bundleName) {
                return true;
            }
        }
        return false;
    }

    /** 创建稳定的资源引用统计键。 */
    private static createResourceKey(path: string, bundleName?: string): string {
        return `${bundleName ?? "resources"}:${path}`;
    }

    /** 生成包含加载器来源的日志位置。 */
    private static describeLocation(path: string, bundleName?: string): string {
        return `${bundleName ?? "resources"}/${path}`;
    }
}
