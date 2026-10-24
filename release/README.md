# Athena Release Artifacts 📦

This directory contains build configurations, release metadata, and installer packages for the **Athena Exam Proctor** desktop application.

---

## 1. Release Information

- **Product Name**: Athena Exam Proctor
- **Application Version**: 1.0.0
- **Target OS**: macOS (Apple Silicon `arm64`)
- **Package Format**: Apple Disk Image (`.dmg`) & macOS App Bundle (`.app`)

### Build Manifest

| Package Name | Architecture | File Size | SHA-256 Checksum |
| :--- | :--- | :--- | :--- |
| `Athena-1.0.0-arm64.dmg` | Apple Silicon (`arm64`) | ~130.1 MB | `663e8337f7e7dae705849f94c1ee067e71588303022f4f97380e3324471c22bd` |
| `Athena.app` | Apple Silicon (`arm64`) | Application | Built in `release/mac-arm64/` |

> **Note on GitHub File Limits**: GitHub enforces a strict **100 MB per-file limit** on git repository pushes (`remote: error: File exceeds GitHub's file size limit of 100.00 MB`). Binary `.dmg` installers exceed this threshold and are therefore distributed via [GitHub Releases](https://github.com/OmvedNagre/athena/releases) or generated locally.

---

## 2. Generating the DMG Locally

You can generate the fresh `.dmg` installer directly on your Mac at any time with a single command:

```bash
# 1. Ensure dependencies are installed
npm install

# 2. Build production Vite bundle and compile macOS DMG
npm run dist:mac
```

The output installer `Athena-1.0.0-arm64.dmg` will be placed in this `release/` directory.

---

## 3. Installation Instructions

1. Double-click `Athena-1.0.0-arm64.dmg` in Finder to mount the disk image.
2. Drag **Athena** into your macOS **Applications** folder.
3. Launch Athena from Applications or Spotlight.
4. When prompted, grant **Camera** access for proctoring verification and grant **Fullscreen** permissions for kiosk lockdown.
