const CONFIG_KEYS = [
  "schemaVersion",
  "level",
  "sourceImagePath",
  "rows",
  "columns",
  "boardWidth",
  "boardHeight",
  "timeLimitSeconds",
  "pieceOrder",
];

const elements = Object.fromEntries(
  [
    "connectionState",
    "importButton",
    "downloadButton",
    "saveButton",
    "importInput",
    "levelCount",
    "levelSearch",
    "levelList",
    "editorTitle",
    "dirtyBadge",
    "savePath",
    "previewSize",
    "canvasStage",
    "puzzleCanvas",
    "canvasPlaceholder",
    "shuffleButton",
    "solveButton",
    "rebuildButton",
    "configForm",
    "levelField",
    "sourceImagePathField",
    "rowsField",
    "columnsField",
    "boardWidthField",
    "boardHeightField",
    "timedMode",
    "untimedMode",
    "timeValueGroup",
    "timeLimitField",
    "pieceOrderField",
    "pieceOrderCount",
    "validationPanel",
    "validationTitle",
    "validationMessage",
    "toastStack",
  ].map((id) => [id, document.getElementById(id)]),
);

const state = {
  levels: [],
  selectedLevel: null,
  draft: null,
  originalConfig: null,
  image: null,
  levelRequestId: 0,
  imageRequestId: 0,
  dirty: false,
  valid: false,
  saving: false,
  editorEnabled: false,
  interactionLocked: false,
  dragStartIndex: null,
  dragHoverIndex: null,
  canvasDisplayWidth: 0,
  canvasDisplayHeight: 0,
};

initializeEditor();

/** 初始化事件并载入工程中已有的全部关卡。 */
async function initializeEditor() {
  setEditorEnabled(false);
  bindEvents();
  try {
    const payload = await requestJson("/api/levels");
    state.levels = Array.isArray(payload.levels) ? payload.levels : [];
    elements.levelCount.textContent = String(state.levels.length);
    renderLevelList();
    setConnectionState("connected", `已连接 · ${state.levels.length} 个关卡`);
    if (state.levels.length > 0) {
      await selectLevel(state.levels[0].level, true);
    } else {
      setValidation("error", "没有可编辑关卡", "请先生成单关 JSON 配置文件。");
    }
  } catch (error) {
    setConnectionState("error", "无法连接本地工程");
    setValidation("error", "编辑器启动失败", getErrorMessage(error));
    showToast(getErrorMessage(error), "error");
  }
}

/** 绑定表单、导入导出、画布拖拽和快捷键事件。 */
function bindEvents() {
  elements.levelSearch.addEventListener("input", renderLevelList);
  elements.importButton.addEventListener("click", () => elements.importInput.click());
  elements.importInput.addEventListener("change", handleImportFile);
  elements.downloadButton.addEventListener("click", downloadCurrentConfig);
  elements.saveButton.addEventListener("click", () => void saveCurrentConfig());
  elements.shuffleButton.addEventListener("click", shufflePieceOrder);
  elements.solveButton.addEventListener("click", solvePieceOrder);
  elements.rebuildButton.addEventListener("click", rebuildPieceOrder);

  for (const field of [
    elements.rowsField,
    elements.columnsField,
    elements.boardWidthField,
    elements.boardHeightField,
    elements.timeLimitField,
    elements.pieceOrderField,
  ]) {
    field.addEventListener("input", updateDraftFromForm);
  }
  elements.timedMode.addEventListener("change", handleTimeModeChange);
  elements.untimedMode.addEventListener("change", handleTimeModeChange);

  elements.puzzleCanvas.addEventListener("pointerdown", handleCanvasPointerDown);
  elements.puzzleCanvas.addEventListener("pointermove", handleCanvasPointerMove);
  elements.puzzleCanvas.addEventListener("pointerup", handleCanvasPointerUp);
  elements.puzzleCanvas.addEventListener("pointercancel", cancelCanvasDrag);
  elements.puzzleCanvas.addEventListener("pointerleave", handleCanvasPointerLeave);

  window.addEventListener("resize", scheduleCanvasRender);
  window.addEventListener("beforeunload", (event) => {
    if (state.dirty || state.saving) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveCurrentConfig();
    }
  });
}

/** 渲染可搜索的既有关卡列表。 */
function renderLevelList() {
  const query = elements.levelSearch.value.trim().toLowerCase();
  const filteredLevels = state.levels.filter((entry) => {
    const searchable = `${entry.level} ${entry.levelName}`.toLowerCase();
    return searchable.includes(query);
  });
  elements.levelList.replaceChildren();

  if (filteredLevels.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-list";
    empty.textContent = query ? "没有匹配的关卡。" : "工程中没有单关 JSON。";
    elements.levelList.append(empty);
    return;
  }

  for (const entry of filteredLevels) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "level-item";
    button.dataset.level = String(entry.level);
    button.disabled = state.interactionLocked;
    button.setAttribute("role", "option");
    button.setAttribute(
      "aria-selected",
      String(entry.level === state.selectedLevel),
    );
    if (entry.level === state.selectedLevel) {
      button.classList.add("selected");
    }

    const number = document.createElement("span");
    number.className = "level-number";
    number.textContent = String(entry.level).padStart(2, "0");

    const copy = document.createElement("span");
    copy.className = "level-copy";
    const title = document.createElement("strong");
    title.textContent = `第 ${entry.level} 关`;
    const detail = document.createElement("small");
    detail.textContent =
      entry.timeLimitSeconds === null
        ? "不限时"
        : `${entry.timeLimitSeconds} 秒`;
    copy.append(title, detail);

    const meta = document.createElement("span");
    meta.className = "level-meta";
    meta.textContent = `${entry.rows}×${entry.columns}`;

    button.append(number, copy, meta);
    button.addEventListener("click", () => void selectLevel(entry.level));
    elements.levelList.append(button);
  }
}

/** 载入选中关卡；切换前会保护尚未保存的改动。 */
async function selectLevel(level, force = false) {
  if (state.interactionLocked) {
    return;
  }
  if (!force && level === state.selectedLevel) {
    return;
  }
  if (
    !force &&
    state.dirty &&
    !window.confirm("当前关卡有未保存修改，确定切换并放弃这些修改吗？")
  ) {
    return;
  }

  const requestId = ++state.levelRequestId;
  setEditorEnabled(false);
  clearPuzzleImage();
  try {
    const payload = await requestJson(`/api/levels/${level}`);
    if (requestId !== state.levelRequestId) {
      return;
    }
    const config = validateConfig(payload.config, level);
    state.selectedLevel = level;
    state.originalConfig = cloneConfig(config);
    state.draft = cloneConfig(config);
    state.dirty = false;
    state.valid = true;
    state.dragStartIndex = null;
    state.dragHoverIndex = null;
    populateForm(config);
    updateEditorHeading(config);
    renderLevelList();
    setEditorEnabled(true);
    await loadPuzzleImage(payload.imageUrl, level);
    if (requestId !== state.levelRequestId) {
      return;
    }
    refreshValidationAndPreview();
  } catch (error) {
    if (requestId !== state.levelRequestId) {
      return;
    }
    setValidation("error", "关卡载入失败", getErrorMessage(error));
    showToast(getErrorMessage(error), "error");
    setEditorEnabled(state.draft !== null);
  }
}

/** 把规范配置写入表单控件。 */
function populateForm(config) {
  elements.levelField.value = String(config.level);
  elements.sourceImagePathField.value = config.sourceImagePath;
  elements.rowsField.value = String(config.rows);
  elements.columnsField.value = String(config.columns);
  elements.boardWidthField.value = String(config.boardWidth);
  elements.boardHeightField.value = String(config.boardHeight);
  elements.timeLimitField.value = String(config.timeLimitSeconds ?? 30);
  elements.timedMode.checked = config.timeLimitSeconds !== null;
  elements.untimedMode.checked = config.timeLimitSeconds === null;
  updateTimeFieldState();
  writePieceOrder(config.pieceOrder);
}

/** 从当前表单构建草稿并实时更新校验、脏状态和预览。 */
function updateDraftFromForm() {
  if (state.interactionLocked || state.selectedLevel === null) {
    return;
  }
  try {
    state.draft = createDraftFromForm();
  } catch (error) {
    state.valid = false;
    state.dirty = true;
    updateDirtyState();
    setValidation("error", "参数格式错误", getErrorMessage(error));
    elements.saveButton.disabled = true;
    elements.downloadButton.disabled = true;
    return;
  }
  refreshValidationAndPreview();
}

/** 根据表单字段创建固定 schema 的配置对象。 */
function createDraftFromForm() {
  return {
    schemaVersion: 1,
    level: state.selectedLevel,
    sourceImagePath: createSourceImagePath(state.selectedLevel),
    rows: readNumberInput(elements.rowsField),
    columns: readNumberInput(elements.columnsField),
    boardWidth: readNumberInput(elements.boardWidthField),
    boardHeight: readNumberInput(elements.boardHeightField),
    timeLimitSeconds: elements.untimedMode.checked
      ? null
      : readNumberInput(elements.timeLimitField),
    pieceOrder: parsePieceOrderText(elements.pieceOrderField.value),
  };
}

/** 严格校验草稿并刷新所有派生 UI 状态。 */
function refreshValidationAndPreview() {
  if (!state.draft || state.selectedLevel === null) {
    return;
  }
  try {
    state.draft = validateConfig(state.draft, state.selectedLevel);
    state.valid = true;
    state.dirty =
      JSON.stringify(state.draft) !== JSON.stringify(state.originalConfig);
    setValidation(
      "valid",
      "配置校验通过",
      `${state.draft.rows * state.draft.columns} 个切片，JSON 可保存或导出。`,
    );
    renderPuzzleCanvas();
  } catch (error) {
    state.valid = false;
    state.dirty = true;
    setValidation("error", "配置校验未通过", getErrorMessage(error));
  }
  elements.pieceOrderCount.textContent = `${state.draft.pieceOrder?.length ?? 0} 项`;
  elements.previewSize.textContent = `${state.draft.boardWidth || "—"} × ${state.draft.boardHeight || "—"}`;
  updateDirtyState();
  elements.saveButton.disabled = !state.valid || state.interactionLocked;
  elements.downloadButton.disabled = !state.valid || state.interactionLocked;
}

/** 严格校验完整单关 JSON，并返回字段顺序稳定的配置。 */
function validateConfig(value, expectedLevel) {
  if (!isPlainObject(value)) {
    throw new Error("关卡配置必须是 JSON 对象。");
  }
  const keys = Object.keys(value);
  for (const key of CONFIG_KEYS) {
    if (!Object.hasOwn(value, key)) {
      throw new Error(`缺少必填字段：${key}`);
    }
  }
  for (const key of keys) {
    if (!CONFIG_KEYS.includes(key)) {
      throw new Error(`包含不支持的字段：${key}`);
    }
  }
  if (value.schemaVersion !== 1) {
    throw new Error("schemaVersion 必须为 1。");
  }
  if (!Number.isInteger(value.level) || value.level !== expectedLevel) {
    throw new Error(`level 必须与既有关卡编号 ${expectedLevel} 一致。`);
  }
  const expectedPath = createSourceImagePath(expectedLevel);
  if (value.sourceImagePath !== expectedPath) {
    throw new Error(`sourceImagePath 必须为 ${expectedPath}。`);
  }
  assertPositiveInteger(value.rows, "rows");
  assertPositiveInteger(value.columns, "columns");
  assertPositiveNumber(value.boardWidth, "boardWidth");
  assertPositiveNumber(value.boardHeight, "boardHeight");
  if (value.timeLimitSeconds !== null) {
    assertPositiveInteger(value.timeLimitSeconds, "timeLimitSeconds");
  }
  if (!Array.isArray(value.pieceOrder)) {
    throw new Error("pieceOrder 必须是数组。");
  }

  const pieceCount = value.rows * value.columns;
  if (value.pieceOrder.length !== pieceCount) {
    throw new Error(
      `pieceOrder 应包含 ${pieceCount} 项，当前为 ${value.pieceOrder.length} 项。`,
    );
  }
  const seen = new Set();
  for (const pieceId of value.pieceOrder) {
    if (!Number.isInteger(pieceId) || pieceId < 0 || pieceId >= pieceCount) {
      throw new Error(`pieceOrder 必须完整包含 0 到 ${pieceCount - 1}。`);
    }
    if (seen.has(pieceId)) {
      throw new Error(`pieceOrder 中的切片 ${pieceId} 重复。`);
    }
    seen.add(pieceId);
  }

  return {
    schemaVersion: 1,
    level: value.level,
    sourceImagePath: value.sourceImagePath,
    rows: value.rows,
    columns: value.columns,
    boardWidth: value.boardWidth,
    boardHeight: value.boardHeight,
    timeLimitSeconds: value.timeLimitSeconds,
    pieceOrder: Array.from(value.pieceOrder),
  };
}

/** 关卡编号变化时创建只读图片资源路径。 */
function createSourceImagePath(level) {
  const levelName = `level_${String(level).padStart(3, "0")}`;
  return `textures/game/levels/${levelName}/${levelName}_source/spriteFrame`;
}

/** 处理限时/不限时切换。 */
function handleTimeModeChange() {
  if (state.interactionLocked) {
    return;
  }
  updateTimeFieldState();
  updateDraftFromForm();
}

/** 根据计时模式控制秒数输入框。 */
function updateTimeFieldState() {
  const untimed = elements.untimedMode.checked;
  elements.timeLimitField.disabled = untimed;
  elements.timeValueGroup.classList.toggle("disabled", untimed);
}

/** 使用当前行列创建完整正确顺序。 */
function rebuildPieceOrder() {
  if (state.interactionLocked) {
    return;
  }
  let rows;
  let columns;
  try {
    rows = readNumberInput(elements.rowsField);
    columns = readNumberInput(elements.columnsField);
    assertPositiveInteger(rows, "rows");
    assertPositiveInteger(columns, "columns");
  } catch (error) {
    showToast(getErrorMessage(error), "error");
    return;
  }
  writePieceOrder(createSolvedOrder(rows * columns));
  updateDraftFromForm();
}

/** 将现有切片恢复为正确顺序。 */
function solvePieceOrder() {
  if (state.interactionLocked || !state.draft) {
    return;
  }
  const pieceCount = Number(elements.rowsField.value) * Number(elements.columnsField.value);
  if (!Number.isSafeInteger(pieceCount) || pieceCount <= 0) {
    showToast("请先填写有效的行数和列数。", "error");
    return;
  }
  writePieceOrder(createSolvedOrder(pieceCount));
  updateDraftFromForm();
}

/** 使用 Fisher–Yates 创建不等于正确顺序的随机排列。 */
function shufflePieceOrder() {
  if (state.interactionLocked) {
    return;
  }
  const pieceCount = Number(elements.rowsField.value) * Number(elements.columnsField.value);
  if (!Number.isSafeInteger(pieceCount) || pieceCount <= 0) {
    showToast("请先填写有效的行数和列数。", "error");
    return;
  }
  const order = createSolvedOrder(pieceCount);
  for (let index = order.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [order[index], order[target]] = [order[target], order[index]];
  }
  if (order.length > 1 && order.every((pieceId, index) => pieceId === index)) {
    [order[0], order[1]] = [order[1], order[0]];
  }
  writePieceOrder(order);
  updateDraftFromForm();
}

/** 创建从 0 开始的完整切片顺序。 */
function createSolvedOrder(pieceCount) {
  return Array.from({ length: pieceCount }, (_, index) => index);
}

/** 把切片顺序格式化成便于人工编辑的多行文本。 */
function writePieceOrder(order) {
  const chunks = [];
  for (let index = 0; index < order.length; index += 16) {
    chunks.push(order.slice(index, index + 16).join(", "));
  }
  elements.pieceOrderField.value = chunks.join(",\n");
  elements.pieceOrderCount.textContent = `${order.length} 项`;
}

/** 解析 JSON 数组或逗号/空白分隔的 pieceOrder 文本。 */
function parsePieceOrderText(source) {
  const trimmed = source.trim();
  if (trimmed === "") {
    return [];
  }
  if (trimmed.startsWith("[")) {
    let value;
    try {
      value = JSON.parse(trimmed);
    } catch (error) {
      throw new Error(`pieceOrder JSON 解析失败：${getErrorMessage(error)}`);
    }
    if (!Array.isArray(value)) {
      throw new Error("pieceOrder JSON 必须是数组。");
    }
    return value;
  }
  return trimmed.split(/[\s,]+/).map((token) => {
    const value = Number(token);
    if (!Number.isInteger(value)) {
      throw new Error(`pieceOrder 包含非整数：${token}`);
    }
    return value;
  });
}

/** 异步载入当前关卡原图，使用序号阻止旧请求覆盖新关卡。 */
async function loadPuzzleImage(imageUrl, level) {
  const requestId = ++state.imageRequestId;
  const image = new Image();
  image.decoding = "async";
  await new Promise((resolve, reject) => {
    image.addEventListener("load", resolve, { once: true });
    image.addEventListener("error", () => reject(new Error(`第 ${level} 关原图载入失败。`)), {
      once: true,
    });
    image.src = `${imageUrl}?v=${Date.now()}`;
  });
  if (requestId !== state.imageRequestId || level !== state.selectedLevel) {
    return;
  }
  state.image = image;
  elements.canvasPlaceholder.hidden = true;
  elements.puzzleCanvas.classList.add("ready");
  renderPuzzleCanvas();
}

/** 切换关卡时清除旧图，防止异步加载期间展示不匹配的切片。 */
function clearPuzzleImage() {
  state.imageRequestId += 1;
  state.image = null;
  state.canvasDisplayWidth = 0;
  state.canvasDisplayHeight = 0;
  elements.puzzleCanvas.classList.remove("ready", "dragging");
  elements.canvasPlaceholder.hidden = false;
}

/** 按真实原图切片和 pieceOrder 绘制乱序预览及网格。 */
function renderPuzzleCanvas() {
  if (!state.image || !state.valid || !state.draft) {
    return;
  }
  const config = state.draft;
  const stageWidth = Math.max(160, elements.canvasStage.clientWidth - 44);
  const stageHeight = Math.max(160, elements.canvasStage.clientHeight - 44);
  const ratio = config.boardWidth / config.boardHeight;
  let displayWidth = Math.min(stageWidth, stageHeight * ratio);
  let displayHeight = displayWidth / ratio;
  if (displayHeight > stageHeight) {
    displayHeight = stageHeight;
    displayWidth = displayHeight * ratio;
  }
  displayWidth = Math.max(1, Math.floor(displayWidth));
  displayHeight = Math.max(1, Math.floor(displayHeight));

  const canvas = elements.puzzleCanvas;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(displayWidth * pixelRatio);
  canvas.height = Math.floor(displayHeight * pixelRatio);
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
  state.canvasDisplayWidth = displayWidth;
  state.canvasDisplayHeight = displayHeight;

  const context = canvas.getContext("2d");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, displayWidth, displayHeight);

  const cellWidth = displayWidth / config.columns;
  const cellHeight = displayHeight / config.rows;
  const sourceCellWidth = state.image.naturalWidth / config.columns;
  const sourceCellHeight = state.image.naturalHeight / config.rows;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  config.pieceOrder.forEach((pieceId, boardIndex) => {
    const boardColumn = boardIndex % config.columns;
    const boardRow = Math.floor(boardIndex / config.columns);
    const sourceColumn = pieceId % config.columns;
    const sourceRow = Math.floor(pieceId / config.columns);
    context.drawImage(
      state.image,
      sourceColumn * sourceCellWidth,
      sourceRow * sourceCellHeight,
      sourceCellWidth,
      sourceCellHeight,
      boardColumn * cellWidth,
      boardRow * cellHeight,
      cellWidth,
      cellHeight,
    );
  });

  drawGrid(context, config, cellWidth, cellHeight, displayWidth, displayHeight);
  drawDragHighlights(context, config, cellWidth, cellHeight);
}

/** 绘制切片网格和棋盘外框。 */
function drawGrid(context, config, cellWidth, cellHeight, width, height) {
  context.save();
  context.beginPath();
  context.strokeStyle = "rgba(255, 255, 255, 0.72)";
  context.lineWidth = 1;
  for (let column = 1; column < config.columns; column += 1) {
    const x = column * cellWidth;
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }
  for (let row = 1; row < config.rows; row += 1) {
    const y = row * cellHeight;
    context.moveTo(0, y);
    context.lineTo(width, y);
  }
  context.stroke();
  context.strokeStyle = "rgba(16, 25, 47, 0.58)";
  context.lineWidth = 2;
  context.strokeRect(1, 1, width - 2, height - 2);
  context.restore();
}

/** 拖拽期间高亮起点和当前交换目标。 */
function drawDragHighlights(context, config, cellWidth, cellHeight) {
  const highlights = [
    [state.dragStartIndex, "rgba(108, 92, 231, 0.42)", "#f6f3ff"],
    [state.dragHoverIndex, "rgba(246, 185, 88, 0.35)", "#ffd78f"],
  ];
  for (const [index, fill, stroke] of highlights) {
    if (index === null) {
      continue;
    }
    const column = index % config.columns;
    const row = Math.floor(index / config.columns);
    context.fillStyle = fill;
    context.fillRect(column * cellWidth, row * cellHeight, cellWidth, cellHeight);
    context.strokeStyle = stroke;
    context.lineWidth = 3;
    context.strokeRect(
      column * cellWidth + 1.5,
      row * cellHeight + 1.5,
      cellWidth - 3,
      cellHeight - 3,
    );
  }
}

/** 开始拖拽一个棋盘格。 */
function handleCanvasPointerDown(event) {
  if (state.interactionLocked) {
    return;
  }
  const index = getCanvasCellIndex(event);
  if (index === null || !state.valid) {
    return;
  }
  state.dragStartIndex = index;
  state.dragHoverIndex = index;
  elements.puzzleCanvas.setPointerCapture(event.pointerId);
  elements.puzzleCanvas.classList.add("dragging");
  renderPuzzleCanvas();
}

/** 更新拖拽交换目标。 */
function handleCanvasPointerMove(event) {
  if (state.dragStartIndex === null) {
    return;
  }
  const index = getCanvasCellIndex(event);
  if (index !== state.dragHoverIndex) {
    state.dragHoverIndex = index;
    renderPuzzleCanvas();
  }
}

/** 结束拖拽并交换两个位置的切片编号。 */
function handleCanvasPointerUp(event) {
  if (state.interactionLocked) {
    cancelCanvasDrag(event);
    return;
  }
  if (state.dragStartIndex === null || !state.draft) {
    return;
  }
  const targetIndex = getCanvasCellIndex(event);
  const sourceIndex = state.dragStartIndex;
  if (targetIndex !== null && targetIndex !== sourceIndex) {
    const order = Array.from(state.draft.pieceOrder);
    [order[sourceIndex], order[targetIndex]] = [order[targetIndex], order[sourceIndex]];
    writePieceOrder(order);
  }
  cancelCanvasDrag(event);
  updateDraftFromForm();
}

/** 指针离开但仍持有 capture 时保留拖拽，否则清除悬停。 */
function handleCanvasPointerLeave(event) {
  if (!elements.puzzleCanvas.hasPointerCapture(event.pointerId)) {
    state.dragHoverIndex = null;
    renderPuzzleCanvas();
  }
}

/** 清除画布拖拽状态。 */
function cancelCanvasDrag(event) {
  if (
    event?.pointerId !== undefined &&
    elements.puzzleCanvas.hasPointerCapture(event.pointerId)
  ) {
    elements.puzzleCanvas.releasePointerCapture(event.pointerId);
  }
  state.dragStartIndex = null;
  state.dragHoverIndex = null;
  elements.puzzleCanvas.classList.remove("dragging");
  renderPuzzleCanvas();
}

/** 把指针坐标换算成 pieceOrder 的棋盘位置下标。 */
function getCanvasCellIndex(event) {
  if (!state.draft || state.canvasDisplayWidth <= 0 || state.canvasDisplayHeight <= 0) {
    return null;
  }
  const bounds = elements.puzzleCanvas.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  if (x < 0 || y < 0 || x >= bounds.width || y >= bounds.height) {
    return null;
  }
  const column = Math.min(
    state.draft.columns - 1,
    Math.floor((x / bounds.width) * state.draft.columns),
  );
  const row = Math.min(
    state.draft.rows - 1,
    Math.floor((y / bounds.height) * state.draft.rows),
  );
  return row * state.draft.columns + column;
}

/** 使用 animation frame 合并连续窗口尺寸变化。 */
let resizeFrame = 0;
function scheduleCanvasRender() {
  window.cancelAnimationFrame(resizeFrame);
  resizeFrame = window.requestAnimationFrame(renderPuzzleCanvas);
}

/** 导入并严格校验一个既有关卡的完整 JSON。 */
async function handleImportFile() {
  if (state.interactionLocked) {
    elements.importInput.value = "";
    return;
  }
  const [file] = elements.importInput.files;
  elements.importInput.value = "";
  if (!file) {
    return;
  }
  if (file.size > 1024 * 1024) {
    showToast("导入文件超过 1MB 限制。", "error");
    return;
  }

  setInteractionLocked(true);
  try {
    const value = JSON.parse(await file.text());
    if (!Number.isInteger(value?.level)) {
      throw new Error("导入 JSON 缺少有效的 level。");
    }
    if (!state.levels.some((entry) => entry.level === value.level)) {
      throw new Error(`第 ${value.level} 关不是工程中已存在的关卡，不能导入。`);
    }
    const config = validateConfig(value, value.level);

    if (
      state.dirty &&
      !window.confirm("导入会替换当前未保存内容，确定继续吗？")
    ) {
      return;
    }

    const requestId = ++state.levelRequestId;
    clearPuzzleImage();
    const payload = await requestJson(`/api/levels/${config.level}`);
    if (requestId !== state.levelRequestId) {
      return;
    }
    const currentConfig = validateConfig(payload.config, config.level);
    state.selectedLevel = config.level;
    state.originalConfig = cloneConfig(currentConfig);
    state.draft = cloneConfig(config);
    state.dirty = true;
    state.valid = true;
    populateForm(config);
    updateEditorHeading(config);
    renderLevelList();
    await loadPuzzleImage(payload.imageUrl, config.level);
    if (requestId !== state.levelRequestId) {
      return;
    }
    refreshValidationAndPreview();
    showToast(`已导入 ${file.name}，保存前请检查预览。`);
  } catch (error) {
    showToast(`导入失败：${getErrorMessage(error)}`, "error");
  } finally {
    setInteractionLocked(false);
  }
}

/** 下载当前已通过校验的规范 JSON。 */
function downloadCurrentConfig() {
  if (state.interactionLocked) {
    return;
  }
  if (!state.valid || !state.draft) {
    showToast("当前配置未通过校验，不能下载。", "error");
    return;
  }
  const blob = new Blob([`${JSON.stringify(state.draft, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `level_${String(state.draft.level).padStart(3, "0")}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast(`已下载第 ${state.draft.level} 关 JSON。`);
}

/** 通过本地服务严格校验并原子保存当前既有关卡。 */
async function saveCurrentConfig() {
  if (state.saving || state.interactionLocked || !state.editorEnabled) {
    return;
  }
  if (!state.valid || !state.draft || state.selectedLevel === null) {
    showToast("当前配置未通过校验，不能保存。", "error");
    return;
  }

  // 保存期间只使用固定快照，避免异步回包读取已经变化的关卡或草稿。
  const targetLevel = state.selectedLevel;
  const savingDraft = cloneConfig(state.draft);
  const originalLabel = elements.saveButton.textContent;
  setSavingState(true);
  elements.saveButton.textContent = "保存中…";
  try {
    const payload = await requestJson(`/api/levels/${targetLevel}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(savingDraft),
    });
    const config = validateConfig(payload.config, targetLevel);
    if (state.selectedLevel !== targetLevel) {
      throw new Error(`保存期间关卡状态发生变化：${targetLevel}`);
    }
    state.originalConfig = cloneConfig(config);
    state.draft = cloneConfig(config);
    state.dirty = false;
    updateLevelSummary(config);
    populateForm(config);
    refreshValidationAndPreview();
    renderLevelList();
    showToast(payload.message || `第 ${config.level} 关已保存。`);
  } catch (error) {
    showToast(`保存失败：${getErrorMessage(error)}`, "error");
  } finally {
    setSavingState(false);
    elements.saveButton.textContent = originalLabel;
  }
}

/** 保存后同步左侧列表中的行列和计时摘要。 */
function updateLevelSummary(config) {
  const summary = state.levels.find((entry) => entry.level === config.level);
  if (!summary) {
    return;
  }
  summary.rows = config.rows;
  summary.columns = config.columns;
  summary.timeLimitSeconds = config.timeLimitSeconds;
  summary.sourceImagePath = config.sourceImagePath;
}

/** 更新标题、保存位置和只读字段。 */
function updateEditorHeading(config) {
  const levelName = `level_${String(config.level).padStart(3, "0")}`;
  elements.editorTitle.textContent = `第 ${config.level} 关 · ${config.rows} × ${config.columns}`;
  elements.savePath.textContent = `assets/resources/configs/game/levels/${levelName}.json`;
  elements.previewSize.textContent = `${config.boardWidth} × ${config.boardHeight}`;
}

/** 更新“未保存”提示和标题中的行列信息。 */
function updateDirtyState() {
  elements.dirtyBadge.hidden = !state.dirty;
  if (state.draft && state.selectedLevel !== null) {
    elements.editorTitle.textContent = `第 ${state.selectedLevel} 关 · ${state.draft.rows || "—"} × ${state.draft.columns || "—"}`;
  }
}

/** 设置校验结果面板。 */
function setValidation(status, title, message) {
  elements.validationPanel.dataset.state = status;
  elements.validationTitle.textContent = title;
  elements.validationMessage.textContent = message;
  elements.validationPanel.querySelector(".validation-icon").textContent =
    status === "error" ? "!" : status === "valid" ? "✓" : "·";
}

/** 控制依赖当前关卡的编辑功能是否可用。 */
function setEditorEnabled(enabled) {
  const effectiveEnabled = enabled && !state.interactionLocked;
  state.editorEnabled = effectiveEnabled;
  for (const element of [
    elements.importButton,
    elements.downloadButton,
    elements.saveButton,
    elements.shuffleButton,
    elements.solveButton,
    elements.rebuildButton,
    elements.rowsField,
    elements.columnsField,
    elements.boardWidthField,
    elements.boardHeightField,
    elements.timedMode,
    elements.untimedMode,
    elements.timeLimitField,
    elements.pieceOrderField,
  ]) {
    element.disabled = !effectiveEnabled;
  }
  if (effectiveEnabled) {
    updateTimeFieldState();
    elements.saveButton.disabled = !state.valid;
    elements.downloadButton.disabled = !state.valid;
  }
}

/** 异步导入或保存期间统一锁定会改变关卡、草稿或预览的全部交互。 */
function setInteractionLocked(locked) {
  state.interactionLocked = locked;
  if (locked) {
    cancelCanvasDrag();
  }
  setEditorEnabled(!locked && state.draft !== null);
  elements.levelSearch.disabled = locked;
  elements.levelList.inert = locked;
  elements.levelList.setAttribute("aria-busy", String(locked));
  elements.puzzleCanvas.inert = locked;
  elements.puzzleCanvas.setAttribute("aria-disabled", String(locked));
  for (const button of elements.levelList.querySelectorAll(".level-item")) {
    button.disabled = locked;
  }
}

/** 标记保存生命周期，并复用统一交互锁阻止单标签页内的并发修改。 */
function setSavingState(saving) {
  state.saving = saving;
  setInteractionLocked(saving);
}

/** 更新本地服务连接状态。 */
function setConnectionState(status, label) {
  elements.connectionState.className = `connection-state ${status}`;
  elements.connectionState.lastChild.textContent = label;
}

/** 调用本地 API，并将非成功响应转换为可读异常。 */
async function requestJson(url, options) {
  const response = await fetch(url, options);
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(payload?.error || `请求失败：HTTP ${response.status}`);
  }
  return payload;
}

/** 展示会自动消失的操作结果。 */
function showToast(message, kind = "normal") {
  const toast = document.createElement("div");
  toast.className = kind === "error" ? "toast error" : "toast";
  toast.textContent = message;
  elements.toastStack.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

/** 读取数值输入；空值作为 NaN 交给严格校验报告。 */
function readNumberInput(input) {
  return input.value.trim() === "" ? Number.NaN : Number(input.value);
}

/** 校验字段是正整数。 */
function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label} 必须是正整数。`);
  }
}

/** 校验字段是有限正数。 */
function assertPositiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} 必须是正数。`);
  }
}

/** 创建不共享 pieceOrder 引用的配置副本。 */
function cloneConfig(config) {
  return { ...config, pieceOrder: Array.from(config.pieceOrder) };
}

/** 判断值是否为普通 JSON 对象。 */
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 从未知异常中取得可展示文本。 */
function getErrorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? "未知错误");
}
