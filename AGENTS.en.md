# AGENTS.md

These instructions apply to every file in this repository.

## Development Principles

- Keep this a regular Songloft JS plugin. Do not add a Python runtime, persistent process, extra container, or audio transcoding.
- Keep search lightweight. Resolve audio URLs, lyrics, and covers only when previewing, importing, or downloading.
- Never replace a track across music sources automatically. Report a clear error after same-source resolution fails.
- Downloads must preserve the available upstream format, and Songloft `music_path` always owns the root directory.
- Hide raw network failures by default and reveal diagnostics only after the user opens error details.

## Security Rules

- Never commit credentials, passwords, tokens, cookies, Authorization values, private keys, real audio URLs, or machine-specific absolute paths.
- Every new outbound request needs a timeout, and sensitive headers must not enter logs or error responses.
- Persist only stable source identity and re-resolution fields in `source_data`; never persist expiring final playback URLs.
- Request only the minimum plugin permissions. Document and test every newly added permission.

## Documentation and Validation

- Keep `README.md`, `SPEC.md`, and `AGENTS.md` synchronized with their English counterparts.
- Update `CHANGELOG.md` and the plugin version for behavior changes.
- Before committing, run:

```bash
corepack pnpm install
corepack pnpm test
corepack pnpm run typecheck
corepack pnpm run build
node scripts/validate-build.mjs
```

- Automated tests must use mock transports or local services and must not depend on public upstream APIs.
- Do not commit `dist/`, `node_modules/`, environment files, logs, or key material.
