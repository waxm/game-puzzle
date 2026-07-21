#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

/** 读取目标 Cocos 项目并输出蓝湖生成所需的环境信息。 */
function main() {
    const projectRoot = resolveProjectRoot(readArgument("--project") || process.cwd());
    const packageJson = readJson(path.join(projectRoot, "package.json"));
    const projectSettings = readOptionalJson(
        path.join(projectRoot, "settings/v2/packages/project.json"),
    );
    const assetsRoot = path.join(projectRoot, "assets");
    const typescriptFiles = collectFiles(assetsRoot, ".ts");

    const result = {
        projectRoot,
        creatorVersion: packageJson.creator?.version ?? null,
        designResolution: projectSettings?.general?.designResolution ?? null,
        uiBaseCandidates: relativePaths(
            projectRoot,
            typescriptFiles.filter((filePath) => path.basename(filePath) === "UIBase.ts"),
        ),
        resourceManagerCandidates: relativePaths(
            projectRoot,
            typescriptFiles.filter((filePath) => /Res(?:ource)?Manager\.ts$/i.test(filePath)),
        ),
        existingDirectories: [
            "assets/app/ui/lanhu",
            "assets/resources/prefabs/lanhu",
            "assets/resources/textures/lanhu",
            "tools/lanhu-to-cocos/generated",
        ].filter((relativePath) => fs.existsSync(path.join(projectRoot, relativePath))),
        projectRules: ["AGENTS.md", ".codex/AGENTS.md"].filter((relativePath) =>
            fs.existsSync(path.join(projectRoot, relativePath)),
        ),
    };
    console.log(JSON.stringify(result, null, 2));
}

/** 从命令行读取指定参数。 */
function readArgument(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : null;
}

/** 向上查找包含 assets 和 package.json 的 Cocos 项目根目录。 */
function resolveProjectRoot(startPath) {
    let current = path.resolve(startPath);
    while (true) {
        if (
            fs.existsSync(path.join(current, "assets")) &&
            fs.existsSync(path.join(current, "package.json"))
        ) {
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current) {
            throw new Error(`找不到 Cocos 项目根目录：${startPath}`);
        }
        current = parent;
    }
}

/** 读取必需 JSON 文件。 */
function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/** 读取可选 JSON 文件。 */
function readOptionalJson(filePath) {
    return fs.existsSync(filePath) ? readJson(filePath) : null;
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

/** 将绝对路径转换为便于阅读的项目相对路径。 */
function relativePaths(projectRoot, filePaths) {
    return filePaths.map((filePath) => path.relative(projectRoot, filePath)).sort();
}

main();
