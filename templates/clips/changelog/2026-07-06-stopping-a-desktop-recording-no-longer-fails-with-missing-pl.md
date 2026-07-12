---
type: fixed
date: 2026-07-06
---

Stopping a desktop recording no longer fails with 'missing playback metadata' when macOS is still finalizing the file — the app now waits for the flush, and if it truly times out the message correctly says to retry the upload, not re-record
