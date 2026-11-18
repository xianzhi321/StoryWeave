# Native 2.0.0 release staging (incomplete)

This review branch intentionally **does not claim that the supplied 2.0.0-native.1 source ZIP or 18.76 MB Debug APK has been uploaded**.

## Purpose

- Harden the existing native Android manifest against globally enabled cleartext HTTP; allow only loopback `localhost` and `127.0.0.1` for local model services.
- Exclude the `storyweave_ai_keys.xml` EncryptedSharedPreferences file from legacy Auto Backup, modern cloud backup and device-to-device transfer. Other default data backup remains enabled.
- Add a standard-library-only static check: `python android-native/verify-security-config.py`.

## Required before a release or merge

The repository's existing `android-native/` tree is an **older 2.0.0-p0 snapshot**. The user supplied a later `2.0.0-native.1` source ZIP, with additional Kotlin files, resources, Gradle wrapper, database schema, docs and tests. Those files are **not yet synchronized in this branch**. Do not merge this branch as a complete 2.0 release or tag it as such.

The supplied original APK predates these source-only fixes. **It does not contain the new network/backup rules.** Rebuild from fully synchronized source with SDK 34/JDK 17, rerun JVM tests and Lint, rebuild instrumentation tests, verify signing and hashes, then test real devices before releasing.

Original supplied artifact SHA-256:
- APK: `419604726ee8b3ca8d201413a156bd16aaba44418053b8e84f49c7f54e215f6c`
- Source ZIP: `f430fe451a554beb5eee6e5eeb1e6830b0c62b8ee556d8a5c5775b0bcb26c422`

No release assets or official release have been published by this branch.
