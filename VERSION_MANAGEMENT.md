# Version Management for Maintainers

This document describes the version management process for maintainers of ChatGPT MD.

## Version Update Script

The `update-version.mjs` script is the canonical way to create new releases. It ensures consistent versioning across all required project files (`package.json`, `manifest.json`, etc.), commits the changes, and creates a git tag.

### Basic Usage

To update the version number for a standard release:

```bash
npm run update-version 2.0.3
```

### Beta Version

To create a beta version, use the `beta` flag:

```bash
npm run update-version 2.0.3-beta.1 beta
```

This will update `manifest-beta.json` instead of `manifest.json`, while still updating `package.json` and `versions.json`.

## Release Process

1.  Decide on the new version number following semantic versioning principles.
2.  Run the `npm run update-version` script as shown above.
3.  Push the changes and the newly created tag to the repository:
    ```bash
    git push origin master
    git push origin v2.0.3 # Or the new tag name
    ```
4.  Create a release on GitHub using the new tag.
5.  Update the release notes with changes since the last version.
