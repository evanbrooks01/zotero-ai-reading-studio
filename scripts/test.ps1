$ErrorActionPreference = "Stop"

function Invoke-Node {
  & node @args
  if ($LASTEXITCODE -ne 0) {
    throw "Node check failed with exit code $LASTEXITCODE`: node $($args -join ' ')"
  }
}

Invoke-Node --check zotero-ai-reading.js
Invoke-Node scripts/verify-alphaxiv-panel.js
Invoke-Node scripts/verify-reader-chat.js
Invoke-Node scripts/verify-conversation-sessions.js
Invoke-Node scripts/verify-conversation-persistence.js
Invoke-Node scripts/verify-selection-translation.js
Invoke-Node scripts/verify-detachable-panels.js
Invoke-Node scripts/verify-reader-pane-upload.js

Write-Output "All checks passed."
