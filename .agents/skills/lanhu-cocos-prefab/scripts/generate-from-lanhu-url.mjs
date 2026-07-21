#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { callMcpTool } from "./lib/mcp-http-client.mjs";

const DEFAULT_PROJECT_SIZE = { width: 640, height: 1136 };
let projectSize = DEFAULT_PROJECT_SIZE;
const DEFAULT_MCP_URL = "https://backyard.6.cn/lanhu-mcp/mcp?role=developer&name=liangjian";

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const projectRoot = path.resolve(args.project || process.cwd());
    const lanhuUrl = args.url;

    if (!lanhuUrl && !args.coverUrl) {
        fail("Usage: node tools/lanhu-to-cocos/generate-from-lanhu-url.mjs --url <lanhu-url> [--panel UIName] [--project /path/to/CocosProject] [--cover-url <png-url>]");
    }

    assertCocosProject(projectRoot);
    projectSize = resolveProjectSize(projectRoot, args);

    const design = args.coverUrl
        ? { name: args.design || args.panel || "LanhuPanel", width: 0, height: 0, url: args.coverUrl }
        : await resolveDesign(lanhuUrl, args.design);
    const panelName = toPascalCase(args.panel || `UI${design.name}Panel`);
    const slug = toSlug(panelName.replace(/^UI/, "").replace(/Panel$/, "") || design.name);
    const imageDir = path.join(projectRoot, "assets/resources/textures/lanhu", slug);
    const imagePath = path.join(imageDir, "reference.png");

    fs.mkdirSync(imageDir, { recursive: true });
    await downloadFile(design.url, imagePath);

    const scriptPath = path.join(projectRoot, "assets/app/ui/lanhu", `${panelName}.ts`);
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.writeFileSync(scriptPath, renderPanelScript({ panelName }), "utf8");

    const imageSize = readPngSize(imagePath);
    ensureImageMeta(imagePath, imageSize);

    const scriptType = findScriptType(projectRoot, panelName);
    const prefabDir = path.join(projectRoot, "assets/resources/prefabs/lanhu");
    const prefabPath = path.join(prefabDir, `${panelName}.prefab`);
    fs.mkdirSync(prefabDir, { recursive: true });
    fs.writeFileSync(prefabPath, `${JSON.stringify(createPrefab({ panelName, imagePath, imageSize, scriptType }), null, 2)}\n`, "utf8");

    console.log(`Design: ${design.name} (${design.width} x ${design.height})`);
    console.log(`Generated ${path.relative(projectRoot, scriptPath)}`);
    console.log(`Generated ${path.relative(projectRoot, imagePath)}`);
    console.log(`Generated ${path.relative(projectRoot, prefabPath)}`);
    if (!scriptType) {
        console.log("Note: prefab has no custom script component yet. Open the project in Cocos Creator once, wait for TS import, then run this command again.");
    }
}

function parseArgs(argv) {
    const result = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--url") result.url = argv[++i];
        else if (arg === "--panel") result.panel = argv[++i];
        else if (arg === "--project") result.project = argv[++i];
        else if (arg === "--design") result.design = argv[++i];
        else if (arg === "--cover-url") result.coverUrl = argv[++i];
        else if (arg === "--width") result.width = argv[++i];
        else if (arg === "--height") result.height = argv[++i];
        else if (!result.url) result.url = arg;
    }
    return result;
}

/** 优先使用命令行尺寸，其次读取 Creator 项目设置，最后使用 Skill 默认值。 */
function resolveProjectSize(projectRoot, args) {
    const explicit = normalizeProjectSize(args.width, args.height);
    if (explicit) return explicit;
    const settingsPath = path.join(projectRoot, "settings/v2/packages/project.json");
    if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
        const design = settings.general?.designResolution;
        const configured = normalizeProjectSize(design?.width, design?.height);
        if (configured) return configured;
    }
    return { ...DEFAULT_PROJECT_SIZE };
}

/** 将宽高转换成有效的正数设计尺寸。 */
function normalizeProjectSize(width, height) {
    const normalizedWidth = Number(width);
    const normalizedHeight = Number(height);
    return Number.isFinite(normalizedWidth) && normalizedWidth > 0 &&
        Number.isFinite(normalizedHeight) && normalizedHeight > 0
        ? { width: normalizedWidth, height: normalizedHeight }
        : null;
}

function assertCocosProject(projectRoot) {
    if (!fs.existsSync(path.join(projectRoot, "assets")) || !fs.existsSync(path.join(projectRoot, "package.json"))) {
        fail(`Not a Cocos Creator project: ${projectRoot}`);
    }
}

async function resolveDesign(url, designName) {
    const result = await callLanhuTool("lanhu_get_designs", { url });
    const designs = result.structuredContent?.designs || JSON.parse(result.content?.[0]?.text || "{}").designs || [];
    const imageId = getLanhuUrlParam(url, "image_id");
    const design = designs.find((item) => item.id === imageId)
        || designs.find((item) => item.name === designName)
        || designs.find((item) => String(item.index) === String(designName))
        || designs[0];

    if (!design) {
        fail("Lanhu returned no design images.");
    }

    return design;
}

function getLanhuUrlParam(url, key) {
    const parsedUrl = new URL(url);
    const directValue = parsedUrl.searchParams.get(key);
    if (directValue) {
        return directValue;
    }

    const hashQuery = parsedUrl.hash.includes("?") ? parsedUrl.hash.slice(parsedUrl.hash.indexOf("?") + 1) : "";
    return new URLSearchParams(hashQuery).get(key);
}

async function callLanhuTool(name, args) {
    const mcpUrl = process.env.LANHU_MCP_URL || DEFAULT_MCP_URL;
    try {
        return await callMcpTool({
            url: mcpUrl,
            name,
            arguments: args,
            clientName: "lanhu-cocos-prefab-tool",
        });
    } catch (error) {
        throw new Error(`Lanhu MCP call failed (${name}). Check LANHU_MCP_URL or retry later. ${error.message}`);
    }
}

async function downloadFile(url, targetPath) {
    const response = await fetch(url, {
        headers: {
            "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "referer": "https://lanhuapp.com/",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        },
    });
    if (!response.ok) {
        fail(`Failed to download ${url}: ${response.status} ${response.statusText}`);
    }
    fs.writeFileSync(targetPath, Buffer.from(await response.arrayBuffer()));
}

function renderPanelScript({ panelName }) {
    return `import { _decorator, Button, Sprite } from "cc";
import { UIBase } from "../../core/ui/UIBase";

const { ccclass, property } = _decorator;

@ccclass("${panelName}")
export class ${panelName} extends UIBase {
    /** 蓝湖完整参考图。 */
    @property({ type: Sprite })
    public lanhuReferenceImg: Sprite | null = null;

    /** 关闭按钮热区。 */
    @property({ type: Button })
    public closeBtn: Button | null = null;

    /** 主操作按钮热区。 */
    @property({ type: Button })
    public actionBtn: Button | null = null;

    /** 是否已经注册按钮事件。 */
    private _eventsBound = false;

    /** 校验 Prefab 显式绑定并注册固定事件。 */
    protected onLoad(): void {
        this.assertRequiredBindings({
            lanhuReferenceImg: this.lanhuReferenceImg,
            closeBtn: this.closeBtn,
            actionBtn: this.actionBtn,
        });
        this.bindEvents();
    }

    /** 面板打开时恢复事件监听。 */
    protected onOpen(params?: unknown): void {
        super.onOpen(params);
        this.bindEvents();
    }

    /** 面板关闭时释放按钮事件。 */
    protected onClose(): void {
        this.unbindEvents();
        super.onClose();
    }

    /** 节点销毁时兜底释放事件，并执行 UIBase 销毁流程。 */
    protected onDestroy(): void {
        this.unbindEvents();
        super.onDestroy();
    }

    /** 幂等注册按钮事件。 */
    private bindEvents(): void {
        if (this._eventsBound) return;
        this._eventsBound = true;
        this.closeBtn?.node.on(Button.EventType.CLICK, this.onCloseBtnClick, this);
        this.actionBtn?.node.on(Button.EventType.CLICK, this.onActionBtnClick, this);
    }

    /** 幂等注销按钮事件。 */
    private unbindEvents(): void {
        if (!this._eventsBound) return;
        this._eventsBound = false;
        this.closeBtn?.node.off(Button.EventType.CLICK, this.onCloseBtnClick, this);
        this.actionBtn?.node.off(Button.EventType.CLICK, this.onActionBtnClick, this);
    }

    /** 蓝湖参考面板关闭按钮入口，具体业务由目标项目接入。 */
    private onCloseBtnClick(): void {
        // TODO: 绑定关闭逻辑。
    }

    /** 蓝湖参考面板主操作按钮入口，具体业务由目标项目接入。 */
    private onActionBtnClick(): void {
        // TODO: 绑定主按钮逻辑。
    }
}
`;
}

function createPrefab({ panelName, imagePath, imageSize, scriptType }) {
    const imageUuid = JSON.parse(fs.readFileSync(`${imagePath}.meta`, "utf8")).uuid;
    const rootComponents = scriptType ? [11, 12] : [11];
    const items = [
        { __type__: "cc.Prefab", _name: "", _objFlags: 0, _native: "", data: { __id__: 1 }, optimizationPolicy: 0, asyncLoadAssets: false },
        createNode(panelName, null, [2, 5, 8], rootComponents, 0, 0, 0),
        createNode("LanhuReferenceImg", 1, [], [3, 4], 0, 0, 0),
        createTransform(2, projectSize.width, Math.round(projectSize.width * imageSize.height / imageSize.width)),
        createSprite(2, `${imageUuid}@f9941`),
        createNode("CloseBtn", 1, [], [6, 7], 185, -67, 0),
        createTransform(5, 72, 72),
        createButton(5),
        createNode("ActionBtn", 1, [], [9, 10], 0, -232, 0),
        createTransform(8, 260, 76),
        createButton(8),
        createTransform(1, projectSize.width, projectSize.height),
    ];
    if (scriptType) items.push(createPanelScript(scriptType, 1));
    attachPrefabInfos(items);
    return items;
}

function createNode(name, parentId, childIds, componentIds, x, y, z) {
    return {
        __type__: "cc.Node",
        _name: name,
        _objFlags: 0,
        _parent: parentId === null ? null : { __id__: parentId },
        _children: childIds.map((id) => ({ __id__: id })),
        _active: true,
        _components: componentIds.map((id) => ({ __id__: id })),
        _prefab: null,
        _lpos: { __type__: "cc.Vec3", x, y, z },
        _lrot: { __type__: "cc.Quat", x: 0, y: 0, z: 0, w: 1 },
        _lscale: { __type__: "cc.Vec3", x: 1, y: 1, z: 1 },
        _layer: 33554432,
        _euler: { __type__: "cc.Vec3", x: 0, y: 0, z: 0 },
        _id: "",
    };
}

function createTransform(nodeId, width, height) {
    return { __type__: "cc.UITransform", _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, _contentSize: { __type__: "cc.Size", width, height }, _anchorPoint: { __type__: "cc.Vec2", x: 0.5, y: 0.5 }, _id: "" };
}

function createSprite(nodeId, spriteFrameUuid) {
    return { __type__: "cc.Sprite", _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: { __type__: "cc.Color", r: 255, g: 255, b: 255, a: 255 }, _sharedMaterial: null, _spriteFrame: { __uuid__: spriteFrameUuid, __expectedType__: "cc.SpriteFrame" }, _type: 0, _fillType: 0, _sizeMode: 0, _fillCenter: { __type__: "cc.Vec2", x: 0, y: 0 }, _fillStart: 0, _fillRange: 0, _isTrimmedMode: true, _useGrayscale: false, _atlas: null, _id: "" };
}

function createButton(nodeId) {
    return { __type__: "cc.Button", _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, clickEvents: [], _interactable: true, _transition: 3, _normalColor: { __type__: "cc.Color", r: 214, g: 214, b: 214, a: 255 }, _hoverColor: { __type__: "cc.Color", r: 211, g: 211, b: 211, a: 255 }, _pressColor: { __type__: "cc.Color", r: 255, g: 255, b: 255, a: 255 }, _disabledColor: { __type__: "cc.Color", r: 124, g: 124, b: 124, a: 255 }, _normalSprite: null, _hoverSprite: null, _pressedSprite: null, _disabledSprite: null, _duration: 0.1, _zoomScale: 0.9, _target: { __id__: nodeId }, _id: "" };
}

function createPanelScript(scriptType, nodeId) {
    return { __type__: scriptType, _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, lanhuReferenceImg: { __id__: 4 }, closeBtn: { __id__: 7 }, actionBtn: { __id__: 10 }, _id: "" };
}

function createPrefabInfo(objects, rootId, assetId) {
    const fileId = crypto.createHash("sha1")
        .update(`${objects[1]?._name}:${rootId}:${objects[rootId]?._name}`)
        .digest("base64")
        .replace(/[=+/]/g, "")
        .slice(0, 22);
    return { __type__: "cc.PrefabInfo", root: { __id__: rootId }, asset: { __id__: assetId }, fileId };
}

function attachPrefabInfos(objects) {
    const nodeIds = objects
        .map((object, index) => object.__type__ === "cc.Node" ? index : -1)
        .filter((index) => index >= 0);

    for (const nodeId of nodeIds) {
        const prefabInfoId = objects.length;
        objects[nodeId]._prefab = { __id__: prefabInfoId };
        objects.push(createPrefabInfo(objects, nodeId, 0));
    }
}

function ensureImageMeta(imagePath, imageSize) {
    const metaPath = `${imagePath}.meta`;
    const imageUuid = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")).uuid : crypto.randomUUID();
    const meta = {
        ver: "1.0.27",
        importer: "image",
        imported: true,
        uuid: imageUuid,
        files: [".png", ".json"],
        subMetas: {
            "6c48a": { importer: "texture", uuid: `${imageUuid}@6c48a`, displayName: "reference", id: "6c48a", name: "texture", ver: "1.0.22", imported: true, files: [".json"], subMetas: {}, userData: { wrapModeS: "clamp-to-edge", wrapModeT: "clamp-to-edge", minfilter: "linear", magfilter: "linear", mipfilter: "none", premultiplyAlpha: false, anisotropy: 0, isUuid: true, imageUuidOrDatabaseUri: imageUuid } },
            "f9941": { ver: "1.0.9", importer: "sprite-frame", uuid: `${imageUuid}@f9941`, imported: true, files: [".json"], subMetas: {}, userData: { wrapModeS: "clamp-to-edge", wrapModeT: "clamp-to-edge", minfilter: "linear", magfilter: "linear", mipfilter: "none", premultiplyAlpha: false, anisotropy: 0, trimType: "auto", trimThreshold: 1, rotated: false, offsetX: 0, offsetY: 0, trimX: 0, trimY: 0, width: imageSize.width, height: imageSize.height, rawWidth: imageSize.width, rawHeight: imageSize.height, borderTop: 0, borderBottom: 0, borderLeft: 0, borderRight: 0, isUuid: true, imageUuidOrDatabaseUri: `${imageUuid}@6c48a`, atlasUuid: "", packable: true }, displayName: "reference", id: "f9941", name: "spriteFrame" },
        },
        userData: { type: "sprite-frame", redirect: `${imageUuid}@f9941`, hasAlpha: false },
    };
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

function findScriptType(projectRoot, panelName) {
    const scriptMetaPath = path.join(projectRoot, "assets/app/ui/lanhu", `${panelName}.ts.meta`);
    if (!fs.existsSync(scriptMetaPath)) return "";
    const scriptMeta = JSON.parse(fs.readFileSync(scriptMetaPath, "utf8"));
    if (!isUuid(scriptMeta.uuid)) {
        throw new Error(`${panelName}.ts.meta 缺少有效 UUID。`);
    }
    const expectedType = compressScriptUuid(scriptMeta.uuid);
    const chunkRoot = path.join(projectRoot, "temp/programming/packer-driver/targets/editor/chunks");
    if (!fs.existsSync(chunkRoot)) return "";
    const files = walk(chunkRoot).filter((file) => file.endsWith(".js"));
    for (const file of files) {
        const text = fs.readFileSync(file, "utf8");
        const match = text.match(new RegExp(`_RF\\.push\\(\\{\\}, "([^"]+)", "${panelName}"`));
        if (!match) continue;
        if (match[1] !== expectedType) {
            throw new Error(`${panelName} 的 meta UUID 与 Creator 编译类型不一致：${expectedType} !== ${match[1]}`);
        }
        return match[1];
    }
    return "";
}

/** 将 Creator 脚本 UUID 转换为 Prefab 序列化使用的压缩类型 ID。 */
function compressScriptUuid(uuid) {
    const hex = uuid.replaceAll("-", "").toLowerCase();
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let compressed = hex.slice(0, 5);
    for (let index = 5; index < hex.length; index += 3) {
        const value = Number.parseInt(hex.slice(index, index + 3), 16);
        compressed += alphabet[value >> 6] + alphabet[value & 63];
    }
    return compressed;
}

/** 判断字符串是否为标准 UUID。 */
function isUuid(value) {
    return typeof value === "string" &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(fullPath) : [fullPath];
    });
}

function readPngSize(filePath) {
    const buffer = fs.readFileSync(filePath);
    if (buffer.toString("ascii", 1, 4) !== "PNG") fail(`Not a PNG file: ${filePath}`);
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function toPascalCase(value) {
    const text = String(value).trim().replace(/^UI/i, "").replace(/Panel$/i, "");
    const words = text.match(/[A-Za-z0-9]+|[\u4e00-\u9fa5]+/g) || ["Lanhu"];
    const mapped = words.map((word) => (/^[\u4e00-\u9fa5]+$/.test(word) ? "Lanhu" : word[0].toUpperCase() + word.slice(1)));
    return `UI${mapped.join("")}Panel`;
}

function toSlug(value) {
    const ascii = String(value).replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return ascii || "lanhu-panel";
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

main().catch((error) => fail(error.stack || error.message));
