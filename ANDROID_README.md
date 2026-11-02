# KRA Transaction Network — Android Setup & Deployment Guide

KRA eTIMS VAT Buyer-Supplier Hub Network Visualization Extension & Interactive Android Sandbox.

This repository is fully configured for **Android phones and tablets** via two supported deployment modes:
1. **Installable Progressive Web App (PWA)** — instant zero-APK installation directly from Chrome on Android.
2. **Native Android WebView Wrapper (`./android`)** — a Kotlin + AndroidX WebView application module that compiles into an installable `.apk` / `.aab` bundle.

---

## Option 1: Install as an Android Progressive Web App (PWA)

The web frontend includes a Web App Manifest (`manifest.json`), offline-capable Service Worker (`sw.js`), `viewport-fit=cover` safe-area support, and Android touch-target ergonomics.

1. Start or deploy the application server and open the URL in **Google Chrome on Android**.
2. Tap the **Install App** banner or open the Chrome menu (`⋮`) and tap **Add to Home screen / Install app**.
3. The application launches in **standalone full-screen Android mode** with native status bar theming (`#0F172A`), touch-optimized controls, and offline shell caching.

---

## Option 2: Build the Native Android APK (`./android`)

The `./android` directory contains a self-contained Kotlin Android project (`com.sybyl.krahubnetwork`) targeting Android SDK 34 (minimum SDK 26 / Android 8.0+).

### Key Android Features
- **Full WebView Engine**: JavaScript ES2022+, `localStorage`, session cookies, and SSO token persistence.
- **Native File Picker**: Supports uploading PDFs, Word documents (`.docx`), Excel/CSV spreadsheets, and camera/gallery images on Android.
- **Native File Downloads**: Exports and generated reports download directly via Android `DownloadManager`.
- **Pull-to-Refresh & Predictive Back Gesture**: Swipe down to reload and swipe back to navigate history within the app.
- **Configurable Server Endpoint**: Defaults to `http://10.0.2.2:8080/demo/index.html` (Android Emulator host loopback `10.0.2.2` or production Cloud Run endpoint).

### Build Instructions (Android Studio or CLI)
1. Open **Android Studio** -> **Open** -> select the `kra-hub-network/android` folder.
2. Wait for Gradle Sync to finish.
3. Update `DEFAULT_PORTAL_URL` in `android/app/build.gradle.kts` if pointing to a custom Cloud Run or LAN server URL.
4. Click **Run 'app'** on an Android device/emulator, or build the debug APK from the terminal:

```bash
cd android
./gradlew assembleDebug
# Output APK: android/app/build/outputs/apk/debug/app-debug.apk
```
