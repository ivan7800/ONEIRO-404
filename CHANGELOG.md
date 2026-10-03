# Changelog

All notable changes to ONEIRO 404 are documented here.

## [1.0.1] - 2026-10-03

### Fixed
- Large encrypted backup Base64 conversion no longer overflows the stack.
- Backup/KDF validation hardened before key derivation.
- Restore failures now trigger rollback and recovery-snapshot handling.
- Local PIN is preserved when importing older backups without privacy data.
- Deleted migrated session entries no longer reappear after restart.
- Service Worker registration is no longer missed during asynchronous startup.
- Mobile navigation no longer overlaps the Home area because of the header backdrop filter.
- Double-submit protections added to journal/session persistence flows.
- IndexedDB connection state is invalidated on `versionchange`.

### Added
- Reproducible 20-script QA suite with real-browser integration coverage.
- GitHub Actions QA and GitHub Pages deployment workflow.
- Repository security policy, contribution guide, issue templates and MIT license.

### Changed
- Production Service Worker cache identifier finalized as `oneiro-404-v1.0.1-final`.
