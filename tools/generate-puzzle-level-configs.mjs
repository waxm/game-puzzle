#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  loadAndValidatePuzzleLevelProject,
} from "./puzzle-level-schema.mjs";

/** 当前工具所在项目的根目录。 */
const projectRoot = path.resolve(import.meta.dirname, "..");

/** 每关完整 JSON 所在的 resources 目录。 */
const configsRoot = path.join(
  projectRoot,
  "assets/resources/configs/game/levels",
);

/** 拼图关卡图片根目录。 */
const texturesRoot = path.join(
  projectRoot,
  "assets/resources/textures/game/levels",
);

/** 自动生成的轻量 TypeScript 关卡目录。 */
const outputPath = path.join(
  projectRoot,
  "assets/app/game/config/PuzzleLevelCatalog.generated.ts",
);

/** 解析参数，校验逐关 JSON，并生成轻量目录。 */
function main() {
  const options = readOptions(process.argv.slice(2));
  const { levelNumbers } = loadAndValidatePuzzleLevelProject({
    configsRoot,
    texturesRoot,
    fixImportSettings: options.fixImportSettings,
  });
  if (!levelNumbers.includes(1)) {
    throw new Error("关卡配置中缺少 level_001，无法建立初始进度。");
  }

  const source = createCatalogSource(levelNumbers);
  if (options.checkOnly) {
    const currentSource = fs.existsSync(outputPath)
      ? fs.readFileSync(outputPath, "utf8")
      : "";
    if (currentSource !== source) {
      throw new Error(
        "关卡生成文件不是最新状态，请先执行 npm run generate:levels。",
      );
    }
    console.log(`关卡 JSON、图片与 ${levelNumbers.length} 项轻量目录校验通过。`);
    return;
  }

  fs.writeFileSync(outputPath, source, "utf8");
  console.log(`已生成 ${levelNumbers.length} 个拼图关卡索引：${outputPath}`);
}

/** 读取并校验命令行参数，防止拼错参数后误以为工具已经执行。 */
function readOptions(args) {
  const supportedArguments = new Set(["--check", "--fix-import-settings"]);
  const unknownArguments = args.filter(
    (argument) => !supportedArguments.has(argument),
  );
  if (unknownArguments.length > 0) {
    throw new Error(`不支持的参数：${unknownArguments.join("、")}`);
  }

  const checkOnly = args.includes("--check");
  const fixImportSettings = args.includes("--fix-import-settings");
  if (checkOnly && fixImportSettings) {
    throw new Error(
      "--check 不能与会写文件的 --fix-import-settings 同时使用。",
    );
  }
  return { checkOnly, fixImportSettings };
}

/** 生成只包含编号、存在性、JSON 路径和下一关查询的 TypeScript 目录。 */
function createCatalogSource(levelNumbers) {
  const numberLines = chunk(levelNumbers, 20)
    .map((numbers) => `  ${numbers.join(", ")},`)
    .join("\n");

  return `// 本文件由 tools/generate-puzzle-level-configs.mjs 自动生成，请勿手工维护。

/** 当前配置与纹理目录中一一对应的关卡编号。 */
export const PuzzleLevelNumbers = [
${numberLines}
] as const;

/** 判断指定编号是否存在可加载的关卡 JSON。 */
export function hasPuzzleLevel(level: number): boolean {
  return PuzzleLevelNumbers.some((candidate) => candidate === level);
}

/** 根据关卡编号返回 JsonAsset 的 resources 路径，不存在时返回 null。 */
export function getPuzzleLevelConfigPath(level: number): string | null {
  if (!hasPuzzleLevel(level)) {
    return null;
  }
  const levelName = "level_" + ("000" + level).slice(-3);
  return \`configs/game/levels/\${levelName}\`;
}

/** 返回当前关卡在目录中的下一关编号，最后一关返回 null。 */
export function getNextPuzzleLevelNumber(level: number): number | null {
  const currentIndex = PuzzleLevelNumbers.findIndex(
    (candidate) => candidate === level,
  );
  if (currentIndex < 0 || currentIndex >= PuzzleLevelNumbers.length - 1) {
    return null;
  }
  return PuzzleLevelNumbers[currentIndex + 1];
}
`;
}

/** 把数组按固定数量分行，保持生成文件便于人工查看。 */
function chunk(items, size) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

main();
