# Zotero AI Reading Studio

An independently maintained Zotero workspace for paper reading. It keeps Zotero metadata, local PDFs, an online paper brief, and persistent AI conversations in one workflow.

> This repository is the independently reworked product version, with its own extension identity, update feed, and release process.

[中文文档](README.md) · [Project home](https://github.com/Shanfu2021/zotero-ai-reading-studio)

[Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## Features

### Local Responses assistant

- A fixed AI pane inside the Zotero PDF reader with streaming output, reasoning summaries, Markdown, code blocks, tables, and citation links.
- Configurable OpenAI Responses-compatible URL, key, model, and reasoning effort.
- Reading and translation use separate model and reasoning settings. Reading defaults to `gpt-5.6-sol`; supported effort labels are `low`, `medium`, `high`, `xhigh`, and `max`.
- Uses `previous_response_id` for Responses continuation and falls back to the local Zotero conversation when a gateway does not support continuation.
- Optional Responses web search, with a prompt that separates paper evidence, selected context, and external sources.

### Per-paper conversation history

- Conversations are stored as child notes of the Zotero paper.
- A session is created only when its first message is sent. The first question becomes the session title in the history list.
- Create, switch, and delete individual sessions. Removing the paper or its PDF also removes the stored conversation records.
- The current PDF can be attached explicitly to the first turn; later turns reuse the conversation or local retrieval instead of uploading the same file again.

### Selection translation

- Selected PDF text is translated in a fixed reader-side pane, docked left by default so the paper and AI pane stay centered.
- Long selections are translated in ordered chunks without silently dropping the tail of the selection.
- Translation has its own model, reasoning, and settings control, and selected text can be added to the current paper conversation.

### Online paper brief

- Detects arXiv identifiers in Zotero metadata and opens the Chinese or English online brief inside the reader.
- Keeps the figures, formulas, and author-curated material from the online page while retaining the local PDF as the original view.
- Releasing a selection in the brief opens a local contextual question editor beside the selection automatically.
- Brief questions enter the same paper conversation with section, paragraph, and surrounding context.
- The website's native Assistant/Reply entry points are hidden; questions are routed through the Responses API configured in this project.

### Panels and reading ergonomics

- AI, translation, and brief panes can stay docked in Zotero or be detached into a standalone window.
- Panes are draggable; translation defaults to the left and AI to the far right.
- Opening or closing a pane preserves the PDF reading position, and streaming answers do not force-scroll the document.
- Failed or timed-out requests leave an explicit error message instead of an empty permanent “generating” bubble.

## Usage screenshots (placeholders)

The current README reserves the screenshot slots below. Replace each placeholder with your own Zotero screenshot under `docs/screenshots/`, using the filenames in the table. Clear or redact API URLs, keys, account names, and local file paths before committing screenshots.

| File | Suggested capture |
| --- | --- |
| `01-settings.png` | `Edit -> Settings -> AI Reading Assistant`: blank/redacted API fields, reading model and official reasoning, plus separate translation model/reasoning. |
| `02-reader-ai.png` | The AI pane beside a PDF: model selector, retrieval toggle, attach-current-PDF control, and a streamed Markdown answer. |
| `03-translation.png` | The left translation pane: source selection, translated text, translation settings button, and the “Add to chat” action. |
| `04-translation-to-chat.png` | The AI pane after “Add to chat”, showing the selected source and translation included in the current paper session. |
| `05-brief-question.png` | The local contextual question editor that appears beside a released selection in the alphaXiv brief. |
| `06-history.png` | The history list with multiple sessions for one paper, first-question titles, switch, and delete controls. |

These are text placeholders rather than stale screenshots. See [`docs/screenshots/README.md`](docs/screenshots/README.md) for capture dimensions, naming, and replacement instructions.

## Install

1. Download the latest `.xpi` from [Releases](https://github.com/Shanfu2021/zotero-ai-reading-studio/releases).
2. In Zotero, open `Tools -> Add-ons`, open the gear menu, and choose “Install Add-on From File”.
3. Open `Edit -> Settings -> AI Reading Assistant` and enter your API URL and key.
4. Use the `AI`, translation, or brief button in the PDF reader toolbar.

The current release is also available directly: [zotero-ai-reading-0.7.7.xpi](https://github.com/Shanfu2021/zotero-ai-reading-studio/releases/download/v0.7.7/zotero-ai-reading-0.7.7.xpi).

## Configuration

The plugin uses an OpenAI Responses-compatible API. Enter either a service root URL or a URL containing `/v1`; the plugin normalizes requests to `/v1/responses` and `/v1/models`.

| Setting | Purpose |
| --- | --- |
| API URL / API key | Connect to your compatible service; stored only in local Zotero preferences |
| Reading model | Model used by the reading assistant, default `gpt-5.6-sol` |
| Reading reasoning | Official effort values: `low`, `medium`, `high`, `xhigh`, `max` |
| Translation model | Separate model for selection translation |
| Translation reasoning | Translation-only reasoning effort |
| PDF attachment | Attach the current PDF to the next message, once per session |
| Web search | Allow Responses web search to supplement evidence |

Never put a real key in `prefs.js`, README files, screenshots, tests, or GitHub Actions. The repository contains blank defaults only; see [SECURITY.md](SECURITY.md).

## Build from source

Requirements: Zotero 7+, PowerShell (Windows) or Bash (macOS/Linux), and Node.js 18+.

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-xpi.ps1
powershell -ExecutionPolicy Bypass -File scripts/test.ps1
```

macOS/Linux:

```bash
bash scripts/build-xpi.sh
node --check zotero-ai-reading.js
```

Build output is written to `dist/`. The directory, XPI files, local diagnostics, and common credential files are ignored by default; release builds should be uploaded as GitHub Release assets.

## Project layout

```text
bootstrap.js             Zotero startup entry point
zotero-ai-reading.js     Reader panes, Responses, retrieval, sessions, and translation
preferences.xhtml        Zotero settings page
prefs.js                 Blank default preferences
floating-window.xhtml    Detached pane host window
scripts/build-xpi.*      XPI build scripts
scripts/verify-*.js      Offline contract checks
.github/workflows/       GitHub Actions verification
```

## Privacy and security

The API URL and key are stored in local Zotero preferences and are not part of this repository. A PDF is sent to the configured service only when you explicitly enable PDF attachment or local retrieval. When web search is enabled, search terms and necessary context may be sent to an external search service; review the provider's retention and privacy policy.

If a key ever appears in a log, screenshot, or commit, revoke it immediately at the provider, create a replacement, and clean the public history.

## Development checks

Run at least the following before committing:

```text
node --check zotero-ai-reading.js
node scripts/verify-alphaxiv-panel.js
node scripts/verify-reader-chat.js
node scripts/verify-conversation-sessions.js
node scripts/verify-selection-translation.js
node scripts/verify-detachable-panels.js
node scripts/verify-reader-pane-upload.js
```

## License

MIT License, see [LICENSE](LICENSE).
