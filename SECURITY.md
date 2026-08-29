# Security

Please do not post API keys, Zotero profile archives, conversation notes, or PDF files in issues or pull requests.

The plugin stores the configured API URL and key in Zotero preferences on the local machine. This repository contains blank defaults only. Keep local preference exports outside the repository, and use a narrow-scope key where the provider supports it.

If a credential is ever committed or shared accidentally, revoke it at the provider immediately, then remove it from the repository history before publishing a replacement key. A GitHub secret or local environment variable should be used for CI tasks; never hard-code a credential in JavaScript, JSON, screenshots, or documentation.
