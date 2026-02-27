# Changelog

## v0.2.3 (2026-02-27)

### Fixes
- Trigger publish workflow via dispatch since GITHUB_TOKEN tag pushes don't trigger workflows (23145c4)
- Remove duplicate publish-npm job from ci.yml (d9ac7ea)


## v0.2.2 (2026-02-27)

### Fixes
- Add pipefail to npm publish steps so failures aren't masked (c74a02e)


## v0.2.1 (2026-02-27)

### Fixes
- Fail npm publish on real errors, only ignore duplicate versions (31202b2)


## v0.2.0 (2026-02-27)

### Features
- Add dependency chains, smarter querying, and quality-of-life CLI commands (510b80b)
- Add duration filtering, context filtering, related tasks, and templates (bb710c8)
- Add first-class Projects entity with CRUD operations (ce58484)

### Other
- Add auto-release with conventional commit version detection (ec2c4fa)

