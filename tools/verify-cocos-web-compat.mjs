#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

/** 当前工具所在项目根目录。 */
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** 正式运行时代码根目录。 */
const applicationRoot = path.join(projectRoot, "assets/app");

/** 读取项目真实 TypeScript 配置，以便准确识别展开值的类型。 */
const configPath = path.join(projectRoot, "tsconfig.json");
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  throw new Error(
    ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"),
  );
}
const parsedConfig = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  projectRoot,
);
if (parsedConfig.errors.length > 0) {
  throw new Error(
    parsedConfig.errors
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      )
      .join("\n"),
  );
}

/** 判断类型是否能由 Cocos Web 的数组 concat 降级保持原有语义。 */
function isSafeArraySpreadType(checker, type) {
  if (type.isUnion()) {
    return type.types.every((member) => isSafeArraySpreadType(checker, member));
  }
  return checker.isArrayType(type) || checker.isTupleType(type);
}

/** 把可能跨行的表达式压成便于定位的单行摘要。 */
function summarizeExpression(sourceFile, expression) {
  const summary = expression.getText(sourceFile).replace(/\s+/g, " ");
  return summary.length <= 100 ? summary : `${summary.slice(0, 97)}...`;
}

const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
const checker = program.getTypeChecker();
const violations = [];
let checkedSpreadCount = 0;

/** 检查数组字面量中的展开；对象展开和参数展开不受本次兼容问题影响。 */
function inspectNode(sourceFile, node) {
  if (ts.isSpreadElement(node) && ts.isArrayLiteralExpression(node.parent)) {
    checkedSpreadCount += 1;
    const spreadType = checker.getTypeAtLocation(node.expression);
    if (!isSafeArraySpreadType(checker, spreadType)) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      violations.push(
        `${path.relative(projectRoot, sourceFile.fileName)}:` +
          `${position.line + 1}:${position.character + 1} ` +
          `展开类型 ${checker.typeToString(spreadType)}：` +
          summarizeExpression(sourceFile, node.expression),
      );
    }
  }
  ts.forEachChild(node, (child) => inspectNode(sourceFile, child));
}

for (const sourceFile of program.getSourceFiles()) {
  const sourcePath = path.resolve(sourceFile.fileName);
  const relativePath = path.relative(applicationRoot, sourcePath);
  if (
    sourceFile.isDeclarationFile ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    continue;
  }
  inspectNode(sourceFile, sourceFile);
}

if (violations.length > 0) {
  throw new Error(
    "Cocos Web 非数组 Iterable 展开检查失败。Creator 3.8.4 会把这类写法" +
      "降级为 [].concat(iterable)，请改用 Array.from(iterable)：\n" +
      violations.join("\n"),
  );
}

console.log(
  `Cocos Web 展开兼容检查通过：已检查 ${checkedSpreadCount} 个数组展开表达式。`,
);
