# FerriDash mobile apps (Android and iOS)

Native apps for parents, learners, educators and school admins. FerriDash runs on each school's own
server, so the apps are a native shell ([Capacitor](https://capacitorjs.com) 8) around that server:

1. On first launch the app asks for the school's FerriDash address (for example `192.168.0.48:3100`,
   or `https://fees.myschool.co.za`), checks that FerriDash answers there, and remembers it.
2. After that it opens the school's sign-in page straight away. **Change school** on the sign-in page goes back
   to the address screen.
3. Everything else (dashboards, results, report cards, fee payments with Ozow) is the school's FerriDash,
   so the apps never need updating when FerriDash gets new features.

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
| `www/` | The app's own start screen ("Connect to your school") |
| `capacitor.config.json` | App ID, name, user agent (`FerriDashApp/1.0`), navigation and splash settings |
| `android/` | Android Studio project |
| `ios/` | Xcode project |
| `assets/` | Source images for icons and splash screens |

Native additions:

- **Printing / Save as PDF.** Web views can't run `window.print()`, so the apps add a print bridge:
  `MainActivity.java` (Android print service, A4 or A5) and `MainViewController` in `AppDelegate.swift`
  (iOS print sheet). FerriDash's **Download PDF** and **Print** buttons use it automatically inside the app.
- **Plain-http school servers** are allowed (`usesCleartextTraffic` on Android; `NSAllowsArbitraryLoadsInWebContent`
  and `NSAllowsLocalNetworking` on iOS), because most schools run FerriDash on their own network without HTTPS.

## Server requirements

- Phones must be able to reach the server: on the school Wi-Fi, or over the internet if the school publishes
  FerriDash at a public address.
- Over plain `http://`, start FerriDash with `INSECURE_COOKIES=1`, otherwise phones (and other computers) can't stay
  signed in. With HTTPS this isn't needed. For example, in PowerShell: `$env:INSECURE_COOKIES = '1'; .\start.bat`.

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

App Store review notes: explain that the app connects to the school's own FerriDash server on the school network
(hence the local-network permission and http support), and give the reviewer a test server address and a demo login.

## Updating the version

- Android: `versionCode` (whole number, +1 every release) and `versionName` in `android/app/build.gradle`.
- iOS: **Version** and **Build** on the App target's **General** tab in Xcode.

## Known limits

- **CSV exports** (broadsheets, promotion schedules, import logins) download in a desktop browser, not inside the
  apps. Use a computer for those admin tasks.
- The apps need the school's server to be reachable. Without the school Wi-Fi (or a public address) they show the
  "Can't reach your school" screen with the option to change the address.

Copyright © Infinite Q Graphics
