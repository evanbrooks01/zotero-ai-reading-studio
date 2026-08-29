const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "zotero-ai-reading.js"), "utf8");
const context = { Map, Set, URL, btoa, atob };
vm.createContext(context);
vm.runInContext(source, context, { filename: "zotero-ai-reading.js" });
const sut = context.ZoteroAIReading;

assert.doesNotMatch(source, /zai-reader-chat-history-session-preview/);

async function run() {
  const first = sut.createReaderConversationSession();
  assert.strictEqual(sut.getReaderConversationSessionTitle(first), "新会话");
  first.messages = [
    { role: "user", text: "Summarize the method", createdAt: 1 },
    { role: "assistant", text: "The method is...", createdAt: 2 }
  ];
  first.responseIDs = ["resp-first"];
  first.previousResponseID = "resp-first";
  assert.strictEqual(sut.getReaderConversationSessionTitle(first), "Summarize the method");
  assert.strictEqual(sut.getReaderConversationSessionPreview(first), "Summarize the method");
  const state = {
    loaded: true,
    ownerItem: { id: 10, libraryID: 1, deleted: false },
    sourceAttachmentID: 20,
    sessions: [first],
    activeSessionID: first.id,
    messages: first.messages,
    previousResponseID: first.previousResponseID,
    responseIDs: first.responseIDs,
    continuationUnsupported: false,
    paperAttached: true,
    paperAttachmentName: "paper.pdf",
    paperRequested: true,
    generation: 0,
    sending: false,
    activeRequest: null,
    savePromise: Promise.resolve(),
    selectionText: "",
    selectionContext: null,
    statusMessage: "",
    statusState: ""
  };
  const original = {
    getBoolPref: sut.getBoolPref,
    renderReaderChat: sut.renderReaderChat,
    saveReaderConversationSnapshot: sut.saveReaderConversationSnapshot,
    deleteStoredReaderResponses: sut.deleteStoredReaderResponses
  };
  const saved = [];
  const deleted = [];
  sut.getBoolPref = () => false;
  sut.renderReaderChat = () => {};
  sut.saveReaderConversationSnapshot = async (_state, snapshot) => saved.push(snapshot);
  sut.deleteStoredReaderResponses = async (ids) => deleted.push(...ids);
  try {
    const firstID = first.id;
    await sut.startNewReaderConversation(state);
    assert.strictEqual(state.sessions.length, 2);
    assert.strictEqual(state.sessions.some((session) => session.id === firstID && session.messages.length === 2), true);
    assert.notStrictEqual(state.activeSessionID, firstID);
    assert.strictEqual(state.messages.length, 0);

    state.messages.push({ role: "user", text: "A second question", createdAt: 3 });
    sut.syncReaderConversationSession(state, { touch: false });
    await sut.switchReaderConversation(state, firstID);
    assert.strictEqual(state.activeSessionID, firstID);
    assert.strictEqual(state.messages[0].text, "Summarize the method");
    assert.strictEqual(state.previousResponseID, "resp-first");

    const secondID = state.sessions.find((session) => session.id !== firstID).id;
    await sut.deleteReaderConversationSession(state, secondID);
    assert.strictEqual(state.sessions.length, 1);
    assert.strictEqual(state.activeSessionID, firstID);
    assert.ok(saved.length >= 3);
    assert.deepStrictEqual(deleted, []);

    await sut.deleteReaderConversationSession(state, firstID);
    assert.strictEqual(state.sessions.length, 0);
    assert.strictEqual(state.activeSessionID, "");
    assert.ok(deleted.includes("resp-first"));
  }
  finally {
    Object.assign(sut, original);
  }
}

run().then(() => console.log("Conversation session checks passed"));
