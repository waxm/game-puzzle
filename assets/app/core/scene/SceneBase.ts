import { _decorator, Asset, Component, Tween, isValid } from "cc";
import { EventCenter } from "../event/EventCenter";
import { ResManager } from "../resource/ResManager";
import type {
    LoadOptions,
    ResourceHandle,
} from "../resource/ResManager";
import { TimerManager } from "../timer/TimerManager";
import { Logger } from "../utils/Logger";

const { ccclass } = _decorator;

/**
 * 场景脚本基类。
 *
 * 启动、菜单、玩法和结算等场景脚本都可以继承它，统一场景进入、失败回滚和退出清理。
 */
@ccclass("SceneBase")
export class SceneBase extends Component {
    /** 场景名；子类不设置时使用节点名或类名。 */
    protected _sceneName = "";

    /** 是否已经开始执行场景加载生命周期。 */
    private _lifecycleStarted = false;

    /** 是否已经开始绑定场景事件，包括只完成部分绑定后抛错的情况。 */
    private _eventsBindingStarted = false;

    /** 是否已经开始执行 onEnter，包括初始化中途抛错的情况。 */
    private _enterStarted = false;

    /** 是否已经进入统一清理流程，用于保证失败回滚和销毁不会重复执行。 */
    private _cleanupStarted = false;

    /** 当前场景作用域持有的全部资源句柄。 */
    private readonly _resourceHandles: Set<ResourceHandle<Asset>> = new Set();

    /** 获取当前场景名。 */
    public get sceneName(): string {
        return this._sceneName || this.node.name || this.constructor.name;
    }

    /**
     * 校验场景脚本在 Inspector 中声明的必填引用。
     *
     * 场景结构缺失时立即中断启动，避免运行时创建替代节点掩盖绑定错误。
     */
    protected assertRequiredBindings(bindings: Record<string, unknown>): void {
        const missingNames = Object.keys(bindings).filter(
            (name) => bindings[name] === null || bindings[name] === undefined,
        );
        if (missingNames.length > 0) {
            throw new Error(
                `Scene 节点未绑定：${this.node.name}.${missingNames.join("、")}`,
            );
        }
    }

    /**
     * 托管场景发起但不需要同步等待的异步任务。
     *
     * 业务函数仍应自行处理资源加载失败等预期结果；这里负责接住真正遗漏的异常，
     * 保证按钮事件和 Cocos 生命周期不会产生 Unhandled Promise Rejection。
     */
    protected runAsyncTask(task: Promise<unknown>, description: string): void {
        void task.catch((error) => {
            Logger.error(`${this.sceneName} 场景异步任务失败：${description}`, error);
        });
    }

    /**
     * 通过 ResManager 获取资源并自动加入当前场景作用域。
     *
     * 如果资源加载期间场景已经退出，句柄会立即释放并抛出明确错误，旧异步结果不会重新
     * 写入已经销毁的场景。调用方可使用 releaseResource 提前归还不再需要的资源。
     */
    protected async acquireResource<T extends Asset>(
        path: string,
        type: new (...args: any[]) => T,
        options: LoadOptions = {},
    ): Promise<ResourceHandle<T>> {
        const handle = await ResManager.acquire(path, type, options);
        return this.trackResource(handle);
    }

    /**
     * 把外部已经取得的资源句柄纳入场景作用域。
     *
     * 该方法让特殊加载流程仍能复用 SceneBase 的最终兜底释放，不要求重复 acquire。
     */
    protected trackResource<T extends Asset>(
        handle: ResourceHandle<T>,
    ): ResourceHandle<T> {
        if (
            this._cleanupStarted ||
            !isValid(this, true) ||
            !isValid(this.node, true)
        ) {
            handle.release();
            throw new Error(`${this.sceneName} 场景已经退出，资源结果已释放：${handle.path}`);
        }

        this._resourceHandles.add(handle as ResourceHandle<Asset>);
        return handle;
    }

    /** 提前释放当前场景持有的单个资源句柄。 */
    protected releaseResource<T extends Asset>(handle: ResourceHandle<T>): void {
        this._resourceHandles.delete(handle as ResourceHandle<Asset>);
        handle.release();
    }

    /**
     * Cocos 生命周期：节点加载时调用。
     *
     * 先绑定事件再执行进入逻辑，确保 onEnter 同步派发的事件不会丢失。任一步骤抛错都会
     * 立即执行统一清理，然后重新抛出原始错误，让开发阶段保留清晰的首个失败原因。
     */
    protected onLoad(): void {
        if (this._lifecycleStarted) {
            Logger.warn(`${this.sceneName} 场景生命周期已经启动，跳过重复 onLoad。`);
            return;
        }
        this._lifecycleStarted = true;

        try {
            this._eventsBindingStarted = true;
            this.bindEvents();
            this._enterStarted = true;
            this.onEnter();
        } catch (error) {
            Logger.error(`${this.sceneName} 场景进入失败，开始回滚。`, error);
            this.cleanupScene();
            throw error;
        }
    }

    /**
     * Cocos 生命周期：节点销毁时调用。
     *
     * 正常退出和进入失败使用同一个幂等清理入口，保证 onDestroy 重复到达时不会重复释放。
     */
    protected onDestroy(): void {
        this.cleanupScene();
    }

    /** 场景进入时调用；子类在这里初始化场景数据、节点和 UI。 */
    protected onEnter(): void {
        // 子类重写：处理场景进入时的初始化逻辑。
    }

    /** 场景退出时调用；子类在这里释放自己明确持有的业务状态。 */
    protected onExit(): void {
        // 子类重写：处理场景退出时的清理逻辑。
    }

    /** 注册场景事件；子类统一在这里监听 EventCenter 或节点事件。 */
    protected bindEvents(): void {
        // 子类重写：注册当前场景需要监听的事件。
    }

    /** 注销场景事件；子类应优先精确取消自己注册的监听。 */
    protected unbindEvents(): void {
        // 子类重写：注销当前场景监听的事件。
    }

    /**
     * 执行一次完整场景清理。
     *
     * 子类清理、框架兜底和资源释放逐项隔离；任何一步失败都只记录错误，不会阻断后续步骤。
     * 最终兜底只清理 target/owner 为当前 SceneBase 的内容，不会误删其他组件的监听和计时器。
     */
    private cleanupScene(): void {
        if (this._cleanupStarted) {
            return;
        }
        this._cleanupStarted = true;

        if (this._eventsBindingStarted) {
            this.runCleanupStep("注销场景事件", () => this.unbindEvents());
        }
        if (this._enterStarted) {
            this.runCleanupStep("执行场景退出逻辑", () => this.onExit());
        }

        this.runCleanupStep("清理 EventCenter 监听", () =>
            EventCenter.clear(this),
        );
        this.runCleanupStep("清理场景归属计时器", () =>
            TimerManager.clearByOwner(this),
        );
        this.runCleanupStep("清理组件 Schedule", () =>
            this.unscheduleAllCallbacks(),
        );
        this.runCleanupStep("清理节点目标监听", () =>
            this.node.targetOff(this),
        );
        this.runCleanupStep("停止场景脚本 Tween", () =>
            Tween.stopAllByTarget(this),
        );
        this.runCleanupStep("停止场景根节点 Tween", () =>
            Tween.stopAllByTarget(this.node),
        );
        this.releaseTrackedResources();
    }

    /** 隔离单个清理步骤，确保后续兜底操作始终得到执行。 */
    private runCleanupStep(description: string, callback: () => void): void {
        try {
            callback();
        } catch (error) {
            Logger.error(`${this.sceneName} 场景清理失败：${description}`, error);
        }
    }

    /** 逐个释放场景作用域资源；单个异常不能阻断其他句柄归还。 */
    private releaseTrackedResources(): void {
        const handles = Array.from(this._resourceHandles);
        this._resourceHandles.clear();
        for (const handle of handles) {
            this.runCleanupStep(`释放场景资源 ${handle.path}`, () =>
                handle.release(),
            );
        }
    }
}
