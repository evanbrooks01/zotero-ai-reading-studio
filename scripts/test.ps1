$ErrorActionPreference = "Stop"

node --check zotero-ai-reading.js
node scripts/verify-alphaxiv-panel.js
node scripts/verify-reader-chat.js
node scripts/verify-conversation-sessions.js
node scripts/verify-selection-translation.js
node scripts/verify-detachable-panels.js
node scripts/verify-reader-pane-upload.js

Write-Output "All checks passed."
