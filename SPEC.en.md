# Songloft GDStudio Plugin V1 Specification

## Problem Statement

Songloft users want to search and preview online music provided through GDStudio without polluting their library first. After confirming that a track and its version are correct, they want to explicitly add it to the Songloft library or download it into the local music directory.

Songloft plugins can currently create remote songs and resolve playback URLs dynamically through `/api/music/url`, but the main player only accepts persisted song IDs. The current plugin HTTP handler is also unsuitable for continuously proxying full audio streams and Range requests. Therefore, the existing plugin API alone cannot simultaneously provide non-persistent search results, full-track preview, reliable upstream headers, and seeking.

The target deployment is private, noncommercial, and small-scale, with at most five concurrent users. V1 must remain a normal Songloft plugin and must not require Python, a musicdl CLI, an additional container, or a special Python Docker image.

## Solution

Build an independent `songloft-plugin-gdstudio` plugin and add a plugin-agnostic temporary preview capability to the Songloft backend.

The plugin calls the official GDStudio public API directly from TypeScript running in QuickJS to implement lightweight search, audio URL resolution, cover retrieval, and lyric retrieval. Quality fallback and data mapping follow musicdl 2.13.4 `GDStudioMusicClient`, but the Python package is neither installed nor executed, and no webpage signature or Cloudflare cookie is required.

Search results initially exist only in the plugin page. When the user starts a preview, the plugin creates a temporary preview session through a JWT-authenticated API. The Songloft backend resolves the real source URL and required headers through the plugin, creates a short-lived random token, and exposes the full track through a generic streaming proxy consumed by the plugin mini-player. Previewing creates no song record and writes no temporary audio file.

After previewing, the user can explicitly add one or multiple tracks to the library. Persisted tracks use the existing remote-song model and `/api/music/url` resolution path. Clicking “Download locally” is treated as explicit consent: the system creates or reuses the remote song and invokes the existing `songs.download` capability to save the highest available original audio under `music_path`, without transcoding, while embedding available tags, lyrics, and cover art.

## User Stories

1. As a Songloft user, I want to search GDStudio music, so that I can discover tracks not yet stored in my library.
2. As a Songloft user, I want NetEase, Kuwo, and Tencent enabled by default while retaining explicit source controls, so each source remains manually selectable.
3. As a Songloft user, I want to enable or disable each sub-source, so that I can control the search scope.
4. As a Songloft user, I want an “All” search to query every enabled source, so that I can compare candidates in one operation.
5. As a Songloft user, I want results grouped by currently available source, so the origin of each NetEase or Kuwo version is explicit.
6. As a Songloft user, I want independent pagination per source, so that I can load more results only where needed.
7. As a Songloft user, I want ten initial results per source, so that speed and browseability remain balanced.
8. As a Songloft user, I want results from healthy sources even when another source fails, so that partial outages do not block search.
9. As a Songloft user, I want search to return lightweight metadata quickly, so that I do not wait for every track to resolve audio and lyrics.
10. As a Songloft user, I want title, artist, album, duration, and source displayed, so that I can identify a candidate.
11. As a Songloft user, I want same-named tracks from different sources kept separate, so that I can select the exact version myself.
12. As a Songloft user, I want previewing to create no library record, so that previews do not pollute my library.
13. As a Songloft user, I want full-track previews, so that I can properly judge a track and version.
14. As a Songloft user, I want pause and seek during preview, so that I can inspect specific sections.
15. As a Songloft user, I want preview to start at the highest available quality, so that the listening experience is optimal.
16. As a Songloft user, I want unavailable quality levels to fall back automatically, so that preview still succeeds.
17. As a Songloft user, I want preview confined to the plugin mini-player, so that search results remain isolated from the main queue.
18. As a Songloft user, I want the preview URL to hide the real upstream URL, so that temporary sources are less exposed.
19. As a Songloft user, I want preview sessions to expire automatically, so that invalid links do not remain usable indefinitely.
20. As a Songloft user, I want stopping a preview to release its session, so that limited capacity is not wasted.
21. As a Songloft user, I want a song created only after I click “Add to library,” so that persistence remains explicit.
22. As a Songloft user, I want to add multiple selected results, so that I can organize several tracks efficiently.
23. As a Songloft user, I want batch-add results reported per item, so that I can distinguish success, duplicates, and failures.
24. As a Songloft user, I want duplicate additions to reuse the existing song, so that the library remains clean.
25. As a Songloft user, I want persisted tracks to resolve the current highest quality on every playback, so that expired direct URLs are not stored.
26. As a Songloft user, I want a failed source retried only within that same source, so that a different recording is not selected automatically.
27. As a Songloft user, I want cross-source replacement to require confirmation, so that identity changes remain under my control.
28. As a Songloft user, I want “Download locally” to create or reuse the song automatically, so that I do not repeat steps.
29. As a Songloft user, I want selected tracks queued in order with a configurable concurrency limit, so that batch efficiency remains balanced against bandwidth and disk load.
30. As a Songloft user, I want the highest available existing audio file, so that source quality is preserved.
31. As a Songloft user, I want no transcoding during download, so that CPU use and generation loss are avoided.
32. As a Songloft user, I want title, artist, album, lyrics, and cover embedded after download, so that local files have useful metadata.
33. As a Songloft user, I want missing cover or lyrics not to block persistence or download, so that optional metadata failures are graceful.
34. As a Songloft user, I want downloads rooted under Songloft `music_path`, so that files remain in the managed library.
35. As a Songloft user, I want a configurable relative path template, so that files can be organized by artist and album.
36. As a Songloft user, I want path templates validated safely, so that downloads cannot escape `music_path` or overwrite arbitrary files.
37. As a Songloft user, I want each download to show queued, preparing, byte progress, finalizing, and completion states, so that I can tell whether work is advancing.
38. As a Songloft user, I want the plugin page to work on web, desktop, and mobile, so that the feature is available across clients.
39. As a mobile user, I want playback triggered by an explicit gesture, so that WebView autoplay restrictions are respected.
39. As an administrator, I want support for up to five concurrent users, so that the private deployment meets its expected load.
40. As an administrator, I want limits for search, resolution, and preview sessions, so that plugin use cannot exhaust server resources.
41. As an administrator, I want the plugin to access GDStudio directly without a second proxy setting, so that configuration stays simple.
42. As an administrator, I want preview audio never written to disk, so that no second cache and cleanup system is created.
43. As an administrator, I want all preview sessions invalidated on restart, so that temporary capabilities cannot survive unexpectedly.
44. As an administrator, I want plugin, reference musicdl, and GDStudio protocol versions visible, so that compatibility issues are diagnosable.
45. As a maintainer, I want GDStudio logic separated from the generic Songloft preview proxy, so that other plugins can reuse the capability.
46. As a maintainer, I want the core preview API to contain no GDStudio-specific fields, so that the module keeps a single responsibility.
47. As a maintainer, I want stable source and track identifiers used for deduplication, so that same-source records are reused reliably.
48. As a maintainer, I want errors separated by search, resolution, preview, metadata, persistence, and download stage, so that failures are actionable.
49. As a maintainer, I want tokens, real media URLs, and authentication headers excluded from normal logs, so that credentials are not leaked.
50. As a maintainer, I want every new backend route represented in Swagger, so that API documentation remains synchronized.

## Implementation Decisions

- The plugin is developed as an independent `songloft-plugin-gdstudio` project. GDStudio protocol logic does not belong in Songloft core business modules.
- V1 uses TypeScript and the Songloft Plugin SDK in QuickJS. It uses no Python runtime, musicdl CLI, external executable, additional container, or special runtime image.
- Search, cover art, lyrics, and audio URL resolution prefer the official GDStudio public API, while quality fallback and data mapping follow musicdl 2.13.4. Only when every GDStudio quality returns no URL for a `kuwo` result does the plugin use the same-source Kuwo resolver adopted by musicsquare, preserving the original song ID and source. The project includes applicable attribution, copyright notices, and noncommercial terms, and V1 is private and noncommercial.
- `netease` and `kuwo` are enabled by default. Enabled sources and the download path template are stored in plugin persistent storage. `tencent` remains visible as unavailable; while the current GDStudio public API rejects it, the plugin sends no request and never substitutes another source automatically.
- Search uses a lightweight path and returns only stable identity and display metadata. Initial search must not synchronously retrieve lyrics, test every quality, or fetch complete audio for every result.
- Results are grouped by sub-source with independent pagination and ten default results per page. Cross-source automatic merging is prohibited.
- The stable deduplication key is `gdstudio:<root_source>:<identifier>`. Same-named tracks from different sources remain separate candidates.
- `source_data` stores stable identity, including sub-source, track identifier, and required matching metadata. Expiring final media URLs must not be persisted.
- The plugin implements the existing source search protocol and `/api/music/url` resolution contract. Persisted playback resolves the current highest available quality from stable identity.
- The requested quality tiers are `999 → 740 → 320 → 192 → 128` for both preview and persisted playback. Lossy formats display the upstream bitrate; lossless formats display the actual container and a lossless label without presenting nominal fallback values such as `2000` as an exact constant bitrate.
- The same-source Kuwo fallback returns the upstream existing audio file with its actual format, bitrate, and required headers without transcoding. Only after that resolver fails may same-source rematching run, and the plugin never switches sub-sources automatically.
- Within the same source, stale URLs may be recovered through stable ID or title, artist, and duration matching. Switching to another source without user confirmation is prohibited.
- Songloft core gains a generic preview-session manager that knows only plugin entry, opaque `source_data`, resolved URL, headers, owner, expiry, and state. It contains no GDStudio business fields.
- Preview-session creation requires Bearer JWT. The request identifies the plugin and opaque `source_data`; core invokes `/api/music/url` and returns a random token, stream URL, and expiry.
- The preview stream uses a high-entropy random token as a short-lived capability and does not require the media element to attach JWT. Tokens expire after 30 minutes and bind to one immutable upstream resource.
- The proxy preserves Range semantics, including `Range`, `If-Range`, `Accept-Ranges`, `Content-Range`, `Content-Length`, 200/206 status codes, and appropriate MIME information.
- The proxy applies resolved upstream headers and existing URL/host safety validation. Clients cannot mutate the URL or headers after session creation.
- Preview audio is not written to disk, does not reuse the formal music cache, and does not create temporary song database rows. Restarting the service invalidates every in-memory session.
- Sessions can be explicitly released, while TTL cleanup handles abandoned pages.
- Capacity targets up to five users: at most two concurrent global searches, four concurrent source resolutions, eight live preview sessions per user, and 32 globally. Excess load returns a recognizable rate-limit error.
- The plugin page contains search, source filtering, independent pagination, result lists, batch selection, mini-player, library actions, local download, settings, and explicit error states.
- The mini-player is preview-only. It does not enter the Songloft main queue, does not guarantee playback after leaving the plugin page, and does not provide background system media controls.
- Adding to the library is explicit. A single-track add verifies audio resolvability before enriching available metadata and invoking the existing remote-song creation capability; a known unavailable source returns `422` without creating a song, while optional metadata failure does not block creation.
- Batch add is not an all-or-nothing transaction. It reports success, duplicate, and failure for each item.
- “Download locally” is an explicit action. It verifies audio resolvability first, creates a missing song or reuses an existing one, submits a background task through `songs.downloadStart`, and polls progress through `songs.downloadStatus`. A known unavailable source returns `422` without creating or downloading a song.
- Background download tasks are host-managed and expose high-entropy task IDs, owner-isolated snapshots, and real byte progress. Plugin HTTP requests only submit or query tasks and never wait for the complete file, so the design does not depend on increasing the global QuickJS timeout.
- The page queue is FIFO with configurable concurrency from one to three, defaulting to two. The host task module adds a global limit of four to prevent multiple plugin pages or users from saturating the download path.
- Download calls omit format and quality conversion options, preserving the source-provided existing audio format. Quality fallback occurs during source resolution, never through FFmpeg transcoding.
- Metadata embedding is enabled by default. Available title, artist, album, lyrics, and cover are written; individual write failures are warnings and do not change overall download success.
- Download roots remain fixed to Songloft `music_path`. The plugin stores and passes only a relative template, defaulting to `downloads/{artist}-{album}/{title}`, and reuses existing template validation, filename sanitization, and collision avoidance.
- The plugin adds no HTTP Proxy setting. QuickJS requests use the host JSRuntime HTTP behavior to access GDStudio directly.
- Every new backend route follows the existing REST response rules, uses the standard `error` and `detail` error object, and includes Swagger annotations and regenerated outputs.
- No database migration is introduced. Preview sessions are memory-only; formal songs continue to use the existing song table, plugin entry, opaque `source_data`, and deduplication key.
- Songloft core and the plugin are versioned independently. The plugin status or settings page displays its version, reference musicdl version, and GDStudio protocol version for manual compatibility validation.

## Testing Decisions

- Tests assert externally observable behavior rather than internal function names, goroutine counts, storage container types, or exact UI DOM structure.
- Because Songloft core and the independent plugin are separately released units, V1 uses two highest-level seams rather than sharing internal test implementation across repositories.
- The core seam is the black-box HTTP preview-session API. A fake plugin resolver and local upstream audio server cover creation, token streaming, 200/206 Range behavior, header forwarding, expiry, explicit release, invalid tokens, upstream failures, SSRF rejection, and capacity limits.
- Core API tests follow existing handler/router patterns with HTTP recorders and test servers and do not directly inspect private session storage.
- The plugin seam is its HTTP contract. A controlled mock GDStudio service exercises official API queries, source filters, pagination, lightweight DTOs, quality fallback, metadata enrichment, and `/api/music/url` output.
- Plugin tests never call the real GDStudio network service, avoiding upstream instability, rate limits, and regional differences.
- Public API client tests verify GET query parameters and confirm that webpage signature fields are not sent.
- Stable identity and deduplication contract tests verify reuse for the same source and ID and separation across different sources.
- Batch-add behavior tests verify that success, duplicate, and failure can coexist and that one failure does not roll back successful items.
- Download bridge tests verify task-owner isolation, FIFO ordering, the global concurrency limit, real byte progress, and completion/failure states.
- Plugin page queue tests verify that the third item waits when concurrency is two and lock down the race where a host `queued` snapshot could otherwise resubmit the same item.
- Settings persistence tests verify enabled-source, path-template, and one-to-three concurrency save/restore behavior and reject invalid values.
- Responsive UI checks cover web, narrow mobile viewports, and desktop WebView behavior, focusing on user-gesture playback, mini-player state, and reachable actions.
- Acceptance validation covers at least Web, Android WebView, and Windows WebView. Other platforms share the same web UI but are not claimed as fully platform-tested.
- Backend completion requires formatting, static checks, focused tests, the complete Go test suite, and Swagger regeneration validation.
- Plugin completion requires TypeScript type checking, plugin build, manifest validation, and contract tests.

## Out of Scope

- Installing or running the complete musicdl Python package.
- Python CLI, PyInstaller, bundled Python runtime, or resident helper process.
- A custom Python Docker image or additional sidecar container.
- musicdl clients other than GDStudio.
- Enabling sources other than NetEase, Kuwo, and Tencent by default.
- Automatic cross-source result merging.
- Automatic cross-source replacement without confirmation.
- Sending non-persisted search results to the Songloft main player queue.
- Background preview playback, system media controls, or guaranteed playback after leaving the plugin page.
- Disk-backed preview audio, resumable preview cache, or reuse of the formal CacheService.
- Pausing, resuming, or cancelling a running download task.
- FFmpeg transcoding, output-format selection, or bitrate conversion.
- Download targets outside `music_path`.
- A new global download-path setting or changes to existing `music_path` semantics.
- New database tables or persistent preview sessions.
- Automatic updates of the referenced musicdl/GDStudio protocol implementation.
- Public marketplace distribution, commercial use, or license relicensing.

## Further Notes

- This specification targets private, noncommercial deployment. Public release requires a fresh review of musicdl licensing, GDStudio service terms, attribution, and redistribution boundaries.
- GDStudio is an external service. Songloft cannot guarantee long-term stability, content availability, or API compatibility. The plugin must expose upstream errors clearly and tolerate independent source failures.
- The pure TypeScript plan supersedes the earlier Python CLI, complete musicdl installation, and special-image proposals; those are no longer part of V1.
- The generic preview proxy is the only new capability entering Songloft core. GDStudio public API calls, pagination, metadata, and quality policy remain in the independent plugin.
- Implementation should complete the backend preview contract and plugin mock-service contract before integrating the real GDStudio service, so infrastructure is not debugged against an uncontrolled upstream.
