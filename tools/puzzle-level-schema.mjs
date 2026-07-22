import fs from "node:fs";
import path from "node:path";

/** 当前单关 JSON 使用的结构版本。 */
export const PUZZLE_LEVEL_SCHEMA_VERSION = 1;

/** 单关 JSON 必须且只允许包含的字段，顺序同时作为稳定导出顺序。 */
export const PUZZLE_LEVEL_FIELD_NAMES = Object.freeze([
  "schemaVersion",
  "level",
  "sourceImagePath",
  "rows",
  "columns",
  "boardWidth",
  "boardHeight",
  "timeLimitSeconds",
  "pieceOrder",
]);

/** 关卡编号允许的最小值。 */
export const MIN_PUZZLE_LEVEL = 1;

/** 三位关卡目录允许的最大编号。 */
export const MAX_PUZZLE_LEVEL = 999;

/** Creator 为正式资源生成的标准 UUID 格式。 */
const STANDARD_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 校验关卡编号，并把它格式化为 level_XXX。 */
export function createLevelName(level) {
  assertLevelNumber(level, "关卡编号");
  return `level_${String(level).padStart(3, "0")}`;
}

/** 根据关卡编号生成原图 SpriteFrame 的 resources 加载路径。 */
export function createSourceImagePath(level) {
  const levelName = createLevelName(level);
  return `textures/game/levels/${levelName}/${levelName}_source/spriteFrame`;
}

/** 根据关卡编号生成 JsonAsset 的 resources 加载路径。 */
export function createLevelConfigResourcePath(level) {
  return `configs/game/levels/${createLevelName(level)}`;
}

/** 根据配置根目录和关卡编号生成单关 JSON 的磁盘路径。 */
export function getLevelConfigFilePath(configsRoot, level) {
  if (typeof configsRoot !== "string" || configsRoot.length === 0) {
    throw new Error("关卡配置根目录必须是非空字符串。");
  }
  return path.join(configsRoot, `${createLevelName(level)}.json`);
}

/**
 * 严格解析单关配置并返回字段顺序固定的副本。
 *
 * 严格字段校验用于阻止编辑器拼写错误被运行时静默忽略；返回副本则避免调用方
 * 后续修改 pieceOrder 时污染原始 JSON 对象。
 */
export function parsePuzzleLevelConfig(
  value,
  { expectedLevel, location = "拼图关卡配置" } = {},
) {
  if (!isPlainObject(value)) {
    throw new Error(`${location} 必须是 JSON 对象。`);
  }

  const actualFieldNames = Object.keys(value);
  const missingFieldNames = PUZZLE_LEVEL_FIELD_NAMES.filter(
    (name) => !Object.hasOwn(value, name),
  );
  const extraFieldNames = actualFieldNames.filter(
    (name) => !PUZZLE_LEVEL_FIELD_NAMES.includes(name),
  );
  if (missingFieldNames.length > 0 || extraFieldNames.length > 0) {
    const details = [];
    if (missingFieldNames.length > 0) {
      details.push(`缺少字段：${missingFieldNames.join("、")}`);
    }
    if (extraFieldNames.length > 0) {
      details.push(`不支持字段：${extraFieldNames.join("、")}`);
    }
    throw new Error(`${location} 字段不完整（${details.join("；")}）。`);
  }

  if (value.schemaVersion !== PUZZLE_LEVEL_SCHEMA_VERSION) {
    throw new Error(
      `${location}.schemaVersion 必须为 ${PUZZLE_LEVEL_SCHEMA_VERSION}。`,
    );
  }
  assertLevelNumber(value.level, `${location}.level`);
  if (expectedLevel !== undefined) {
    assertLevelNumber(expectedLevel, `${location} 的预期关卡编号`);
    if (value.level !== expectedLevel) {
      throw new Error(
        `${location}.level 与文件名不一致：${value.level} / ${expectedLevel}。`,
      );
    }
  }

  const expectedSourceImagePath = createSourceImagePath(value.level);
  if (value.sourceImagePath !== expectedSourceImagePath) {
    throw new Error(
      `${location}.sourceImagePath 必须为 ${expectedSourceImagePath}。`,
    );
  }
  assertPositiveInteger(value.rows, `${location}.rows`);
  assertPositiveInteger(value.columns, `${location}.columns`);
  assertPositiveNumber(value.boardWidth, `${location}.boardWidth`);
  assertPositiveNumber(value.boardHeight, `${location}.boardHeight`);
  if (value.timeLimitSeconds !== null) {
    assertPositiveInteger(
      value.timeLimitSeconds,
      `${location}.timeLimitSeconds`,
    );
  }

  validatePieceOrder(
    value.pieceOrder,
    value.rows * value.columns,
    `${location}.pieceOrder`,
  );

  return {
    schemaVersion: PUZZLE_LEVEL_SCHEMA_VERSION,
    level: value.level,
    sourceImagePath: expectedSourceImagePath,
    rows: value.rows,
    columns: value.columns,
    boardWidth: value.boardWidth,
    boardHeight: value.boardHeight,
    timeLimitSeconds: value.timeLimitSeconds,
    pieceOrder: Array.from(value.pieceOrder),
  };
}

/** 把已经校验的配置输出为稳定的两空格缩进 JSON。 */
export function formatPuzzleLevelConfig(config) {
  const canonicalConfig = parsePuzzleLevelConfig(config, {
    expectedLevel: config?.level,
    location: "待导出的拼图关卡配置",
  });
  return `${JSON.stringify(canonicalConfig, null, 2)}\n`;
}

/** 从磁盘读取、解析并严格校验一个单关 JSON。 */
export function readPuzzleLevelConfigFile(configPath, expectedLevel) {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(`无法读取关卡 JSON：${configPath}`, { cause: error });
  }
  return parsePuzzleLevelConfig(value, {
    expectedLevel,
    location: configPath,
  });
}

/**
 * 扫描配置与纹理目录，校验两侧关卡一一对应并返回完整配置。
 *
 * 这个入口可被生成器、CI 校验和关卡编辑器服务复用，避免三处各自实现不同规则。
 */
export function loadAndValidatePuzzleLevelProject({
  configsRoot,
  texturesRoot,
  fixImportSettings = false,
}) {
  const configLevels = collectConfigLevelNumbers(configsRoot);
  const textureLevels = collectTextureLevelNumbers(texturesRoot);
  assertSameLevelNumbers(configLevels, textureLevels);

  const configMetaUuids = new Map();
  const configs = configLevels.map((level) => {
    const configPath = getLevelConfigFilePath(configsRoot, level);
    const metaUuid = validatePuzzleLevelConfigMeta(configPath);
    const duplicateMetaPath = configMetaUuids.get(metaUuid);
    if (duplicateMetaPath) {
      throw new Error(
        `关卡 JSON 的 Creator UUID 重复：${duplicateMetaPath}、${configPath}.meta。`,
      );
    }
    configMetaUuids.set(metaUuid, `${configPath}.meta`);
    const config = readPuzzleLevelConfigFile(configPath, level);
    validatePuzzleLevelAsset(texturesRoot, config, { fixImportSettings });
    return config;
  });

  return {
    levelNumbers: Array.from(configLevels),
    configs,
  };
}

/** 校验单关 JSON 已由 Creator 作为 JsonAsset 正确导入，并返回资源 UUID。 */
function validatePuzzleLevelConfigMeta(configPath) {
  const metaPath = `${configPath}.meta`;
  if (!fs.existsSync(metaPath) || !fs.statSync(metaPath).isFile()) {
    throw new Error(`关卡 JSON 缺少 Creator .meta：${metaPath}`);
  }

  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch (error) {
    throw new Error(`无法读取关卡 JSON .meta：${metaPath}`, { cause: error });
  }
  if (
    !isPlainObject(meta) ||
    meta.importer !== "json" ||
    meta.imported !== true ||
    !STANDARD_UUID_PATTERN.test(meta.uuid) ||
    !Array.isArray(meta.files) ||
    !meta.files.includes(".json")
  ) {
    throw new Error(`${metaPath} 尚未被 Creator 正确导入为 JsonAsset。`);
  }
  return meta.uuid;
}

/** 扫描 level_XXX.json 文件并返回排序后的关卡编号。 */
export function collectConfigLevelNumbers(configsRoot) {
  assertExistingDirectory(configsRoot, "拼图关卡配置目录");
  const levelNumbers = [];
  for (const entry of fs.readdirSync(configsRoot, { withFileTypes: true })) {
    const match = /^level_(\d{3})\.json$/.exec(entry.name);
    if (match && entry.isFile()) {
      const level = Number(match[1]);
      assertLevelNumber(level, `关卡配置文件 ${entry.name}`);
      levelNumbers.push(level);
      continue;
    }

    // .meta 与说明文档不参与配置扫描；疑似关卡文件必须立即报错。
    if (entry.name.startsWith("level_") && !entry.name.endsWith(".meta")) {
      throw new Error(
        `关卡配置文件名无效：${entry.name}，必须使用 level_001.json 到 level_999.json。`,
      );
    }
    if (entry.isFile() && entry.name.endsWith(".json")) {
      throw new Error(`关卡配置目录包含未识别的 JSON：${entry.name}。`);
    }
  }
  levelNumbers.sort((first, second) => first - second);
  if (levelNumbers.length === 0) {
    throw new Error(`拼图关卡配置目录中没有单关 JSON：${configsRoot}`);
  }
  return levelNumbers;
}

/** 扫描 level_XXX 纹理目录并返回排序后的关卡编号。 */
export function collectTextureLevelNumbers(texturesRoot) {
  assertExistingDirectory(texturesRoot, "拼图关卡纹理目录");
  const levelNumbers = [];
  for (const entry of fs.readdirSync(texturesRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const match = /^level_(\d{3})$/.exec(entry.name);
    if (!match) {
      if (entry.name.startsWith("level_")) {
        throw new Error(
          `关卡纹理目录名无效：${entry.name}，必须使用 level_001 到 level_999。`,
        );
      }
      continue;
    }
    const level = Number(match[1]);
    assertLevelNumber(level, `关卡纹理目录 ${entry.name}`);
    levelNumbers.push(level);
  }
  levelNumbers.sort((first, second) => first - second);
  if (levelNumbers.length === 0) {
    throw new Error(`拼图关卡纹理目录中没有 level_XXX：${texturesRoot}`);
  }
  return levelNumbers;
}

/** 校验单关 PNG、SpriteFrame 元数据、尺寸和动态合图设置。 */
export function validatePuzzleLevelAsset(
  texturesRoot,
  config,
  { fixImportSettings = false } = {},
) {
  const levelName = createLevelName(config.level);
  const levelDirectory = path.join(texturesRoot, levelName);
  const imagePath = path.join(levelDirectory, `${levelName}_source.png`);
  const metaPath = `${imagePath}.meta`;
  if (!fs.existsSync(imagePath) || !fs.statSync(imagePath).isFile()) {
    throw new Error(`${levelName} 缺少命名一致的 PNG：${imagePath}`);
  }
  if (!fs.existsSync(metaPath) || !fs.statSync(metaPath).isFile()) {
    throw new Error(`${levelName} 缺少图片 .meta：${metaPath}`);
  }

  const imageSize = readPngSize(imagePath);
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  } catch (error) {
    throw new Error(`无法读取图片 .meta：${metaPath}`, { cause: error });
  }
  if (!isPlainObject(meta) || !isPlainObject(meta.subMetas)) {
    throw new Error(`${levelName} 的图片 .meta 缺少 subMetas 对象。`);
  }
  const spriteFrame = Object.values(meta.subMetas).find(
    (subMeta) => isPlainObject(subMeta) && subMeta.name === "spriteFrame",
  );
  if (!spriteFrame || !isPlainObject(spriteFrame.userData)) {
    throw new Error(`${levelName} 没有可加载的 SpriteFrame 子资源。`);
  }

  if (fixImportSettings && spriteFrame.userData.packable !== false) {
    spriteFrame.userData.packable = false;
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  }
  if (spriteFrame.userData.packable !== false) {
    throw new Error(
      `${levelName} 的 SpriteFrame 仍允许动态合图，请执行 npm run fix:level-imports。`,
    );
  }

  const rawWidth = spriteFrame.userData.rawWidth;
  const rawHeight = spriteFrame.userData.rawHeight;
  if (rawWidth !== imageSize.width || rawHeight !== imageSize.height) {
    throw new Error(
      `${levelName} 的 PNG 尺寸与 SpriteFrame 元数据不一致：` +
        `${imageSize.width}x${imageSize.height} / ${rawWidth}x${rawHeight}。`,
    );
  }
}

/** 从 PNG 的 IHDR 数据块读取原始宽高，不依赖额外图片库。 */
export function readPngSize(imagePath) {
  const buffer = fs.readFileSync(imagePath);
  const pngSignature = "89504e470d0a1a0a";
  if (
    buffer.length < 24 ||
    buffer.subarray(0, 8).toString("hex") !== pngSignature ||
    buffer.subarray(12, 16).toString("ascii") !== "IHDR"
  ) {
    throw new Error(`关卡图片不是有效 PNG：${imagePath}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

/** 校验配置与纹理两侧包含完全相同的关卡编号。 */
function assertSameLevelNumbers(configLevels, textureLevels) {
  const configSet = new Set(configLevels);
  const textureSet = new Set(textureLevels);
  const missingConfigs = textureLevels.filter((level) => !configSet.has(level));
  const missingTextures = configLevels.filter((level) => !textureSet.has(level));
  if (missingConfigs.length === 0 && missingTextures.length === 0) {
    return;
  }

  const details = [];
  if (missingConfigs.length > 0) {
    details.push(
      `缺少配置：${missingConfigs.map((level) => createLevelName(level)).join("、")}`,
    );
  }
  if (missingTextures.length > 0) {
    details.push(
      `缺少纹理：${missingTextures.map((level) => createLevelName(level)).join("、")}`,
    );
  }
  throw new Error(`关卡 JSON 与纹理目录不是一一对应（${details.join("；")}）。`);
}

/** 校验拼图块顺序完整覆盖 0 到总块数减一，且不存在重复。 */
function validatePieceOrder(pieceOrder, pieceCount, location) {
  if (!Array.isArray(pieceOrder)) {
    throw new Error(`${location} 必须是数组。`);
  }
  if (pieceOrder.length !== pieceCount) {
    throw new Error(`${location} 必须包含 ${pieceCount} 个拼图块编号。`);
  }

  const seenPieceIds = new Set();
  for (const pieceId of pieceOrder) {
    if (
      !Number.isInteger(pieceId) ||
      pieceId < 0 ||
      pieceId >= pieceCount ||
      seenPieceIds.has(pieceId)
    ) {
      throw new Error(
        `${location} 必须完整包含 0 到 ${pieceCount - 1}，且不能重复。`,
      );
    }
    seenPieceIds.add(pieceId);
  }
}

/** 校验关卡编号属于三位目录可表达的范围。 */
function assertLevelNumber(level, location) {
  if (
    !Number.isInteger(level) ||
    level < MIN_PUZZLE_LEVEL ||
    level > MAX_PUZZLE_LEVEL
  ) {
    throw new Error(
      `${location} 必须是 ${MIN_PUZZLE_LEVEL} 到 ${MAX_PUZZLE_LEVEL} 的整数。`,
    );
  }
}

/** 校验一个值为正整数。 */
function assertPositiveInteger(value, location) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${location} 必须是正整数。`);
  }
}

/** 校验一个值为有限正数。 */
function assertPositiveNumber(value, location) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${location} 必须是正数。`);
  }
}

/** 校验路径存在且为目录。 */
function assertExistingDirectory(directoryPath, location) {
  if (
    !fs.existsSync(directoryPath) ||
    !fs.statSync(directoryPath).isDirectory()
  ) {
    throw new Error(`${location}不存在：${directoryPath}`);
  }
}

/** 判断 JSON 值是否为普通对象。 */
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
