const gridSize = 8;

const state = {
  id: 0,
  grid: createEmptyGrid(),
  library: [],
  selectedCharacterIndex: -1
};

const elements = {
  characterId: document.querySelector("#character-id"),
  hexId: document.querySelector("#hex-id"),
  gridEditor: document.querySelector("#grid-editor"),
  rowSummaries: document.querySelector("#row-summaries"),
  outputDecimal: document.querySelector("#output-decimal"),
  outputHex: document.querySelector("#output-hex"),
  outputExport: document.querySelector("#output-export"),
  spritePreview: document.querySelector("#sprite-preview"),
  clearGrid: document.querySelector("#clear-grid"),
  copyOutput: document.querySelector("#copy-output"),
  saveCurrent: document.querySelector("#save-current"),
  importText: document.querySelector("#import-text"),
  importFile: document.querySelector("#import-file"),
  importLines: document.querySelector("#import-lines"),
  importStatus: document.querySelector("#import-status"),
  characterList: document.querySelector("#character-list"),
  libraryCount: document.querySelector("#library-count"),
  newCharacter: document.querySelector("#new-character"),
  downloadExport: document.querySelector("#download-export")
};

initialize();

function initialize() {
  buildGridEditor();
  buildPreview();
  attachEvents();
  render();
}

function createEmptyGrid() {
  return Array.from({ length: gridSize }, () => Array.from({ length: gridSize }, () => false));
}

function clampId(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(255, Math.trunc(value)));
}

function gridToRows(grid) {
  return grid.map((row) => {
    let byte = 0;

    row.forEach((isOn, columnIndex) => {
      if (isOn) {
        const bit = 7 - columnIndex;
        byte |= 1 << bit;
      }
    });

    return byte;
  });
}

function rowsToGrid(rows) {
  return Array.from({ length: gridSize }, (_, rowIndex) => {
    const byte = rows[rowIndex] ?? 0;

    return Array.from({ length: gridSize }, (_, columnIndex) => {
      const bit = 7 - columnIndex;
      return (byte & (1 << bit)) !== 0;
    });
  });
}

function toHex(value) {
  return `&${value.toString(16).toUpperCase().padStart(2, "0")}`;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.trunc(value)));
}

function parseNumericToken(token) {
  const normalized = token.trim();

  if (!normalized) {
    return Number.NaN;
  }

  if (normalized.startsWith("&")) {
    return Number.parseInt(normalized.slice(1), 16);
  }

  if (/^0x/i.test(normalized)) {
    return Number.parseInt(normalized, 16);
  }

  return Number.parseInt(normalized, 10);
}

function normalizeRows(rows) {
  return Array.from({ length: gridSize }, (_, rowIndex) => clampByte(rows[rowIndex] ?? 0));
}

function createCharacter(id, rows) {
  const safeId = clampId(id);
  const safeRows = normalizeRows(rows);

  return {
    id: safeId,
    rows: safeRows,
    grid: rowsToGrid(safeRows),
    decimal: `VDU(23,${safeId},${safeRows.join(",")})`,
    hex: `VDU(23,${toHex(safeId)},${safeRows.map(toHex).join(",")})`
  };
}

function compareCharacters(left, right) {
  return left.id - right.id;
}

function parseVDULine(line) {
  const trimmed = line.trim();

  if (!trimmed) {
    return null;
  }

  const match = trimmed.match(/^VDU\s*\((.*)\)$/i);

  if (!match) {
    return null;
  }

  const tokens = match[1].split(",").map((token) => token.trim());

  if (tokens.length !== 10) {
    return null;
  }

  const command = parseNumericToken(tokens[0]);

  if (command !== 23) {
    return null;
  }

  const values = tokens.slice(1).map(parseNumericToken);

  if (values.some((value) => Number.isNaN(value))) {
    return null;
  }

  return createCharacter(values[0], values.slice(1));
}

function setEditorFromCharacter(character) {
  state.id = character.id;
  state.grid = rowsToGrid(character.rows);
}

function setStatus(message) {
  elements.importStatus.textContent = message;
}

function sortLibrary() {
  state.library.sort(compareCharacters);
}

function replaceLibraryWithUniqueCharacters(characters) {
  const charactersById = new Map();

  characters.forEach((character) => {
    charactersById.set(character.id, character);
  });

  state.library = Array.from(charactersById.values()).sort(compareCharacters);
}

function upsertCharacter(character) {
  replaceLibraryWithUniqueCharacters([...state.library, character]);
  return findCharacterIndexForId(character.id);
}

function mergeCharacters(characters) {
  replaceLibraryWithUniqueCharacters([...state.library, ...characters]);
}

function saveCharacter(character) {
  const selectedCharacter = state.library[state.selectedCharacterIndex] ?? null;

  if (!selectedCharacter) {
    return upsertCharacter(character);
  }

  const remainingCharacters = state.library.filter((_, index) => index !== state.selectedCharacterIndex);
  replaceLibraryWithUniqueCharacters([...remainingCharacters, character]);
  return findCharacterIndexForId(character.id);
}

function selectCharacterAtIndex(index) {
  const character = state.library[index];

  if (!character) {
    return false;
  }

  state.selectedCharacterIndex = index;
  setEditorFromCharacter(character);
  return true;
}

function findCharacterIndexForId(id) {
  return state.library.findIndex((character) => character.id === id);
}

function applyIdSelection(requestedId) {
  const exactIndex = findCharacterIndexForId(requestedId);

  if (exactIndex >= 0) {
    selectCharacterAtIndex(exactIndex);
    setStatus(`Loaded ID ${state.library[exactIndex].id} from the saved set`);
    return;
  }

  state.id = requestedId;
  state.selectedCharacterIndex = -1;
}

function getExportCharacters() {
  if (state.library.length > 0) {
    return state.library;
  }

  return [getCharacter()];
}

function getCharacter() {
  return createCharacter(state.id, gridToRows(state.grid));
}

function buildGridEditor() {
  const fragment = document.createDocumentFragment();

  for (let row = 0; row < gridSize; row += 1) {
    for (let column = 0; column < gridSize; column += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "pixel";
      button.dataset.row = String(row);
      button.dataset.column = String(column);
      button.setAttribute("aria-label", `Row ${row + 1} Column ${column + 1}`);
      fragment.appendChild(button);
    }
  }

  elements.gridEditor.appendChild(fragment);
}

function buildPreview() {
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < gridSize * gridSize; index += 1) {
    const pixel = document.createElement("div");
    pixel.className = "preview-pixel";
    fragment.appendChild(pixel);
  }

  elements.spritePreview.appendChild(fragment);
}

function attachEvents() {
  elements.characterId.addEventListener("input", (event) => {
    const requestedId = clampId(Number(event.target.value));

    event.target.value = String(requestedId);
    applyIdSelection(requestedId);
    render();
  });

  elements.characterId.addEventListener("change", (event) => {
    const requestedId = clampId(Number(event.target.value));

    event.target.value = String(requestedId);
    applyIdSelection(requestedId);
    render();
  });

  elements.gridEditor.addEventListener("click", (event) => {
    const pixel = event.target.closest(".pixel");

    if (!pixel) {
      return;
    }

    const row = Number(pixel.dataset.row);
    const column = Number(pixel.dataset.column);
    state.grid[row][column] = !state.grid[row][column];
    render();
  });

  elements.clearGrid.addEventListener("click", () => {
    state.grid = createEmptyGrid();
    state.selectedCharacterIndex = -1;
    setStatus("Current grid cleared");
    render();
  });

  elements.saveCurrent.addEventListener("click", () => {
    const character = getCharacter();
    const existingIndex = findCharacterIndexForId(character.id);

    if (state.selectedCharacterIndex >= 0) {
      state.selectedCharacterIndex = saveCharacter(character);
      setStatus(`Updated ID ${character.id} in the character set`);
    } else if (existingIndex >= 0) {
      state.selectedCharacterIndex = upsertCharacter(character);
      setStatus(`Updated ID ${character.id} in the character set`);
    } else {
      state.selectedCharacterIndex = upsertCharacter(character);
      setStatus(`Saved ID ${character.id} to the character set`);
    }

    render();
  });

  elements.importLines.addEventListener("click", () => {
    importVDUText(elements.importText.value);
  });

  elements.importFile.addEventListener("change", async (event) => {
    const [file] = event.target.files ?? [];

    if (!file) {
      return;
    }

    const text = await file.text();
    elements.importText.value = text;
    importVDUText(text);
    event.target.value = "";
  });

  elements.newCharacter.addEventListener("click", () => {
    state.id = 0;
    state.grid = createEmptyGrid();
    state.selectedCharacterIndex = -1;
    setStatus("Blank character ready for editing");
    render();
  });

  elements.characterList.addEventListener("click", (event) => {
    const button = event.target.closest(".character-item");

    if (!button) {
      return;
    }

    const index = Number(button.dataset.index);
    const character = state.library[index];

    if (!character) {
      return;
    }

    selectCharacterAtIndex(index);
    setStatus(`Loaded ID ${character.id} into the editor`);
    render();
  });

  elements.copyOutput.addEventListener("click", async () => {
    const character = getCharacter();

    try {
      await navigator.clipboard.writeText(character.hex);
      elements.copyOutput.textContent = "Copied";
      globalThis.setTimeout(() => {
        elements.copyOutput.textContent = "Copy Hex";
      }, 1200);
    } catch {
      elements.copyOutput.textContent = "Copy Failed";
      globalThis.setTimeout(() => {
        elements.copyOutput.textContent = "Copy Hex";
      }, 1200);
    }
  });

  elements.downloadExport.addEventListener("click", () => {
    const exportText = getExportCharacters()
      .map((character) => character.decimal)
      .join("\n");
    const fileBlob = new Blob([exportText], { type: "text/plain;charset=utf-8" });
    const objectUrl = URL.createObjectURL(fileBlob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = "vdu-characters.txt";
    link.click();
    URL.revokeObjectURL(objectUrl);
    setStatus(`Downloaded ${getExportCharacters().length} VDU line(s)`);
  });
}

function importVDUText(text) {
  const lines = text.split(/\r?\n/);
  const parsedCharacters = [];
  let ignoredCount = 0;

  lines.forEach((line) => {
    if (!line.trim()) {
      return;
    }

    const character = parseVDULine(line);

    if (!character) {
      ignoredCount += 1;
      return;
    }

    parsedCharacters.push(character);
  });

  if (parsedCharacters.length === 0) {
    setStatus("No valid VDU lines found");
    return;
  }

  const replacedIds = new Set();

  parsedCharacters.forEach((character) => {
    if (findCharacterIndexForId(character.id) >= 0) {
      replacedIds.add(character.id);
    }
  });

  mergeCharacters(parsedCharacters);

  const importedCharacterId = parsedCharacters.at(-1).id;
  state.selectedCharacterIndex = findCharacterIndexForId(importedCharacterId);

  if (state.selectedCharacterIndex >= 0) {
    setEditorFromCharacter(state.library[state.selectedCharacterIndex]);
  }

  const ignoredSummary = ignoredCount > 0 ? `, ignored ${ignoredCount}` : "";
  const replacedSummary = replacedIds.size > 0 ? `, replaced ${replacedIds.size} existing ID(s)` : "";
  setStatus(`Imported ${parsedCharacters.length} line(s)${replacedSummary}${ignoredSummary}`);
  render();
}

function render() {
  const character = getCharacter();
  const previewGrid = rowsToGrid(character.rows);
  const exportCharacters = getExportCharacters();

  elements.characterId.value = String(character.id);
  elements.hexId.textContent = toHex(character.id);
  elements.outputDecimal.value = character.decimal;
  elements.outputHex.value = character.hex;
  elements.outputExport.value = exportCharacters.map((entry) => entry.decimal).join("\n");
  elements.libraryCount.textContent = `${state.library.length} saved`;

  renderGrid();
  renderRowSummaries(character.rows);
  renderPreview(previewGrid);
  renderCharacterList();
}

function renderGrid() {
  const pixels = elements.gridEditor.querySelectorAll(".pixel");

  pixels.forEach((pixel) => {
    const row = Number(pixel.dataset.row);
    const column = Number(pixel.dataset.column);
    const isOn = state.grid[row][column];

    pixel.classList.toggle("is-on", isOn);
    pixel.setAttribute("aria-pressed", String(isOn));
  });
}

function renderRowSummaries(rows) {
  elements.rowSummaries.innerHTML = rows
    .map((byte, rowIndex) => {
      return `
        <div class="row-entry">
          <div class="row-label">
            <span class="row-index">${rowIndex + 1}</span>
            <span>r${rowIndex + 1}</span>
          </div>
          <div class="row-value">${byte} / ${toHex(byte)}</div>
        </div>
      `;
    })
    .join("");
}

function renderPreview(grid) {
  const pixels = elements.spritePreview.querySelectorAll(".preview-pixel");

  pixels.forEach((pixel, index) => {
    const row = Math.floor(index / gridSize);
    const column = index % gridSize;
    pixel.classList.toggle("is-on", grid[row][column]);
  });
}

function renderCharacterList() {
  if (state.library.length === 0) {
    elements.characterList.innerHTML = '<div class="empty-state">No saved characters yet. Paste VDU lines, upload a text file, or save the current grid.</div>';
    return;
  }

  elements.characterList.innerHTML = state.library
    .map((character, index) => {
      const swatch = rowsToGrid(character.rows)
        .flat()
        .map((isOn) => `<span class="character-swatch-pixel${isOn ? " is-on" : ""}"></span>`)
        .join("");

      return `
        <button class="character-item${index === state.selectedCharacterIndex ? " is-selected" : ""}" type="button" data-index="${index}">
          <span class="character-swatch" aria-hidden="true">${swatch}</span>
          <span class="character-meta">
            <span class="character-title">ID ${character.id}</span>
            <span class="character-code">${character.decimal}</span>
          </span>
        </button>
      `;
    })
    .join("");
}