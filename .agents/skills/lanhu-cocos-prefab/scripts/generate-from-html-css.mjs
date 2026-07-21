#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_PROJECT_SIZE = { width: 640, height: 1136 };
let projectSize = DEFAULT_PROJECT_SIZE;
const UI_LAYER = 33554432;
const IMAGE_EXT_RE = /\.(png|jpg|jpeg|webp)(\?.*)?$/i;

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const projectRoot = path.resolve(args.project || process.cwd());

    if (!args.html || !args.css || !args.panel) {
        fail("Usage: node tools/lanhu-to-cocos/generate-from-html-css.mjs --html page.html --css index.css --panel UIExamplePanel [--project /path/to/project]");
    }

    assertCocosProject(projectRoot);
    projectSize = resolveProjectSize(projectRoot, args);

    const htmlPath = path.resolve(args.html);
    const cssPath = path.resolve(args.css);
    const panelName = toPascalCase(args.panel);
    const slug = toSlug(panelName.replace(/^UI/, "").replace(/Panel$/, ""));
    const html = fs.readFileSync(htmlPath, "utf8");
    const css = fs.readFileSync(cssPath, "utf8");
    const dom = parseHtml(html);
    const cssRules = parseCss(css);
    const nodes = flattenDom(dom)
        .filter((item) => shouldEmitNode(item))
        .map((item, index) => normalizeDomNode(item, index, cssRules))
        .filter((item) => item.width > 0 && item.height > 0);

    const assetMap = await prepareImageAssets(nodes, htmlPath, projectRoot, slug);
    const prefabPath = path.join(projectRoot, "assets/resources/prefabs/lanhu", `${panelName}.prefab`);
    fs.mkdirSync(path.dirname(prefabPath), { recursive: true });
    fs.writeFileSync(prefabPath, `${JSON.stringify(createPrefab(panelName, nodes, assetMap), null, 2)}\n`, "utf8");

    const specPath = path.join(projectRoot, "tools/lanhu-to-cocos/generated", `${panelName}.nodes.json`);
    fs.mkdirSync(path.dirname(specPath), { recursive: true });
    fs.writeFileSync(specPath, `${JSON.stringify({ panelName, size: projectSize, nodes }, null, 2)}\n`, "utf8");

    console.log(`Parsed ${nodes.length} Cocos nodes from HTML/CSS`);
    console.log(`Generated ${path.relative(projectRoot, prefabPath)}`);
    console.log(`Generated ${path.relative(projectRoot, specPath)}`);
}

function parseArgs(argv) {
    const result = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--html") result.html = argv[++i];
        else if (arg === "--css") result.css = argv[++i];
        else if (arg === "--panel") result.panel = argv[++i];
        else if (arg === "--project") result.project = argv[++i];
        else if (arg === "--width") result.width = argv[++i];
        else if (arg === "--height") result.height = argv[++i];
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

function parseCss(css) {
    const rules = new Map();
    const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const ruleRe = /([^{}]+)\{([^{}]+)\}/g;
    let match;

    while ((match = ruleRe.exec(cleanCss))) {
        const selectors = match[1].split(",").map((item) => item.trim()).filter(Boolean);
        const declarations = parseStyle(match[2]);

        for (const selector of selectors) {
            if (selector.startsWith(".")) {
                rules.set(selector.slice(1), { ...(rules.get(selector.slice(1)) || {}), ...declarations });
            }
        }
    }

    return rules;
}

function parseStyle(styleText = "") {
    const style = {};
    for (const part of styleText.split(";")) {
        const index = part.indexOf(":");
        if (index === -1) continue;
        const key = part.slice(0, index).trim().toLowerCase();
        const value = part.slice(index + 1).trim();
        if (key) style[key] = value;
    }
    return style;
}

function parseHtml(html) {
    const root = { tag: "root", attrs: {}, children: [], text: "" };
    const stack = [root];
    const tokenRe = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/?[a-zA-Z][^>]*>|[^<]+/gi;
    let match;

    while ((match = tokenRe.exec(html))) {
        const token = match[0];
        if (token.startsWith("<!--") || /^<!doctype/i.test(token)) continue;

        if (token.startsWith("</")) {
            if (stack.length > 1) stack.pop();
            continue;
        }

        if (token.startsWith("<")) {
            const tagMatch = token.match(/^<\s*([a-zA-Z0-9-]+)/);
            if (!tagMatch) continue;
            const tag = tagMatch[1].toLowerCase();
            const node = { tag, attrs: parseAttrs(token), children: [], text: "" };
            stack[stack.length - 1].children.push(node);
            if (!token.endsWith("/>") && !["img", "br", "hr", "input", "meta", "link"].includes(tag)) {
                stack.push(node);
            }
            continue;
        }

        const text = decodeHtml(token).replace(/\s+/g, " ").trim();
        if (text) stack[stack.length - 1].children.push({ tag: "#text", attrs: {}, children: [], text });
    }

    return root;
}

function parseAttrs(tagText) {
    const attrs = {};
    const attrRe = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let match;

    while ((match = attrRe.exec(tagText))) {
        const key = match[1];
        if (key === tagText.match(/^<\s*([a-zA-Z0-9-]+)/)?.[1]) continue;
        attrs[key] = match[2] ?? match[3] ?? match[4] ?? "";
    }

    return attrs;
}

function flattenDom(root, parent = null, list = []) {
    for (const child of root.children || []) {
        child.parent = parent;
        if (child.tag !== "#text") list.push(child);
        flattenDom(child, child, list);
    }
    return list;
}

function shouldEmitNode(node) {
    if (["script", "style", "head", "meta", "link", "title"].includes(node.tag)) return false;
    const className = node.attrs.class || "";
    const style = node.attrs.style || "";
    return node.tag === "img" || textContent(node) || /width|height|left|top|background|position/.test(`${className} ${style}`);
}

function normalizeDomNode(node, index, cssRules) {
    const style = computeStyle(node, cssRules);
    const width = readPx(style.width) || readPx(style["min-width"]) || (node.tag === "img" ? 100 : estimateTextWidth(textContent(node), style));
    const height = readPx(style.height) || readPx(style["min-height"]) || (node.tag === "img" ? 100 : readPx(style["line-height"]) || readPx(style["font-size"]) + 8 || 32);
    const left = readPx(style.left) ?? readPx(style["margin-left"]) ?? 0;
    const top = readPx(style.top) ?? readPx(style["margin-top"]) ?? 0;
    const x = round(left + width / 2 - projectSize.width / 2);
    const y = round(projectSize.height / 2 - top - height / 2);
    const src = node.attrs.src || extractCssUrl(style["background-image"] || style.background || "");
    const text = node.tag === "img" ? "" : textContent(node);
    const type = node.tag === "img" || src ? "image" : text ? "text" : "container";

    return {
        id: `Node${index + 1}`,
        name: toNodeName(node, index),
        tag: node.tag,
        type,
        x,
        y,
        left: round(left),
        top: round(top),
        width: round(width),
        height: round(height),
        text,
        src,
        color: parseColor(style.color || "#ffffff"),
        fontSize: readPx(style["font-size"]) || 24,
        bold: /bold|[6-9]00/.test(style["font-weight"] || ""),
        opacity: readOpacity(style.opacity),
    };
}

function computeStyle(node, cssRules) {
    const style = {};
    const classNames = String(node.attrs.class || "").split(/\s+/).filter(Boolean);
    for (const className of classNames) Object.assign(style, cssRules.get(className) || {});
    Object.assign(style, parseStyle(node.attrs.style || ""));
    return style;
}

function textContent(node) {
    if (node.tag === "#text") return node.text;
    return (node.children || []).filter((child) => child.tag === "#text").map((child) => child.text).join("").trim();
}

async function prepareImageAssets(nodes, htmlPath, projectRoot, slug) {
    const result = new Map();
    const imageNodes = nodes.filter((node) => node.type === "image" && node.src);
    const targetDir = path.join(projectRoot, "assets/resources/textures/lanhu", slug, "assets");
    fs.mkdirSync(targetDir, { recursive: true });

    for (const node of imageNodes) {
        const source = node.src;
        const fileName = safeFileName(path.basename(source.split("?")[0]) || `${node.name}.png`);
        const targetPath = path.join(targetDir, IMAGE_EXT_RE.test(fileName) ? fileName : `${fileName}.png`);

        if (/^https?:\/\//.test(source)) {
            const response = await fetch(source);
            if (!response.ok) continue;
            fs.writeFileSync(targetPath, Buffer.from(await response.arrayBuffer()));
        } else {
            const sourcePath = path.resolve(path.dirname(htmlPath), source);
            if (!fs.existsSync(sourcePath)) continue;
            fs.copyFileSync(sourcePath, targetPath);
        }

        ensureImageMeta(targetPath, readPngSizeLoose(targetPath));
        result.set(source, { path: targetPath, uuid: JSON.parse(fs.readFileSync(`${targetPath}.meta`, "utf8")).uuid });
    }

    return result;
}

function createPrefab(panelName, nodes, assetMap) {
    const objects = [{ __type__: "cc.Prefab", _name: "", _objFlags: 0, _native: "", data: { __id__: 1 }, optimizationPolicy: 0, asyncLoadAssets: false }];
    const root = createNode(panelName, null, [], [], 0, 0, 0);
    objects.push(root);
    root._components.push({ __id__: objects.length });
    objects.push(createTransform(1, projectSize.width, projectSize.height));

    for (const node of nodes) {
        const nodeId = objects.length;
        root._children.push({ __id__: nodeId });
        const componentIds = [nodeId + 1];
        if (node.type === "image") componentIds.push(nodeId + 2);
        if (node.type === "text") componentIds.push(nodeId + 2);
        objects.push(createNode(node.name, 1, [], componentIds, node.x, node.y, 0));
        objects.push(createTransform(nodeId, node.width, node.height));
        if (node.type === "image") {
            const asset = assetMap.get(node.src);
            objects.push(createSprite(nodeId, asset ? `${asset.uuid}@f9941` : null, node.opacity));
        } else if (node.type === "text") {
            objects.push(createLabel(nodeId, node));
        }
    }

    attachPrefabInfos(objects);
    return objects;
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
        _layer: UI_LAYER,
        _euler: { __type__: "cc.Vec3", x: 0, y: 0, z: 0 },
        _id: "",
    };
}

function createTransform(nodeId, width, height) {
    return { __type__: "cc.UITransform", _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, _contentSize: { __type__: "cc.Size", width, height }, _anchorPoint: { __type__: "cc.Vec2", x: 0.5, y: 0.5 }, _id: "" };
}

function createSprite(nodeId, spriteFrameUuid, opacity = 1) {
    return { __type__: "cc.Sprite", _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: { __type__: "cc.Color", r: 255, g: 255, b: 255, a: Math.round(255 * opacity) }, _sharedMaterial: null, _spriteFrame: spriteFrameUuid ? { __uuid__: spriteFrameUuid, __expectedType__: "cc.SpriteFrame" } : null, _type: 0, _fillType: 0, _sizeMode: 0, _fillCenter: { __type__: "cc.Vec2", x: 0, y: 0 }, _fillStart: 0, _fillRange: 0, _isTrimmedMode: true, _useGrayscale: false, _atlas: null, _id: "" };
}

function createLabel(nodeId, node) {
    return {
        __type__: "cc.Label",
        _name: "",
        _objFlags: 0,
        node: { __id__: nodeId },
        _enabled: true,
        _srcBlendFactor: 2,
        _dstBlendFactor: 4,
        _color: { __type__: "cc.Color", ...node.color },
        _sharedMaterial: null,
        _useOriginalSize: false,
        _string: node.text,
        _horizontalAlign: 1,
        _verticalAlign: 1,
        _actualFontSize: node.fontSize,
        _fontSize: node.fontSize,
        _fontFamily: "Arial",
        _lineHeight: Math.round(node.fontSize * 1.25),
        _overflow: 0,
        _enableWrapText: true,
        _font: null,
        _isSystemFontUsed: true,
        _isItalic: false,
        _isBold: node.bold,
        _isUnderline: false,
        _cacheMode: 0,
        _id: "",
    };
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
    const ext = path.extname(imagePath);
    const meta = {
        ver: "1.0.27",
        importer: "image",
        imported: true,
        uuid: imageUuid,
        files: [ext, ".json"],
        subMetas: {
            "6c48a": { importer: "texture", uuid: `${imageUuid}@6c48a`, displayName: path.basename(imagePath, ext), id: "6c48a", name: "texture", ver: "1.0.22", imported: true, files: [".json"], subMetas: {}, userData: { wrapModeS: "clamp-to-edge", wrapModeT: "clamp-to-edge", minfilter: "linear", magfilter: "linear", mipfilter: "none", premultiplyAlpha: false, anisotropy: 0, isUuid: true, imageUuidOrDatabaseUri: imageUuid } },
            "f9941": { ver: "1.0.9", importer: "sprite-frame", uuid: `${imageUuid}@f9941`, imported: true, files: [".json"], subMetas: {}, userData: { wrapModeS: "clamp-to-edge", wrapModeT: "clamp-to-edge", minfilter: "linear", magfilter: "linear", mipfilter: "none", premultiplyAlpha: false, anisotropy: 0, trimType: "auto", trimThreshold: 1, rotated: false, offsetX: 0, offsetY: 0, trimX: 0, trimY: 0, width: imageSize.width, height: imageSize.height, rawWidth: imageSize.width, rawHeight: imageSize.height, borderTop: 0, borderBottom: 0, borderLeft: 0, borderRight: 0, isUuid: true, imageUuidOrDatabaseUri: `${imageUuid}@6c48a`, atlasUuid: "", packable: true }, displayName: path.basename(imagePath, ext), id: "f9941", name: "spriteFrame" },
        },
        userData: { type: "sprite-frame", redirect: `${imageUuid}@f9941`, hasAlpha: true },
    };
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

function readPngSizeLoose(filePath) {
    const buffer = fs.readFileSync(filePath);
    if (buffer.toString("ascii", 1, 4) === "PNG") return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    return { width: 100, height: 100 };
}

function readPx(value) {
    if (value == null || value === "") return null;
    const match = String(value).match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
}

function readOpacity(value) {
    const opacity = Number(value ?? 1);
    return Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;
}

function parseColor(value) {
    const text = String(value).trim();
    const rgba = text.match(/rgba?\(([^)]+)\)/i);
    if (rgba) {
        const [r, g, b, a = 1] = rgba[1].split(",").map((item) => Number(item.trim()));
        return { r: r || 0, g: g || 0, b: b || 0, a: Math.round((a ?? 1) * 255) };
    }
    const hex = text.replace("#", "");
    if (hex.length === 3) {
        return { r: parseInt(hex[0] + hex[0], 16), g: parseInt(hex[1] + hex[1], 16), b: parseInt(hex[2] + hex[2], 16), a: 255 };
    }
    if (hex.length >= 6) {
        return { r: parseInt(hex.slice(0, 2), 16), g: parseInt(hex.slice(2, 4), 16), b: parseInt(hex.slice(4, 6), 16), a: 255 };
    }
    return { r: 255, g: 255, b: 255, a: 255 };
}

function extractCssUrl(value) {
    const match = String(value).match(/url\((['"]?)(.*?)\1\)/);
    return match ? match[2] : "";
}

function estimateTextWidth(text, style) {
    return Math.max(20, Math.ceil(String(text || "").length * ((readPx(style["font-size"]) || 24) * 0.6)));
}

function toNodeName(node, index) {
    const raw = node.attrs.id || String(node.attrs.class || "").split(/\s+/)[0] || node.tag || `node${index + 1}`;
    return toPascalCase(raw.replace(/^#/, "")) || `Node${index + 1}`;
}

function toPascalCase(value) {
    const words = String(value).trim().match(/[A-Za-z0-9]+|[\u4e00-\u9fa5]+/g) || ["Lanhu"];
    return words.map((word) => (/^[\u4e00-\u9fa5]+$/.test(word) ? "Lanhu" : word[0].toUpperCase() + word.slice(1))).join("");
}

function toSlug(value) {
    return String(value).replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lanhu-panel";
}

function safeFileName(value) {
    return decodeURIComponent(value).replace(/[^a-zA-Z0-9._-]/g, "_");
}

function decodeHtml(value) {
    return value.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
}

function round(value) {
    return Math.round(value * 100) / 100;
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

main().catch((error) => fail(error.stack || error.message));
