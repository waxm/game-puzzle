#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/** 校验指定项目中的蓝湖 Prefab 序列化结构。 */
function main() {
    const projectRoot = path.resolve(readArgument("--project") || process.cwd());
    assertCocosProject(projectRoot);
    const requestedPrefabs = readArguments("--prefab");
    const prefabPaths = requestedPrefabs.length
        ? requestedPrefabs.map((filePath) => path.resolve(projectRoot, filePath))
        : collectFiles(
              path.join(projectRoot, "assets/resources/prefabs/lanhu"),
              ".prefab",
          );

    if (prefabPaths.length === 0) {
        throw new Error("没有找到需要校验的蓝湖 Prefab。");
    }

    for (const prefabPath of prefabPaths) {
        validatePrefab(projectRoot, prefabPath);
    }
    console.log(`蓝湖 Prefab 校验通过：${prefabPaths.length} 个文件。`);
}

/** 读取一个命令行参数。 */
function readArgument(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : null;
}

/** 读取可重复出现的命令行参数。 */
function readArguments(name) {
    const values = [];
    for (let index = 0; index < process.argv.length; index += 1) {
        if (process.argv[index] === name && process.argv[index + 1]) {
            values.push(process.argv[index + 1]);
        }
    }
    return values;
}

/** 确认目标目录是 Cocos 项目。 */
function assertCocosProject(projectRoot) {
    if (
        !fs.existsSync(path.join(projectRoot, "assets")) ||
        !fs.existsSync(path.join(projectRoot, "package.json"))
    ) {
        throw new Error(`不是有效的 Cocos 项目：${projectRoot}`);
    }
}

/** 校验单个 Prefab 的引用范围、节点关系和组件归属。 */
function validatePrefab(projectRoot, prefabPath) {
    if (!fs.existsSync(prefabPath)) {
        throw new Error(`Prefab 不存在：${prefabPath}`);
    }
    const relativePath = path.relative(projectRoot, prefabPath);
    const objects = JSON.parse(fs.readFileSync(prefabPath, "utf8"));
    if (!Array.isArray(objects) || objects[0]?.__type__ !== "cc.Prefab") {
        throw new Error(`${relativePath} 不是有效的 Cocos Prefab 对象数组。`);
    }

    visitValue(objects, (referenceId) => {
        if (!Number.isInteger(referenceId) || referenceId < 0 || referenceId >= objects.length) {
            throw new Error(`${relativePath} 存在越界引用：__id__=${referenceId}`);
        }
    });

    objects.forEach((object, objectId) => {
        if (object?.__type__ === "cc.Node") {
            validateNode(objects, object, objectId, relativePath);
        } else if (object?.node?.__id__ !== undefined) {
            validateComponent(objects, object, objectId, relativePath);
        }
    });

    const metaPath = `${prefabPath}.meta`;
    if (!fs.existsSync(metaPath)) {
        console.warn(`等待 Creator 导入并生成 meta：${relativePath}.meta`);
    }
}

/** 校验节点父子和组件反向引用。 */
function validateNode(objects, node, nodeId, relativePath) {
    if (node._parent?.__id__ !== undefined) {
        const parent = objects[node._parent.__id__];
        if (!(parent?._children ?? []).some((item) => item.__id__ === nodeId)) {
            throw new Error(`${relativePath} 的节点 ${node._name} 未登记在父节点 children 中。`);
        }
    }
    for (const childReference of node._children ?? []) {
        const child = objects[childReference.__id__];
        if (child?.__type__ !== "cc.Node" || child._parent?.__id__ !== nodeId) {
            throw new Error(`${relativePath} 的节点 ${node._name} 存在不一致的子节点引用。`);
        }
    }
    for (const componentReference of node._components ?? []) {
        const component = objects[componentReference.__id__];
        if (!component || component.node?.__id__ !== nodeId) {
            throw new Error(`${relativePath} 的节点 ${node._name} 存在不一致的组件引用。`);
        }
    }
}

/** 校验组件已登记在所属节点中。 */
function validateComponent(objects, component, componentId, relativePath) {
    const owner = objects[component.node.__id__];
    if (
        owner?.__type__ !== "cc.Node" ||
        !(owner._components ?? []).some((item) => item.__id__ === componentId)
    ) {
        throw new Error(`${relativePath} 的组件 ${component.__type__} 未登记在所属节点中。`);
    }
}

/** 递归访问所有内部对象引用。 */
function visitValue(value, onReference) {
    if (Array.isArray(value)) {
        value.forEach((item) => visitValue(item, onReference));
        return;
    }
    if (!value || typeof value !== "object") {
        return;
    }
    if (Object.keys(value).length === 1 && Object.hasOwn(value, "__id__")) {
        onReference(value.__id__);
        return;
    }
    Object.values(value).forEach((item) => visitValue(item, onReference));
}

/** 递归收集指定后缀文件。 */
function collectFiles(root, extension) {
    if (!fs.existsSync(root)) {
        return [];
    }
    return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = path.join(root, entry.name);
        if (entry.isDirectory()) {
            return collectFiles(entryPath, extension);
        }
        return entry.isFile() && entry.name.endsWith(extension) ? [entryPath] : [];
    });
}

main();
