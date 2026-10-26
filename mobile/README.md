# FerriDash mobile apps (Android and iOS)

Native apps for parents, learners, educators and school admins. The apps are a native shell
([Capacitor](https://capacitorjs.com) 8) around the live FerriDash at **https://ferri-dash.vercel.app**:

1. On launch the app opens FerriDash's sign-in page. Without internet it shows "No internet connection"
   with **Try again** (it also retries by itself when the connection comes back).
2. Everything else (dashboards, results, report cards, fee payments with Ozow) is the live website,
   so the apps never need updating when FerriDash gets new features.
3. If the live address ever changes (for example to your own domain), change `LIVE` in `www/index.html`,
   run `npx cap sync`, and publish an app update.

| | |
|---|---|
| App name | FerriDash |
| App ID / bundle ID | `com.infiniteqgraphics.ferridash` |
| Android | minimum Android 7.0 (API 24), targets API 36 |
| iOS | minimum iOS 15 (Capacitor 8) |
| Icons and splash | Rising sun logo on charcoal, generated from `assets/` |

## What's in this folder

| Path | What it is |
|---|---|
| `www/` | The app's own start screen (opens the live site, or shows "No internet connection") |
| `capacitor.config.json` | App ID, name, user agent (`FerriDashApp/1.0`), navigation and splash settings |
| `android/` | Android Studio project |
| `ios/` | Xcode project |
| `assets/` | Source images for icons and splash screens |

Native additions:

- **Printing / Save as PDF.** Web views can't run `window.print()`, so the apps add a print bridge:
  `MainActivity.java` (Android print service, A4 or A5) and `MainViewController` in `AppDelegate.swift`
  (iOS print sheet). FerriDash's **Download PDF** and **Print** buttons use it automatically inside the app.
- **HTTPS only.** The apps load nothing over plain http.

## Building

Once, and after changing `www/` or `capacitor.config.json`:

```bash
cd mobile
npm install
npx cap sync
```

To regenerate icons and splash screens after changing `assets/`: `npm run assets`.

### Android (Windows, macOS or Linux)

Needs Android Studio (it includes the JDK and Android SDK).

- **Test build:** `cd android` then `gradlew assembleDebug` (Windows) or `./gradlew assembleDebug`.
  The APK is `android/app/build/outputs/apk/debug/app-debug.apk`; install it on a phone (allow
  "install unknown apps") or run `adb install app-debug.apk`.
- **Release for Google Play:** open the project with `npx cap open android`, then
  **Build → Generate Signed App Bundle / APK**, create or choose an upload key, and build an **Android App Bundle (.aab)**.
  Upload it in the Google Play Console. Keep the keystore and its passwords safe; you need them for every update.
- **Sideloading to a school's phones** (no Play Store): build a signed **APK** the same way and share the file.

### iOS (macOS only)

Needs a Mac with Xcode 16 or newer and an Apple Developer account (for devices and the App Store).

1. `npx cap open ios` opens `ios/App/App.xcodeproj` in Xcode. Swift packages resolve automatically.
2. Select the **App** target → **Signing & Capabilities** → choose your team. Change the bundle ID if
   `com.infiniteqgraphics.ferridash` is taken in your account.
3. Run on a simulator or a connected iPhone with ▶.
4. **Release:** **Product → Archive**, then **Distribute App** → App Store Connect (or TestFlight first).

App Store review notes: explain that the app is the mobile front end of the FerriDash website for schools, and give
the reviewer a test login on a school you set up for review.

## Updating the version

- Android: `versionCode` (whole number, +1 every release) and `versionName` in `android/app/build.gradle`.
- iOS: **Version** and **Build** on the App target's **General** tab in Xcode.

## Known limits

- **CSV exports** (broadsheets, promotion schedules, import logins) download in a desktop browser, not inside the
  apps. Use a computer for those admin tasks.
- The apps need an internet connection; without one they show "No internet connection" with **Try again**.

Copyright © Infinite Q Graphics
