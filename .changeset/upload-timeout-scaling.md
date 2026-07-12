---
"@agent-native/core": patch
---

Scale Builder file-upload abort timeouts with payload size. The flat 2-minute AbortController window killed slow-but-progressing uploads (a 136MB video on a ~2 Mbit/s uplink needs >10 minutes) with "This operation was aborted". Body-carrying requests now budget ~10s per MB on top of the 2-minute base, capped at 30 minutes; metadata requests keep the flat timeout.
