// Size caps for full-editor asset uploads (b-roll, images, music). Recordings
// themselves never go through this route — they use the chunked upload path.
export const EDITOR_ASSET_MAX_BYTES = 200 * 1024 * 1024;

// When no storage provider is configured (local dev), assets are stored as
// inline data URLs in the project JSON — keep those small.
export const EDITOR_ASSET_MAX_BYTES_INLINE = 20 * 1024 * 1024;
