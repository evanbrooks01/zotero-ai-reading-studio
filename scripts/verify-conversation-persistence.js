const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(__dirname, "..", "zotero-ai-reading.js"), "utf8");
const context = { Map, Set, URL, btoa, atob };
vm.createContext(context);
vm.runInContext(source, context, { filename: "zotero-ai-reading.js" });
const sut = context.ZoteroAIReading;

async function run() {
  const original = {
    resolveReaderConversationOwner: sut.resolveReaderConversationOwner,
    getItemByID: sut.getItemByID,
    scheduleReaderConversationSaveRetry: sut.scheduleReaderConversationSaveRetry,
    indexConversation: sut.indexConversation,
    log: sut.log
  };
  const state = {
    ownerItem: { id: 10, libraryID: 1, deleted: false },
    sourceAttachmentID: 20,
    conversationNote: null,
    generation: 0
  };
  let retryCount = 0;
  let indexedNote = null;
  sut.scheduleReaderConversationSaveRetry = () => retryCount++;
  sut.indexConversation = (_state, note) => { indexedNote = note; };
  sut.log = () => {};
  sut.getItemByID = () => null;

  try {
    let owner = { id: 11, libraryID: 2, deleted: false };
    sut.resolveReaderConversationOwner = async (targetState) => {
      targetState.ownerItem = owner;
      return owner;
    };
    class SavedNote {
      constructor() {
        this.id = null;
      }
      setNote(value) {
        this.markup = value;
      }
      async saveTx() {
        assert.strictEqual(state.conversationNote, null,
          "an unsaved note must not leak into live conversation state");
        this.id = 99;
      }
    }
    context.Zotero = { Item: SavedNote };
    let saved = await sut.saveReaderConversationSnapshot(state, { sessions: [] });
    assert.strictEqual(saved, true);
    assert.strictEqual(state.ownerItem, owner);
    assert.strictEqual(state.conversationNote.parentID, 11);
    assert.strictEqual(state.conversationNote.libraryID, 2);
    assert.strictEqual(indexedNote, state.conversationNote);

    state.conversationNote = null;
    class ForeignKeyNote extends SavedNote {
      async saveTx() {
        assert.strictEqual(state.conversationNote, null);
        throw new Error("FOREIGN KEY constraint failed [QUERY: INSERT INTO itemNotes]");
      }
    }
    context.Zotero = { Item: ForeignKeyNote };
    saved = await sut.saveReaderConversationSnapshot(state, { sessions: [{ id: "one" }] });
    assert.strictEqual(saved, false);
    assert.strictEqual(state.conversationNote, null);
    assert.strictEqual(retryCount, 1);

    let constructed = false;
    context.Zotero = { Item: class { constructor() { constructed = true; } } };
    sut.resolveReaderConversationOwner = async () => null;
    saved = await sut.saveReaderConversationSnapshot(state, { sessions: [{ id: "two" }] });
    assert.strictEqual(saved, false);
    assert.strictEqual(constructed, false);
    assert.strictEqual(retryCount, 2);

    const staleItem = { id: 55, deleted: false };
    sut.getItemByID = () => staleItem;
    context.Zotero = { DB: { valueQueryAsync: async () => false } };
    assert.strictEqual(
      await sut.getPersistedReaderConversationItem(staleItem),
      null,
      "Zotero returns false when the item row does not exist"
    );
    context.Zotero = { DB: { valueQueryAsync: async () => 55 } };
    assert.strictEqual(await sut.getPersistedReaderConversationItem(staleItem), staleItem);
  }
  finally {
    Object.assign(sut, original);
  }
}

run().then(() => console.log("Conversation persistence checks passed"));
