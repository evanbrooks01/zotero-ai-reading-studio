const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "zotero-ai-reading.js"), "utf8");
const context = { Map, URL };
vm.createContext(context);
vm.runInContext(source, context, { filename: "zotero-ai-reading.js" });

const sut = context.ZoteroAIReading;

function verifyOfficialSelectionEventRegistration() {
  const registered = [];
  const originalZotero = context.Zotero;
  const originalReaders = sut.getOpenReaders;
  const originalLog = sut.log;

  try {
    context.Zotero = {
      Reader: {
        registerEventListener(type, handler, pluginID) {
          registered.push({ type, handler, pluginID });
        }
      }
    };
    sut.id = "selection-test@example.invalid";
    sut.getOpenReaders = () => [];
    sut.log = () => {};
    sut.registerReaderPanel();

    assert.deepStrictEqual(
      registered.map(({ type }) => type),
      ["renderToolbar", "renderTextSelectionPopup"]
    );
    assert.strictEqual(registered[1].pluginID, sut.id);
  }
  finally {
    sut.getOpenReaders = originalReaders;
    sut.log = originalLog;
    context.Zotero = originalZotero;
  }
}

function verifyOfficialSelectionWinsAndCancelsFallback() {
  const reader = { type: "pdf" };
  const doc = {
    defaultView: {
      getSelection() {
        return { rangeCount: 1, isCollapsed: false };
      }
    }
  };
  const state = {
    reader,
    doc,
    sourceText: "",
    officialSelectionText: "",
    selectionTimer: "pending"
  };
  const originalStates = sut.readerSelectionStates;
  const originalOfficialTexts = sut.readerOfficialSelectionTexts;
  const originalGetBoolPref = sut.getBoolPref;
  const originalClearTimer = sut.clearReaderSelectionTranslationTimer;
  const originalHandle = sut.handleReaderSelectionTranslation;
  let handled = null;

  try {
    sut.readerSelectionStates = new Map([[doc, state]]);
    sut.readerOfficialSelectionTexts = new Map();
    sut.readerSelectionActive = true;
    sut.getBoolPref = () => true;
    sut.clearReaderSelectionTranslationTimer = (candidate) => {
      candidate.selectionTimer = null;
    };
    sut.handleReaderSelectionTranslation = (handledDoc, handledState) => {
      handled = { doc: handledDoc, state: handledState };
    };

    sut.handleReaderTextSelectionEvent({
      reader,
      params: { annotation: { text: "exact selected lower text" } }
    });

    assert.strictEqual(state.officialSelectionText, "exact selected lower text");
    assert.strictEqual(sut.readerOfficialSelectionTexts.get(reader), "exact selected lower text");
    assert.strictEqual(state.selectionTimer, null);
    assert.strictEqual(handled.doc, doc);
    assert.strictEqual(handled.state, state);
  }
  finally {
    sut.readerSelectionStates = originalStates;
    sut.readerOfficialSelectionTexts = originalOfficialTexts;
    sut.getBoolPref = originalGetBoolPref;
    sut.clearReaderSelectionTranslationTimer = originalClearTimer;
    sut.handleReaderSelectionTranslation = originalHandle;
  }
}

function verifyNativeRangeWinsOverGeometryReconstruction() {
  const rootNode = {
    nodeType: 1,
    closest() {
      return {};
    }
  };
  const range = {
    commonAncestorContainer: rootNode,
    startContainer: rootNode,
    endContainer: rootNode,
    toString() {
      return "selected lower text";
    },
    cloneContents() {
      return { textContent: "selected lower text" };
    }
  };
  const doc = {
    defaultView: {
      getSelection() {
        return {
          rangeCount: 1,
          isCollapsed: false,
          getRangeAt() {
            return range;
          }
        };
      }
    }
  };
  const originalStates = sut.readerSelectionStates;
  const originalOfficialTexts = sut.readerOfficialSelectionTexts;
  const originalLayerSelection = sut.getReaderTextLayerSelection;

  try {
    sut.readerSelectionStates = new Map();
    sut.readerOfficialSelectionTexts = new Map();
    sut.getReaderTextLayerSelection = () => "wrong upper line and truncated lower line";

    assert.strictEqual(sut.getReaderSelectedText(doc), "selected lower text");
  }
  finally {
    sut.readerSelectionStates = originalStates;
    sut.readerOfficialSelectionTexts = originalOfficialTexts;
    sut.getReaderTextLayerSelection = originalLayerSelection;
  }
}

function verifyNativeRangeWinsOverTruncatedOfficialAnnotation() {
  const rootNode = {
    nodeType: 1,
    closest(selector) {
      return selector === ".textLayer, .markedContent, .endOfContent" ? {} : null;
    }
  };
  const range = {
    commonAncestorContainer: rootNode,
    startContainer: rootNode,
    endContainer: rootNode,
    toString() {
      return "native selection with the complete tail";
    }
  };
  const doc = {
    defaultView: {
      getSelection() {
        return {
          rangeCount: 1,
          isCollapsed: false,
          getRangeAt() {
            return range;
          }
        };
      }
    }
  };
  const reader = { type: "pdf" };
  const originalStates = sut.readerSelectionStates;
  const originalOfficialTexts = sut.readerOfficialSelectionTexts;

  try {
    sut.readerSelectionStates = new Map([[doc, { reader, officialSelectionText: "truncated official text" }]]);
    sut.readerOfficialSelectionTexts = new Map([[reader, "truncated official text"]]);
    assert.strictEqual(
      sut.getReaderSelectedText(doc),
      "native selection with the complete tail"
    );
  }
  finally {
    sut.readerSelectionStates = originalStates;
    sut.readerOfficialSelectionTexts = originalOfficialTexts;
  }
}

function verifyTranslationOutputNeverBlanks() {
  const makeTextNode = () => ({ textContent: "", attributes: new Map(), setAttribute(name, value) { this.attributes.set(name, String(value)); } });
  const state = {
    pane: makeTextNode(),
    sourceNode: makeTextNode(),
    outputNode: makeTextNode(),
    statusNode: makeTextNode(),
    sourceText: "selected text",
    resultText: "已有译文",
    statusMessage: "",
    statusState: "",
    canTranslate: true,
    translationChunks: ["selected text"],
    translationProgress: 1,
    modelSelect: null,
    reasoningSelect: null,
    translateButton: null,
    chatButton: null,
    copyButton: null
  };
  const originalGetBoolPref = sut.getBoolPref;

  try {
    sut.getBoolPref = () => true;
    assert.strictEqual(
      sut.updateReaderTranslationSourceState(state, "selected text", { sectionTitle: "same section" }),
      false
    );
    assert.strictEqual(state.resultText, "已有译文");

    state.resultText = "";
    sut.renderReaderTranslation(state);
    assert.strictEqual(state.outputNode.textContent, "准备翻译...");

    state.statusState = "loading";
    sut.renderReaderTranslation(state);
    assert.strictEqual(state.outputNode.textContent, "翻译中...");

    state.statusState = "error";
    sut.renderReaderTranslation(state);
    assert.strictEqual(state.outputNode.textContent, "翻译失败，请重试");
  }
  finally {
    sut.getBoolPref = originalGetBoolPref;
  }
}

verifyOfficialSelectionEventRegistration();
verifyOfficialSelectionWinsAndCancelsFallback();
verifyNativeRangeWinsOverGeometryReconstruction();
verifyNativeRangeWinsOverTruncatedOfficialAnnotation();
verifyTranslationOutputNeverBlanks();
console.log("Selection translation checks passed");
