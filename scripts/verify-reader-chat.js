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

function verifyMarkdownRendering() {
  const markdown = [
    "## Result",
    "",
    "Use **bold**, `code`, and [source](https://example.com/a?q=1&b=2).",
    "",
    "- first",
    "- second",
    "",
    "| A | B |",
    "| --- | --- |",
    "| 1 | 2 |",
    "",
    "```js",
    "const x = 1 < 2;",
    "```",
    "",
    "<script>alert(1)</script>",
    "[bad](javascript:alert(1))"
  ].join("\n");
  const html = sut.readerChatMarkdownToHTML(markdown);
  assert.match(html, /<h2>Result<\/h2>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /<ul><li>first<\/li><li>second<\/li><\/ul>/);
  assert.match(html, /<table>/);
  assert.match(html, /language-js/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /href="javascript:/i);
  assert.doesNotMatch(html, /<script>/i);
}

function verifyStreamingMarkdownFallback() {
  const html = sut.readerChatMarkdownToHTML("first line\nsecond line\n\n---");
  assert.match(html, /<br\/>/);
  assert.match(html, /<hr\/>/);

  const classes = new Set();
  const container = {
    classList: { add: (name) => classes.add(name) },
    set innerHTML(_value) { throw new Error("XUL fragment rejected"); },
    set textContent(value) { this.renderedText = value; },
    get textContent() { return this.renderedText; },
    querySelectorAll: () => []
  };
  const originalLog = sut.log;
  sut.log = () => {};
  try {
    assert.strictEqual(sut.renderReaderChatMarkdown(container, "still visible"), false);
  }
  finally {
    sut.log = originalLog;
  }
  assert.strictEqual(container.textContent, "still visible");
  assert.ok(classes.has("zai-reader-chat-markdown-fallback"));
}

function verifyConversationStatePersistence() {
  const normalized = sut.normalizeConversationData({
    sourceAttachmentID: 42,
    messages: [
      { role: "user", text: "Question" },
      { role: "assistant", text: "Answer", reasoning: "Summary" }
    ],
    previousResponseID: "resp_123",
    responseIDs: ["resp_100"],
    continuationUnsupported: true,
    paperAttached: true,
    paperAttachmentName: "paper.pdf"
  });
  assert.strictEqual(normalized.version, 3);
  assert.strictEqual(normalized.sessions.length, 1);
  assert.strictEqual(normalized.activeSessionID, normalized.sessions[0].id);
  assert.deepStrictEqual(Array.from(normalized.sessions[0].responseIDs), ["resp_100", "resp_123"]);
  assert.strictEqual(normalized.sessions[0].messages[1].reasoning, "Summary");
  assert.strictEqual(normalized.sessions[0].paperAttached, true);
  assert.strictEqual(normalized.sessions[0].paperAttachmentName, "paper.pdf");

  const migrated = sut.normalizeConversationData({
    version: 2,
    sourceAttachmentID: 42,
    messages: [{ role: "user", text: "legacy question" }]
  });
  assert.strictEqual(migrated.migratedLegacy, true);
  assert.strictEqual(migrated.sessions.length, 1);
  assert.strictEqual(migrated.sessions[0].messages[0].text, "legacy question");

  const modernEmpty = sut.normalizeConversationData({
    version: 3,
    sourceAttachmentID: 42,
    sessions: [],
    activeSessionID: "",
    messages: []
  });
  assert.strictEqual(modernEmpty.migratedLegacy, false);
  assert.strictEqual(modernEmpty.sessions.length, 0);
}

function verifyPDFIsAddedOnlyToCurrentTurn() {
  const paperInput = { type: "input_file", filename: "paper.pdf", file_data: "data:application/pdf;base64,AA==" };
  const messages = [
    { role: "user", text: "old" },
    { role: "assistant", text: "old answer" },
    { role: "user", text: "new", context: "selected" },
    { role: "assistant", text: "", streaming: true }
  ];
  const input = sut.buildReaderChatInput(messages, { paperInput });
  const fileItems = input.flatMap((message) => Array.from(message.content)).filter((part) => part.type === "input_file");
  assert.strictEqual(fileItems.length, 1);
  assert.strictEqual(input[input.length - 1].role, "user");
  assert.strictEqual(input[input.length - 1].content[0], paperInput);
  assert.match(input[input.length - 1].content[1].text, /Selected source context/);
  assert.match(input[input.length - 1].content[1].text, /selected/);
}

function verifySSEParsing() {
  let event = null;
  sut.parseReaderChatSSEBlock(
    "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"delta\":\"Hello\"}",
    (value) => { event = value; }
  );
  assert.strictEqual(event.type, "response.output_text.delta");
  assert.strictEqual(event.delta, "Hello");
}

function verifyDefaultModelPreference() {
  assert.strictEqual(sut.DEFAULTS.chatModel, "gpt-5.6-sol");
  assert.strictEqual(sut.pickDefaultChatModel(["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna"]), "gpt-5.6-sol");
}

function verifyServiceURLNormalization() {
  assert.strictEqual(
    sut.normalizeAIServiceBaseURL("https://codex.ise.it.com"),
    "https://codex.ise.it.com/v1"
  );
  assert.strictEqual(
    sut.normalizeAIServiceBaseURL("https://codex.ise.it.com/v1/responses"),
    "https://codex.ise.it.com/v1"
  );
  assert.strictEqual(
    sut.normalizeAIServiceBaseURL("https://codex.ise.it.com/v1/models/"),
    "https://codex.ise.it.com/v1"
  );
}

function verifyReaderOutputIsSelectable() {
  assert.match(source, /enableReaderTextSelection\(source\)/);
  assert.match(source, /enableReaderTextSelection\(output\)/);
  assert.match(source, /enableReaderTextSelection\(bubble\)/);
  assert.match(source, /data-zai-selectable-text/);
  assert.match(source, /user-select:text!important/);
  assert.match(source, /replaceChildren\(nextMessages\)/);
  assert.match(source, /renderReaderChatStreamFrame/);
}

function verifyBufferedResponsesEventsAreHandled() {
  assert.match(source, /response\.output_text\.done/);
  assert.match(source, /response\.reasoning_summary_text\.done/);
  assert.match(source, /response\.reasoning_summary_part\.done/);
  assert.match(source, /response\.output_item\.done/);
}

function verifySessionHelpers() {
  const session = sut.createReaderConversationSession();
  const state = {
    sessions: [session],
    activeSessionID: session.id,
    messages: [{ role: "user", text: "first question" }],
    previousResponseID: "resp_a",
    responseIDs: ["resp_a"],
    continuationUnsupported: false,
    paperAttached: true,
    paperAttachmentName: "paper.pdf"
  };
  const originalGetBoolPref = sut.getBoolPref;
  sut.getBoolPref = () => false;
  try {
    const active = sut.ensureReaderConversationSession(state);
    sut.syncReaderConversationSession(state, { touch: false });
    assert.strictEqual(active.messages.length, 0);
    assert.strictEqual(state.sessions.length, 1);
    assert.strictEqual(state.sessions[0].messages.length, 1);
    assert.strictEqual(state.sessions[0].previousResponseID, "resp_a");
    assert.match(sut.getReaderConversationSessionTitle(state.sessions[0]), /first question/);
    assert.match(sut.getReaderConversationSessionPreview(state.sessions[0]), /first question/);
  }
  finally {
    sut.getBoolPref = originalGetBoolPref;
  }
}

function verifyHiddenContextDoesNotReserveSpace() {
  assert.match(source, /\.zai-reader-chat-context\[hidden\]\{display:none!important;\}/);
}

verifyMarkdownRendering();
verifyStreamingMarkdownFallback();
verifyConversationStatePersistence();
verifyPDFIsAddedOnlyToCurrentTurn();
verifySSEParsing();
verifyDefaultModelPreference();
verifyServiceURLNormalization();
verifyReaderOutputIsSelectable();
verifyBufferedResponsesEventsAreHandled();
verifyHiddenContextDoesNotReserveSpace();
verifySessionHelpers();
console.log("Reader chat checks passed");
