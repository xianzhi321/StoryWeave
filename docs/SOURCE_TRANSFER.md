# GitHub source transfer — StoryWeave v1.9.19

This repository contains the complete v1.9.19 project source, including the original Android native tablet implementation, legacy Web client, test scripts and third-party attribution files. The upload intentionally excludes release APKs, signing materials and user projects.

## Large Azgaar paper texture

The GitHub integration cannot upload a 3,174,114-byte PNG as a single Git object through its current upload channel. Consequently the file at:

- `web/vendor/azgaar/images/textures/soiled-paper-vertical.png`
- `android/app/src/main/assets/vendor/azgaar/images/textures/soiled-paper-vertical.png`

is a functional optimized PNG (approximately 0.74 MB) rather than a byte-identical copy of the v1.9.19 archive. To preserve the original **losslessly**, its exact base64 payload is split into seven text files under `assets/originals/`. Run:

```bash
python scripts/restore_large_assets.py
```

Both original PNG copies will be reconstructed and verified against SHA-256:

`0b33f76defb984b16fbf2f14799a69d59433900e930c06cd59c57d00d203a6a5`

The restoration script uses only Python's standard library and does not require internet access or Android build tools. Other uploaded source files are unchanged from the v1.9.19 source archive.

## Security and build status

- Upload performed from the v1.9.19 reviewed ZIP, not APK artifacts.
- Common API-key and private-key signatures were scanned; no embedded project credentials were detected. Third-party minified Dropbox SDK contains strings that resemble secret assignments but are part of distributed library code.
- Android APK build and native tablet device tests remain unverified. The project is source-only.
- Preserve third-party licenses and notices in the vendor directories.
