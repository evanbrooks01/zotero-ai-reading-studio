const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "zotero-ai-reading.js"), "utf8");
const context = { Map, Set, URL, btoa, atob };
vm.createContext(context);
vm.runInContext(source, context, { filename: "zotero-ai-reading.js" });
const sut = context.ZoteroAIReading;

function node() {
  return {
    hidden: false,
    attributes: new Map(),
    style: {
      values: new Map(),
      setProperty(name, value) { this.values.set(name, String(value)); },
      removeProperty(name) { this.values.delete(name); },
      getPropertyValue(name) { return this.values.get(name) || ""; }
    },
    setAttribute(name, value) { this.attributes.set(name, String(value)); },
    removeAttribute(name) { this.attributes.delete(name); },
    hasAttribute(name) { return this.attributes.has(name); }
  };
}

function verifySurfaceVisibility() {
  const reader = {};
  const pane = node();
  const primary = node();
  const container = node();
  const originals = {
    getReaderChromeWrapper: sut.getReaderChromeWrapper,
    getReaderPrimaryLayoutNode: sut.getReaderPrimaryLayoutNode,
    updateReaderToolbarButtonState: sut.updateReaderToolbarButtonState,
    scheduleReaderAlphaXivOverlaySync: sut.scheduleReaderAlphaXivOverlaySync,
    focusReaderNativePaperSurface: sut.focusReaderNativePaperSurface
  };
  try {
    sut.getReaderChromeWrapper = () => container;
    sut.getReaderPrimaryLayoutNode = () => primary;
    sut.updateReaderToolbarButtonState = () => {};
    sut.scheduleReaderAlphaXivOverlaySync = () => {};
    sut.focusReaderNativePaperSurface = () => true;
    const state = { reader, pane, mode: "paper" };
    assert.strictEqual(sut.applyReaderReadingSurfaceMode(state, "abstract"), true);
    assert.strictEqual(pane.hidden, false);
    assert.strictEqual(pane.style.values.get("visibility"), "visible");
    assert.strictEqual(pane.style.values.get("pointer-events"), "auto");
    assert.strictEqual(sut.applyReaderReadingSurfaceMode(state, "paper"), true);
    assert.strictEqual(pane.hidden, false);
    assert.strictEqual(pane.hasAttribute("hidden"), false);
    assert.strictEqual(pane.hasAttribute("data-zai-alpha-surface-hidden"), true);
    assert.strictEqual(pane.style.values.get("visibility"), "hidden");
    assert.strictEqual(pane.style.values.get("display"), "flex");
  } finally {
    Object.assign(sut, originals);
  }
}

function verifyQuestionAndHistoryContracts() {
  assert.match(source, /openAlphaXivQuestionPopover/);
  assert.match(source, /submitAlphaXivSelectionQuestion/);
  assert.match(source, /selectionQuestionInput/);
  assert.match(source, /historyToggle/);
  assert.match(source, /renderReaderChatHistory/);
  assert.match(source, /历史会话/);
  assert.match(source, /Selected source context/);
  assert.match(source, /source: "alphaxiv"/);
}

verifySurfaceVisibility();
verifyQuestionAndHistoryContracts();
console.log("Reader surface 0.6.4 checks passed");
