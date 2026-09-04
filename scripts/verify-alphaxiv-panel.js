const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "zotero-ai-reading.js"), "utf8");
const prefs = fs.readFileSync(path.join(root, "prefs.js"), "utf8");
const context = { Map, Set, URL };
vm.createContext(context);
vm.runInContext(source, context, { filename: "zotero-ai-reading.js" });
const sut = context.ZoteroAIReading;

function verifyArXivIdentity() {
  const cases = new Map([
    ["https://arxiv.org/abs/2608.19013v3", "2608.19013"],
    ["https://arxiv.org/pdf/2608.19013.pdf", "2608.19013"],
    ["10.48550/arXiv.2608.19013", "2608.19013"],
    ["arXiv: hep-th/9901001v2", "hep-th/9901001"],
    ["2608.19013v7.pdf", "2608.19013"]
  ]);
  for (const [input, expected] of cases) {
    assert.strictEqual(sut.normalizeArXivID(input), expected, input);
  }
  assert.strictEqual(sut.normalizeArXivID("10.1234/example.2026.15"), "");

  const item = {
    attachmentFilename: "paper.pdf",
    getField(field) {
      return field === "extra" ? "Citation Key: demo\narXiv: 2608.09867v4" : "";
    }
  };
  assert.strictEqual(sut.getArXivIDForItem(item), "2608.09867");
}

function verifyRoutesAndDefaults() {
  assert.match(sut.getAlphaXivURL("2608.19013", "zh"), /alphaxiv\.org\/zh\/abs\/2608\.19013/);
  assert.match(sut.getAlphaXivURL("2608.19013", "en"), /alphaxiv\.org\/abs\/2608\.19013/);
  assert.match(prefs, /alphaXivLanguage", "zh"/);
  assert.match(prefs, /alphaXivMode", "paper"/);
  assert.match(prefs, /translationDockPosition", "left"/);
  assert.match(prefs, /readingSurfaceLayoutMigrated", false/);
}

function verifySelectionContext() {
  const tail = "TAIL-MUST-REMAIN";
  const selectedText = "A long exact selection with formulas x^2 + y^2. " + tail;
  const formatted = sut.formatReaderChatSelectionContext(selectedText, {
    source: "alphaxiv",
    paperTitle: "Harness Continual Learning",
    arxivID: "2608.19013",
    language: "zh",
    mode: "abstract",
    sectionTitle: "Guarded evolution",
    beforeText: "Previous paragraph",
    afterText: "Next paragraph",
    pageURL: "https://www.alphaxiv.org/zh/abs/2608.19013"
  });
  assert.match(formatted, /untrusted evidence/);
  assert.match(formatted, /Guarded evolution/);
  assert.match(formatted, /Previous paragraph/);
  assert.match(formatted, /Next paragraph/);
  assert.ok(formatted.includes(tail));
  assert.strictEqual(sut.getReaderChatContextPreview(formatted).endsWith(tail), true);

  const frameScript = sut.getReaderAlphaXivFrameScript("test-message");
  assert.match(frameScript, /selection\.toString\(\)/);
  assert.match(frameScript, /kind: "page-status"/);
  assert.match(frameScript, /overviewFound/);
  assert.match(frameScript, /credential_picker_container/);
  assert.match(frameScript, /sectionTitle/);
  assert.match(frameScript, /beforeText/);
  assert.match(frameScript, /afterText/);
  assert.match(frameScript, /selectionEnded/);
  assert.match(frameScript, /selectionRect/);
  assert.match(frameScript, /selectionViewport/);
  assert.match(frameScript, /zai-alpha-selection-overlay/);
  assert.match(frameScript, /zai-alpha-reader-toolbar/);
  assert.match(frameScript, /data-zai-header-action/);
  assert.match(frameScript, /kind: "header-action"/);
  assert.match(frameScript, /sync-header/);
  assert.match(frameScript, /bridgeVersion = messageName \+ ":v11"/);
  assert.match(frameScript, /attachShadow/);
  assert.match(frameScript, /let parent = doc\.body \|\| doc\.documentElement/);
  assert.match(frameScript, /toolbarRect\?\.width >= 80/);
  assert.match(frameScript, /zai-alpha-selection-action/);
  assert.match(frameScript, /selection-question/);
  assert.match(frameScript, /kind:\s*\"selection-question\"/);
  assert.match(frameScript, /reportSelection\(payload, true\)/);
  assert.doesNotMatch(frameScript, /selectedText\.slice/);
  new vm.Script(frameScript);
}

function verifyReadingSurfaceSwitch() {
  const makeNode = () => ({
    attributes: new Map(),
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
    removeAttribute(name) {
      this.attributes.delete(name);
    },
    hasAttribute(name) {
      return this.attributes.has(name);
    }
  });
  const reader = {};
  const pane = makeNode();
  const primary = makeNode();
  const container = makeNode();
  const state = { reader, pane, mode: "paper" };
  const originals = {
    getReaderChromeWrapper: sut.getReaderChromeWrapper,
    getReaderPrimaryLayoutNode: sut.getReaderPrimaryLayoutNode,
    updateReaderToolbarButtonState: sut.updateReaderToolbarButtonState
  };

  try {
    sut.getReaderChromeWrapper = () => container;
    sut.getReaderPrimaryLayoutNode = () => primary;
    sut.updateReaderToolbarButtonState = () => {};

    assert.strictEqual(sut.applyReaderReadingSurfaceMode(state, "abstract"), true);
    assert.strictEqual(state.mode, "abstract");
    assert.strictEqual(container.attributes.get("data-zai-reading-surface"), "abstract");
    assert.strictEqual(primary.attributes.get("data-zai-local-reading-surface"), "true");
    assert.strictEqual(pane.hasAttribute("hidden"), false);

    assert.strictEqual(sut.applyReaderReadingSurfaceMode(state, "paper"), true);
    assert.strictEqual(state.mode, "paper");
    assert.strictEqual(container.attributes.get("data-zai-reading-surface"), "paper");
    assert.strictEqual(pane.hasAttribute("hidden"), false);
    assert.strictEqual(pane.hasAttribute("data-zai-alpha-surface-hidden"), true);
  }
  finally {
    Object.assign(sut, originals);
  }
}

function verifyToolbarBridgeIsolation() {
  const pane = {
    classList: { contains: (name) => name === "zai-reader-ai-pane" },
    parentNode: null
  };
  const panelButton = {
    classList: { contains: () => false },
    parentNode: pane,
    getAttribute: () => ""
  };
  assert.strictEqual(
    sut.isReaderAuxiliaryPanelEvent({
      target: panelButton,
      composedPath: () => [panelButton, pane]
    }),
    true
  );
  const pdfTarget = {
    classList: { contains: () => false },
    parentNode: null,
    getAttribute: () => ""
  };
  assert.strictEqual(
    sut.isReaderAuxiliaryPanelEvent({ target: pdfTarget, composedPath: () => [pdfTarget] }),
    false
  );

  const originalAlphaOpen = sut.isReaderAlphaXivPaneOpen;
  try {
    sut.isReaderAlphaXivPaneOpen = () => true;
    const alphaOverlay = {
      getAttribute(name) {
        return name === "data-zai-reader-toolbar-overlay"
          ? "true"
          : (name === "data-zai-toolbar-button-id" ? sut.READER_ALPHAXIV_BUTTON_ID : "");
      },
      parentNode: null
    };
    assert.strictEqual(
      sut.isReaderAuxiliaryPanelEvent({ target: alphaOverlay, composedPath: () => [alphaOverlay] }, {}),
      true
    );
  }
  finally {
    sut.isReaderAlphaXivPaneOpen = originalAlphaOpen;
  }
}

function verifyToolbarOverlaySuspension() {
  const styleValues = new Map();
  const style = {
    setProperty(name, value) {
      styleValues.set(name, String(value));
    },
    removeProperty(name) {
      styleValues.delete(name);
    }
  };
  const attributes = new Map();
  const overlay = {
    style,
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    getAttribute(name) {
      return attributes.get(name) || "";
    }
  };
  const button = {
    id: sut.READER_ALPHAXIV_BUTTON_ID,
    isConnected: true,
    disabled: false,
    getAttribute: () => "Brief AI",
    getBoundingClientRect: () => ({ left: 18, top: 9, width: 44, height: 29 })
  };
  const iframe = {
    _zaiReaderToolbarButtonOverlays: new Map([
      [button.id, { overlay, button }]
    ]),
    getBoundingClientRect: () => ({ left: 100, top: 50, right: 900, bottom: 700 })
  };
  const reader = { _iframe: iframe };
  const originalActive = sut.isReaderAlphaXivSurfaceActive;
  try {
    sut.isReaderAlphaXivSurfaceActive = () => true;
    assert.strictEqual(sut.positionReaderToolbarButtonOverlay(reader, button), true);
    assert.strictEqual(attributes.get("data-zai-toolbar-overlay-suspended"), "true");
    assert.strictEqual(styleValues.get("display"), "none");
    assert.strictEqual(styleValues.get("pointer-events"), "none");

    sut.isReaderAlphaXivSurfaceActive = () => false;
    assert.strictEqual(sut.syncReaderToolbarButtonOverlays(reader), true);
    assert.strictEqual(attributes.has("data-zai-toolbar-overlay-suspended"), false);
    assert.strictEqual(styleValues.get("display"), "block");
    assert.strictEqual(styleValues.get("pointer-events"), "auto");
  }
  finally {
    sut.isReaderAlphaXivSurfaceActive = originalActive;
  }
}

function verifyReaderToolbarVisualOrder() {
  const translation = { id: sut.READER_TRANSLATION_BUTTON_ID };
  const brief = { id: sut.READER_ALPHAXIV_BUTTON_ID };
  const chat = { id: sut.READER_BUTTON_ID };
  const nodes = new Map([
    [translation.id, translation],
    [brief.id, brief],
    [chat.id, chat]
  ]);
  const doc = { getElementById: (id) => nodes.get(id) || null };
  const ordered = sut.getReaderToolbarButtonsInVisualOrder(doc, {});
  assert.deepStrictEqual(
    Array.from(ordered, (button) => button.id),
    [sut.READER_TRANSLATION_BUTTON_ID, sut.READER_ALPHAXIV_BUTTON_ID, sut.READER_BUTTON_ID]
  );

  const parent = {
    children: [chat, translation, brief],
    appendChild(button) {
      const index = this.children.indexOf(button);
      if (index >= 0) this.children.splice(index, 1);
      this.children.push(button);
      button.parentNode = this;
      return button;
    }
  };
  for (const button of parent.children) button.parentNode = parent;
  assert.strictEqual(sut.enforceReaderToolbarButtonOrder(ordered), true);
  assert.deepStrictEqual(parent.children.map((button) => button.id), [
    sut.READER_TRANSLATION_BUTTON_ID,
    sut.READER_ALPHAXIV_BUTTON_ID,
    sut.READER_BUTTON_ID
  ]);
  assert.strictEqual(sut.enforceReaderToolbarButtonOrder(ordered), false);
}

function verifyRetargetedAlphaXivHeaderRouting() {
  const reader = {};
  const activated = [];
  const makeButton = (text, left, width) => ({
    textContent: text,
    hidden: false,
    disabled: false,
    contains: () => false,
    getBoundingClientRect: () => ({ left, top: 20, right: left + width, bottom: 50 }),
    _zaiReliableActivate(event) {
      this._zaiReliableLastActivationAt = Date.now();
      activated.push({ button: text, event });
      return true;
    }
  });
  const language = makeButton("中文", 100, 60);
  const english = makeButton("English", 160, 62);
  const ai = makeButton("AI", 230, 48);
  const pane = {
    isConnected: true,
    hidden: false,
    hasAttribute: () => false,
    querySelectorAll: () => [language, english, ai]
  };
  const state = { reader, pane, mode: "abstract" };
  const originalActive = sut.isReaderAlphaXivSurfaceActive;
  sut.readerAlphaXivStates.set(reader, state);
  sut.isReaderAlphaXivSurfaceActive = () => true;
  try {
    let prevented = false;
    let stopped = false;
    const remoteTarget = {};
    const pointerdown = {
      type: "pointerdown",
      button: 0,
      clientX: 240,
      clientY: 35,
      target: remoteTarget,
      composedPath: () => [remoteTarget],
      preventDefault: () => { prevented = true; },
      stopImmediatePropagation: () => { stopped = true; },
      stopPropagation: () => {}
    };
    assert.strictEqual(sut.routeReaderAlphaXivHeaderEvent(reader, pointerdown), true);
    assert.strictEqual(prevented, true);
    assert.strictEqual(stopped, true);
    assert.deepStrictEqual(activated.map((entry) => entry.button), ["AI"]);

    const duplicateClick = {
      type: "click",
      button: 0,
      clientX: 240,
      clientY: 35,
      target: remoteTarget,
      composedPath: () => [remoteTarget],
      preventDefault: () => {},
      stopImmediatePropagation: () => {},
      stopPropagation: () => {}
    };
    assert.strictEqual(sut.routeReaderAlphaXivHeaderEvent(reader, duplicateClick), true);
    assert.deepStrictEqual(activated.map((entry) => entry.button), ["AI"]);

    const realTarget = {
      type: "pointerdown",
      button: 0,
      clientX: 240,
      clientY: 35,
      target: ai,
      composedPath: () => [ai, pane],
      preventDefault: () => {},
      stopImmediatePropagation: () => {},
      stopPropagation: () => {}
    };
    assert.strictEqual(sut.routeReaderAlphaXivHeaderEvent(reader, realTarget), false);
  }
  finally {
    sut.isReaderAlphaXivSurfaceActive = originalActive;
    sut.readerAlphaXivStates.delete(reader);
  }
}

function verifyAlphaXivBoundsClamping() {
  const styleValues = new Map();
  const attributes = new Map();
  const pane = {
    isConnected: true,
    style: {
      setProperty(name, value) {
        styleValues.set(name, String(value));
      }
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    removeAttribute(name) {
      attributes.delete(name);
    },
    ownerDocument: {
      documentElement: {
        getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 700 })
      },
      defaultView: { innerWidth: 1000, innerHeight: 700 }
    }
  };
  const container = {
    getBoundingClientRect: () => ({
      left: 100, top: 50, right: 1200, bottom: 800, width: 1100, height: 750
    })
  };
  const primary = {
    getBoundingClientRect: () => ({
      left: 150, top: 80, right: 1150, bottom: 760, width: 1000, height: 680
    })
  };
  const state = { reader: {}, pane };
  const originals = {
    getReaderChromeWrapper: sut.getReaderChromeWrapper,
    getReaderPrimaryLayoutNode: sut.getReaderPrimaryLayoutNode
  };
  try {
    sut.getReaderChromeWrapper = () => container;
    sut.getReaderPrimaryLayoutNode = () => primary;
    assert.strictEqual(sut.syncReaderAlphaXivOverlayBounds(state), true);
    assert.strictEqual(styleValues.get("left"), "50px");
    assert.strictEqual(styleValues.get("top"), "30px");
    assert.strictEqual(styleValues.get("width"), "850px");
    assert.strictEqual(styleValues.get("height"), "620px");
    assert.strictEqual(attributes.has("data-zai-compact-header"), false);

    pane.ownerDocument.documentElement.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 590, bottom: 700
    });
    assert.strictEqual(sut.syncReaderAlphaXivOverlayBounds(state), true);
    assert.strictEqual(styleValues.get("width"), "440px");
    assert.strictEqual(attributes.get("data-zai-compact-header"), "true");
  }
  finally {
    Object.assign(sut, originals);
  }
}

function verifyExistingPaneAdoptionAndBlankDetection() {
  const webView = {
    currentURI: { spec: "about:blank" },
    getAttribute(name) {
      if (name === "src") return "about:blank";
      if (name === "data-zai-src") return "https://www.alphaxiv.org/zh/abs/2608.19013";
      return "";
    }
  };
  const statusNode = { textContent: "" };
  const emptyNode = { textContent: "", hidden: true };
  const selectionBar = { hidden: true };
  const selectionPreview = { textContent: "" };
  const pane = {
    querySelector(selector) {
      return new Map([
        [".zai-reader-alphaxiv-browser", webView],
        [".zai-reader-alphaxiv-status", statusNode],
        [".zai-reader-alphaxiv-empty", emptyNode],
        [".zai-reader-alphaxiv-selection", selectionBar],
        [".zai-reader-alphaxiv-selection-preview", selectionPreview]
      ]).get(selector) || null;
    },
    querySelectorAll() {
      return [];
    }
  };
  const state = {
    reader: {},
    pane,
    webView: null,
    arxivID: "2608.19013",
    language: "zh",
    mode: "abstract",
    availability: { status: "available", overviewAvailable: true },
    loading: false,
    modeButtons: [],
    languageButtons: [],
    selectionContext: null,
    bridgeListenerAttached: false
  };
  const originals = {
    attachReaderAlphaXivBridge: sut.attachReaderAlphaXivBridge,
    detachReaderAlphaXivBridge: sut.detachReaderAlphaXivBridge
  };

  try {
    sut.attachReaderAlphaXivBridge = (candidate) => {
      candidate.bridgeListenerAttached = true;
      return true;
    };
    sut.detachReaderAlphaXivBridge = (candidate) => {
      candidate.bridgeListenerAttached = false;
    };
    assert.strictEqual(sut.adoptReaderAlphaXivPaneState(state, pane), true);
    assert.strictEqual(state.webView, webView);
    assert.strictEqual(state.bridgeListenerAttached, true);
    assert.strictEqual(sut.getReaderAlphaXivWebViewActualURL(webView), "");

    sut.renderReaderAlphaXivPane(state);
    assert.match(statusNode.textContent, /页面未加载/);
    assert.strictEqual(emptyNode.hidden, false);
    assert.match(emptyNode.textContent, /尚未载入/);

    webView.currentURI.spec = "https://www.alphaxiv.org/zh/abs/2608.19013";
    assert.match(sut.getReaderAlphaXivWebViewActualURL(webView), /alphaxiv\.org/);
    sut.renderReaderAlphaXivPane(state);
    assert.strictEqual(emptyNode.hidden, true);
  }
  finally {
    Object.assign(sut, originals);
  }
}

function verifyPanelContract() {
  for (const marker of [
    "toggleReaderAlphaXivPane",
    "createReaderAlphaXivPane",
    "adoptReaderAlphaXivPaneState",
    "getReaderAlphaXivWebViewActualURL",
    "syncReaderAlphaXivOverlayBounds",
    "ensureReaderAlphaXivOverlayObserver",
    "applyReaderReadingSurfaceMode",
    "probeAlphaXivAvailability",
    "attachReaderAlphaXivBridge",
    "handleReaderAlphaXivPageStatus",
    "handleReaderAlphaXivHeaderAction",
    "syncReaderAlphaXivFrameHeader",
    "askAlphaXivSelection",
    "暂无简读",
    "#popout-assistant-panel"
  ]) {
    assert.ok(source.includes(marker), marker);
  }
  assert.match(source, /selectionContext: context/);
  assert.match(source, /data-zai-central-reading-surface/);
  assert.match(source, /data-zai-local-reading-surface/);
  assert.match(source, /data-zai-reading-surface/);
  assert.doesNotMatch(
    source,
    /data-zai-reading-surface='abstract'[^\n]*display:none/,
    "abstract mode must keep Zotero's native PDF surface rendered behind the overlay"
  );
  assert.doesNotMatch(source, /translateAlphaXivSelection/);

  const orderStart = source.indexOf("  applyReaderPanelOrder(reader) {");
  const orderEnd = source.indexOf("\n  setReaderTranslationDockPosition", orderStart);
  const orderSource = source.slice(orderStart, orderEnd);
  assert.doesNotMatch(orderSource, /insertBefore\(/);
  assert.match(orderSource, /setProperty\?\.\("order"/);

  const bridgeStart = source.indexOf("  installReaderAlphaXivBridge(state) {");
  const bridgeEnd = source.indexOf("\n  getReaderAlphaXivFrameScript", bridgeStart);
  const bridgeSource = source.slice(bridgeStart, bridgeEnd);
  assert.match(bridgeSource, /loadFrameScript\(scriptURL, true\)/);
  assert.match(bridgeSource, /removeDelayedFrameScript/);
  assert.match(bridgeSource, /bridgeFrameScriptManager !== messageManager/);
  assert.match(source, /bridgeMessageManager: null/);
  assert.match(source, /previousMessageManager !== messageManager/);

  const paneStart = source.indexOf("createReaderAlphaXivPane");
  const paneEnd = source.indexOf("  applyReaderReadingSurfaceMode(", paneStart);
  const paneSource = source.slice(paneStart, paneEnd);
  assert.match(paneSource, /"提问"/);
  assert.doesNotMatch(paneSource, /"翻译"/);
  assert.match(paneSource, /zai-reader-alphaxiv-mode-label/);
  assert.match(paneSource, /zai-reader-alphaxiv-ai-button/);
  assert.match(source, /stable-header-5/);
  assert.match(paneSource, /data-zai-reliable-control/);
  assert.match(paneSource, /lastPointerActivation/);
  assert.match(paneSource, /_zaiReliableActivate/);
  assert.match(paneSource, /data-zai-toggle-pending/);
  assert.match(paneSource, /data-zai-selection-action/);
  assert.match(paneSource, /围绕选区提问/);
  assert.match(paneSource, /makeNativeSegment\("en", "English", "language"/);
  assert.match(paneSource, /makeXUL\("toolbarbutton"/);
  assert.match(paneSource, /addEventListener\("command"/);
  assert.doesNotMatch(paneSource, /makeSegment\("paper"/);

  const selectionStart = source.indexOf("async handleReaderAlphaXivSelection");
  const selectionEnd = source.indexOf("\n  updateAlphaXivQuestionPopover", selectionStart);
  const selectionSource = source.slice(selectionStart, selectionEnd);
  const frameScript = sut.getReaderAlphaXivFrameScript("panel-contract");
  assert.doesNotMatch(selectionSource, /openNativeReaderTranslationPane/);
  assert.doesNotMatch(selectionSource, /translateReaderSelection/);
  assert.match(selectionSource, /data\.selectionEnded === true/);
  assert.match(selectionSource, /selectionActionVisible = false/);
  assert.match(selectionSource, /openAlphaXivQuestionPopover\(state, \{ focus: true \}\)/);
  assert.match(frameScript, /openSelectionQuestion\(\)/);
  assert.match(frameScript, /selectionAction\.hidden = true/);
  assert.match(frameScript, /function captureSelectionScrollState\(\)/);
  assert.match(frameScript, /let parent = doc\.body \|\| doc\.documentElement/);
  assert.match(frameScript, /selectionInput\.focus\(\{ preventScroll: true \}\)/);
  assert.match(frameScript, /restoreSelectionScrollStateSoon\(scrollState\)/);
  assert.match(frameScript, /\[0, 80, 240, 600\]/);
  assert.match(frameScript, /Ask the assistant/);
  assert.match(frameScript, /hideNativeAssistantLauncher/);
  assert.match(frameScript, /const frameHeaderEnabled = false/);

  const questionStyle = source.slice(source.indexOf('".zai-reader-alphaxiv-question-popover{'));
  assert.doesNotMatch(questionStyle, /question-popover\{[^}]*top:12px;right:12px/);
  assert.match(source, /positionReaderAlphaXivSelectionAction/);
  assert.match(source, /positionAlphaXivQuestionPopover/);
  assert.match(source, /isReaderAlphaXivRemoteBrowser/);
  assert.match(source, /handleReaderAlphaXivFrameQuestion/);
  assert.match(source, /zai-reader-translation-settings-button/);
  assert.match(source, /zai-reader-translation-settings-panel/);
  assert.match(source, /isReaderAuxiliaryPanelEvent/);
  assert.match(source, /isReaderAlphaXivSurfaceActive/);
  assert.match(source, /data-zai-reader-toolbar-overlay/);
  assert.match(source, /data-zai-toolbar-overlay-suspended/);
  assert.match(source, /syncReaderToolbarButtonOverlays/);
  assert.match(source, /routeReaderAlphaXivHeaderEvent\(reader, event\)/);
  assert.match(source, /data\.kind === "header-action"/);
  assert.match(source, /data-zai-frame-toolbar/);
  assert.match(source, /readerChatTogglePromises/);
  assert.match(source, /async waitForReaderInit\(reader, timeoutMs = 250\)/);
  assert.match(source, /Promise\.race\(\[/);
  assert.match(source, /stable-header-5/);
  assert.match(source, /\.zai-reader-alphaxiv-pane\[data-zai-central-reading-surface='true'\]\{display:flex!important/);
  assert.match(source, /\.zai-reader-alphaxiv-header\{display:flex!important;position:relative!important/);
  assert.match(source, /\.zai-reader-alphaxiv-identity\{display:flex;position:relative;z-index:61/);
  assert.match(source, /\.zai-reader-alphaxiv-controls\{display:flex!important;position:relative!important/);
  assert.match(source, /width:340px!important;height:30px!important/);
  assert.match(source, /\.zai-reader-alphaxiv-content\{display:flex!important;position:relative!important/);
  assert.match(source, /\.zai-reader-alphaxiv-browser\{display:block!important;position:relative!important/);
  assert.match(source, /data-zai-compact-header/);
  assert.match(source, /width:48px!important/);
  const toolbarBridgeStart = source.indexOf("  attachReaderToolbarButtonClickBridge(reader, button) {");
  const toolbarBridgeEnd = source.indexOf("\n  detachReaderToolbarButtonClickBridge", toolbarBridgeStart);
  const toolbarBridgeSource = source.slice(toolbarBridgeStart, toolbarBridgeEnd);
  assert.ok(
    toolbarBridgeSource.indexOf("this.isReaderAlphaXivSurfaceActive(reader)") <
      toolbarBridgeSource.indexOf("this.isReaderAuxiliaryPanelEvent(event, reader)"),
    "the PDF toolbar bridge must yield before interpreting brief header events"
  );
  assert.match(source, /older add-on version may still carry the old/);
  assert.match(source, /toolbar's "简读" button/);
  assert.match(paneSource, /toggleReaderChatPane\(state\.reader/);

  const refreshStart = source.indexOf("async refreshReaderAlphaXivPane");
  const refreshEnd = source.indexOf("\n  renderReaderAlphaXivPane(state) {", refreshStart);
  const refreshSource = source.slice(refreshStart, refreshEnd);
  assert.match(refreshSource, /getAlphaXivURL\(state\.arxivID, state\.language\)/);
  assert.ok(
    refreshSource.indexOf("this.installReaderAlphaXivBridge(state)") <
      refreshSource.indexOf("this.loadReaderWebView(state.webView, url"),
    "the delayed selection bridge must be registered before alphaXiv navigation"
  );
  assert.doesNotMatch(source, /alphaxiv\.org\/pdf\//);
  assert.ok(
    source.indexOf("this.loadReaderWebView(state.webView, url", refreshStart) <
      source.indexOf("this.probeAlphaXivAvailability(state.arxivID, state.language", refreshStart),
    "the live alphaXiv page must load before the optional HTTP probe"
  );
}

verifyArXivIdentity();
verifyRoutesAndDefaults();
verifySelectionContext();
verifyReadingSurfaceSwitch();
verifyToolbarBridgeIsolation();
verifyToolbarOverlaySuspension();
verifyReaderToolbarVisualOrder();
verifyRetargetedAlphaXivHeaderRouting();
verifyAlphaXivBoundsClamping();
verifyExistingPaneAdoptionAndBlankDetection();
verifyPanelContract();
console.log("alphaXiv panel checks passed");
