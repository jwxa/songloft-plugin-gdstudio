# Songloft GDStudio Plugin

This is an independent Songloft JS plugin for searching GDStudio music inside a plugin page. V1 follows a preview-first, manually-add-to-library workflow so search results do not automatically pollute the library.

Repository: <https://github.com/jwxa/songloft-plugin-gdstudio>

## Current Capabilities

- Uses the official GDStudio public API first for search, metadata, and audio resolution without relying on webpage signatures, Cloudflare cookies, or a Python runtime.
- Only when GDStudio returns no audio URL for a Kuwo result, uses the same-source Kuwo resolver adopted by musicsquare with the same song ID; it never switches sources automatically.
- Enables NetEase, Kuwo, and Tencent by default and persists source toggles in plugin storage. Tencent uses the same-source endpoint tracked by musicdl's `QQMusicClient` and never substitutes another source automatically when resolution fails.
- Search failures show an actionable summary by default; raw network and upstream diagnostics are revealed only after the user opens the details dialog.
- Each source search request is retried once after its first failure; an error is shown only if the retry also fails.
- Supports All / NetEase / Kuwo / Tencent source filters, independent pagination, and per-source failure isolation.
- All automated tests use a controlled mock transport and never depend on the public GDStudio service.
- Supports full streaming preview in the plugin page, followed by explicit library import or download under Songloft `music_path`; downloads preserve the upstream format without transcoding.
- Shows immediate loading feedback while resolving previews. Lossless formats are labeled as “FLAC/APE · Lossless” instead of presenting upstream nominal values such as `2000` as an exact constant bitrate.
- Android/iOS WebViews show a “Play preview” button after resolution so playback starts from a second explicit user gesture. Desktop autoplay falls back to the same button when blocked by platform policy.
- After “Play in main player” starts the persisted song queue, supported Songloft clients open the full-screen player through the host navigation bridge.
- Downloads are submitted as Songloft background tasks. The page polls and displays queued, preparing, real byte-transfer, finalizing, completed, and failed states without blocking a QuickJS request for the full file.
- Selected tracks can be added to a FIFO batch queue. Page concurrency is configurable from one to three, defaults to two, and is additionally protected by a host-global limit.
- Verifies single-track playability before library import or download, preventing known-unplayable records from being created.

## Development

```bash
corepack pnpm install
corepack pnpm run validate
corepack pnpm test
```

The build artifact is written to `dist/gdstudio.jsplugin.zip`.

## Plugin Store Installation

Add the following URL under Songloft **Plugin Store → Manage Registries**:

```text
https://raw.githubusercontent.com/jwxa/songloft-plugin-gdstudio/main/registry.json
```

Return to the plugin store, search for “GDStudio Music,” and install it. The plugin is also being submitted to the official Songloft registry; once accepted, adding this registry manually is no longer necessary.

## Manual Installation

1. Download `gdstudio.jsplugin.zip` from GitHub Releases, or run `corepack pnpm run validate` to build and validate it locally.
2. Sign in to Songloft and open JS plugin management.
3. Upload `dist/gdstudio.jsplugin.zip`; an existing matching `entryPath` is replaced as an update.
4. Refresh the plugin page and verify the version, search, preview, and download states.

Songloft `2.11.0` or later is required. Official `2.11.0` supports search, library import, and compatibility downloads. The plugin hides preview controls when the temporary preview API is unavailable, falls back to synchronous downloads without live byte progress when background download tasks are unavailable, and asks users to return to the main player manually when the client navigation bridge is missing. `jwxa/songloft` builds containing the host extensions provide the complete feature set. See `SPEC.en.md` for requirements and boundaries, `CHANGELOG.md` for release changes, and `AGENTS.en.md` for contributor guidance.

## Known Limitations

- Search and resolution depend on third-party upstream services whose availability, data completeness, and response formats may change.
- A timed-out NetEase or other source request is retried once; a friendly error appears only when the retry also fails.
- The plugin cannot guarantee playable URLs for paid, membership-only, or region-restricted content.
- Full-screen main-player navigation depends on a client navigation bridge. Unsupported clients still start playback but may not switch pages automatically.

## Usage Boundary

This project is intended only for personal use or small private, noncommercial deployments. Only access and persist content you are authorized to use, and comply with applicable law, GDStudio service rules, and the terms of each music source.

The plugin page displays “Personal research only · No distribution.” This notice is neither a waiver nor a license; users remain responsible for ensuring that accessed, previewed, and persisted content is lawfully authorized.

The complete usage notice is shown on every page entry. Users must explicitly check that they have read and accepted it before accessing plugin features.

Quality fallback and data mapping behavior follows `musicdl 2.13.4`. NetEase and Kuwo prefer the official GDStudio public API; the same-source Kuwo fallback follows `CharlesPikachu/musicsquare`, while Tencent search and resolution use the Tang same-source endpoint tracked by musicdl's `QQMusicClient`. The plugin does not install, bundle, or execute Python/musicdl. See `LICENSE` and `NOTICE` for attribution and noncommercial-use terms.
