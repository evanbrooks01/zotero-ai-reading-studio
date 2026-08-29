const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "zotero-ai-reading.js"), "utf8");
const floatingWindow = fs.readFileSync(path.join(root, "floating-window.xhtml"), "utf8");
const buildScript = fs.readFileSync(path.join(root, "scripts", "build-xpi.ps1"), "utf8");
const context = { Map, Set, URL };
vm.createContext(context);
vm.runInContext(source, context, { filename: "zotero-ai-reading.js" });

const sut = context.ZoteroAIReading;

function makeNode(id) {
  return {
    id,
    parentNode: null,
    moveCount: 0,
    attributes: new Map(),
    style: {
      properties: new Map(),
      setProperty(name, value) {
        this.properties.set(name, String(value));
      },
      removeProperty(name) {
        this.properties.delete(name);
      },
      getPropertyValue(name) {
        return this.properties.get(name) || "";
      }
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    remove() {
      if (!this.parentNode) {
        return;
      }
      const index = this.parentNode.children.indexOf(this);
      if (index >= 0) {
        this.parentNode.children.splice(index, 1);
      }
      this.parentNode = null;
    }
  };
}

function makeContainer(nodes) {
  const container = makeNode("container");
  container.children = [];
  container.appendChild = (node) => container.insertBefore(node, null);
  container.insertBefore = (node, reference) => {
    node.remove();
    const index = reference ? container.children.indexOf(reference) : -1;
    if (index >= 0) {
      container.children.splice(index, 0, node);
    }
    else {
      container.children.push(node);
    }
    node.parentNode = container;
    node.moveCount++;
    return node;
  };
  for (const node of nodes) {
    container.appendChild(node);
  }
  for (const node of nodes) {
    node.moveCount = 0;
  }
  return container;
}

function verifyDockOrdering() {
  const primary = makeNode("pdf");
  const translationPane = makeNode("translation-pane");
  const translationSplitter = makeNode("translation-splitter");
  const chatPane = makeNode("chat-pane");
  const chatSplitter = makeNode("chat-splitter");
  const alphaXivPane = makeNode("alphaxiv-pane");
  const alphaXivSplitter = makeNode("alphaxiv-splitter");
  const nodes = [primary, alphaXivSplitter, alphaXivPane, translationSplitter, translationPane, chatSplitter, chatPane];
  const container = makeContainer(nodes);
  const byID = new Map(nodes.map((node) => [node.id, node]));
  const doc = { getElementById: (id) => byID.get(id) || null };
  const reader = { _window: { document: doc } };
  const originals = {
    getReaderChromeWrapper: sut.getReaderChromeWrapper,
    getReaderPrimaryLayoutNode: sut.getReaderPrimaryLayoutNode,
    getReaderPaneID: sut.getReaderPaneID,
    getReaderSplitterID: sut.getReaderSplitterID,
    getReaderTranslationPaneID: sut.getReaderTranslationPaneID,
    getReaderTranslationSplitterID: sut.getReaderTranslationSplitterID,
    getReaderAlphaXivPaneID: sut.getReaderAlphaXivPaneID,
    getReaderAlphaXivSplitterID: sut.getReaderAlphaXivSplitterID,
    getReaderTranslationDockPosition: sut.getReaderTranslationDockPosition
  };

  try {
    sut.getReaderChromeWrapper = () => container;
    sut.getReaderPrimaryLayoutNode = () => primary;
    sut.getReaderPaneID = () => "chat-pane";
    sut.getReaderSplitterID = () => "chat-splitter";
    sut.getReaderTranslationPaneID = () => "translation-pane";
    sut.getReaderTranslationSplitterID = () => "translation-splitter";
    sut.getReaderAlphaXivPaneID = () => "alphaxiv-pane";
    sut.getReaderAlphaXivSplitterID = () => "alphaxiv-splitter";

    const expected = {
      left: ["translation-pane", "translation-splitter", "pdf", "chat-splitter", "chat-pane"],
      inner: ["pdf", "translation-splitter", "translation-pane", "chat-splitter", "chat-pane"],
      outer: ["pdf", "chat-splitter", "chat-pane", "translation-splitter", "translation-pane"]
    };
    const flowNodes = [primary, translationPane, translationSplitter, chatPane, chatSplitter];
    const domOrderAfterRemovingLegacySplitter = [
      "pdf", "alphaxiv-pane", "translation-splitter", "translation-pane", "chat-splitter", "chat-pane"
    ];
    for (const position of Object.keys(expected)) {
      sut.getReaderTranslationDockPosition = () => position;
      assert.strictEqual(sut.applyReaderPanelOrder(reader), true);
      assert.deepStrictEqual(container.children.map((node) => node.id), domOrderAfterRemovingLegacySplitter);
      const visualOrder = flowNodes.slice().sort((left, right) =>
        Number(left.style.getPropertyValue("order")) - Number(right.style.getPropertyValue("order"))
      );
      assert.deepStrictEqual(visualOrder.map((node) => node.id), expected[position]);
      assert.strictEqual(container.attributes.get("data-zai-translation-dock"), position);
      assert.strictEqual(primary.moveCount, 0, "native PDF browser must never be reinserted");
      assert.strictEqual(alphaXivPane.moveCount, 0, "loaded alphaXiv browser must never be reinserted");
      const movesBeforeRepeat = nodes.reduce((total, node) => total + node.moveCount, 0);
      assert.strictEqual(sut.applyReaderPanelOrder(reader), true);
      assert.strictEqual(
        nodes.reduce((total, node) => total + node.moveCount, 0),
        movesBeforeRepeat,
        "stable ordering must not reparent any panel"
      );
    }
  }
  finally {
    Object.assign(sut, originals);
  }
}

function verifyDetachedWindowContract() {
  assert.match(floatingWindow, /<window[\s\S]*windowtype="zotero-ai-reading:floating-panel"/);
  assert.match(floatingWindow, /id="zotero-ai-reading-floating-host"/);
  assert.match(buildScript, /floating-window\.xhtml/);
  assert.match(source, /Services\.ww\.openWindow\(/);
  assert.match(source, /toggleReaderPanelPresentation\("chat", state\)/);
  assert.match(source, /toggleReaderPanelPresentation\("translation", state\)/);
  assert.match(source, /data-zai-detached-host/);

  const reader = {};
  const originalChatStates = sut.readerChatStates;
  const originalTranslationStates = sut.readerTranslationStates;
  try {
    sut.readerChatStates = new Map([[reader, { detachedWindow: { closed: false } }]]);
    sut.readerTranslationStates = new Map([[reader, { detachedWindow: { closed: false } }]]);
    assert.strictEqual(sut.isReaderChatPaneOpen(reader), true);
    assert.strictEqual(sut.isReaderTranslationPaneOpen(reader), true);
  }
  finally {
    sut.readerChatStates = originalChatStates;
    sut.readerTranslationStates = originalTranslationStates;
  }
}

function verifyTranslationStateSurvivesPresentationChanges() {
  const state = {
    pane: {},
    sourceNode: {},
    outputNode: {},
    sourceText: "selected text",
    resultText: "译文",
    translationChunks: ["selected text"],
    translationProgress: 1
  };
  sut.clearReaderTranslationUIReferences(state);
  assert.strictEqual(state.pane, null);
  assert.strictEqual(state.sourceText, "selected text");
  assert.strictEqual(state.resultText, "译文");
  assert.deepStrictEqual(Array.from(state.translationChunks), ["selected text"]);
  assert.strictEqual(state.translationProgress, 1);
}

function verifyDockControls() {
  assert.strictEqual(sut.normalizeReaderTranslationDockPosition("left"), "left");
  assert.strictEqual(sut.normalizeReaderTranslationDockPosition("outer"), "outer");
  assert.strictEqual(sut.normalizeReaderTranslationDockPosition("invalid"), "left");
  assert.match(source, /\["left", "inner", "outer"\]/);
  assert.match(source, /文献左侧/);
  assert.match(source, /文献右侧/);
  assert.match(source, /AI 右侧/);
  assert.match(source, /this\.getReaderTranslationDockPosition\(\) === "left"/);
}

verifyDockOrdering();
verifyDetachedWindowContract();
verifyTranslationStateSurvivesPresentationChanges();
verifyDockControls();
console.log("Detachable panel checks passed");
