# Contributing

This is a desktop Zotero extension. Keep changes focused on reader behavior, local data safety, and compatibility with Zotero 7+.

Before opening a pull request:

1. Run `powershell -ExecutionPolicy Bypass -File scripts/test.ps1` on Windows, or run the Node checks listed in `README.md`.
2. Build an XPI and install it in a clean Zotero test profile.
3. Do not include API keys, Zotero profile databases, PDFs, conversation notes, or generated `dist/` diagnostics.
4. Describe any network request or new data sent to an AI/search provider.

Changes to the Responses payload, session note format, or PDF attachment behavior should include a focused contract test.
