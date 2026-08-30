# Changelog

## 0.7.19

- Replaced the unreliable remote-page brief controls with native Zotero XUL toolbar buttons, using one `command` event per press for language, AI, refresh, external, and PDF actions.
- Keeps selection capture and contextual questions in the alphaXiv content process while all persistent controls remain in Zotero's stable chrome layer.
- Rebinds the selection bridge when alphaXiv language navigation replaces the remote content process, so contextual questions continue working after switching Chinese or English.
- Serializes AI pane toggles and bounds Zotero reader initialization waits, preventing repeated input or a pending reader restore from stalling the control.

## 0.7.13

- Rebuilt the alphaXiv header as a fixed hit-test region separated from the remote page, preventing the browser from intermittently covering controls.
- Activated header controls on the initial pointer press with click de-duplication, so language and AI toggles respond once per press.
- Stabilized and enlarged the complete header control row, disabled the PDF toolbar bridge throughout brief mode, and clamped the brief to the visible reader viewport.

## 0.7.12

- Allowed ambiguous alphaXiv toolbar hits to reach the real brief control without cancelling the event or toggling back to the local PDF.

## 0.7.11

- Suspended transparent PDF toolbar hit targets while the online brief is active, so the brief AI button receives clicks immediately.
- Preserved click synthesis for brief controls and enlarged the AI button hit area for more reliable direct presses.

## 0.7.10

- Rebuilt stale transparent toolbar overlays after an add-on upgrade so the alphaXiv AI guard is always active.

## 0.7.9

- Prevented transparent PDF toolbar overlays from intercepting the alphaXiv brief's AI button.
- Kept the brief surface active when opening or closing the local AI pane.
- Added a regression check for toolbar-overlay event isolation.

## 0.7.8

- Fixed alphaXiv brief AI button clicks being misrouted through the PDF toolbar bridge and returning to the local paper.
- Made the AI button in the brief a real open/close toggle while preserving the brief surface.
- Simplified per-paper history rows to show only each session's first user question, without assistant reply previews.

## 0.7.7

- Independent project metadata, extension identity, update feed, and release path.
- Native Responses chat with per-paper, multi-session history stored in Zotero child notes.
- One-time PDF attachment with local retrieval fallback and optional web search.
- Separate reading and translation models/reasoning settings.
- Fixed reader-side translation pane, detachable panels, and drag docking.
- Online Chinese/English paper brief with figures, formulas, contextual selection questions, and local AI routing.
- Streaming reasoning and answer rendering with Markdown and citations.
- Added offline contract checks, GitHub Actions verification, and credential-safe repository defaults.
