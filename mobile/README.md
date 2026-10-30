# FerriDash mobile apps (Android and iOS)

Native apps for parents, learners, educators and school admins. The apps are a native shell
([Capacitor](https://capacitorjs.com) 8) around the live FerriDash at **https://ferridash.autogration.co.za**:

1. On launch the app opens FerriDash's sign-in page. Without internet it shows "No internet connection"
   with **Try again** (it also retries by itself when the connection comes back).
2. Everything else (dashboards, results, report cards, assignments, timetables and messages) is the live website,
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
| `capacitor.config.json` | App ID, name, user agent (`FerriDashApp/1.0`), navigation, splash and notification settings |
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

## Push notifications

FerriDash sends phone notifications for:

- new notices (to the notice's audience)
- new messages (the text itself is not shown on the lock screen)
- published results (learners and their parents)
- new assignments and extra classes (learners and their parents)
- mentions and study groups (the people concerned)
- a learner first marked absent on a day (parents)

Tapping a notification opens the matching page.

**How it works**
- On first launch the app explains what notifications are for, then the phone asks Allow / Don't allow.
- If notifications are off, each launch shows a reminder with **Open settings** and
  **Continue without notifications**. App stores don't allow apps that refuse to work without notifications,
  so the app still opens.
- The start screen passes the phone's push token to FerriDash. FerriDash links it to whoever signs in on
  that phone, and unlinks it on sign-out.
- Sending is done by the website (`lib/push.ts`): Android through Firebase Cloud Messaging, iPhone straight
  through Apple. Until the keys below are set, nothing is sent and the apps work as before.

### One-time setup: Firebase (Android)

1. Go to https://console.firebase.google.com and click **Create a project**. Name it FerriDash; Google
   Analytics isn't needed.
2. **Add app → Android**. Package name: `com.infiniteqgraphics.ferridash`. Download `google-services.json` and
   put it in `mobile/android/app/`. Don't commit it.
3. **Project settings → Service accounts → Generate new private key**. This downloads a JSON file. Keep it secret.
4. In Vercel (ferri-dash → Settings → Environment Variables), add `FIREBASE_SERVICE_ACCOUNT` with the
   **whole contents** of that JSON file as the value. Then redeploy.
5. Rebuild the Android app (see Building). The new build asks for notification permission.

### One-time setup: Apple (iPhone)

1. At https://developer.apple.com/account go to **Certificates, IDs & Profiles → Keys → +**. Tick
   **Apple Push Notifications service (APNs)**, then download the `.p8` key. Apple only lets you download it once.
2. Note the **Key ID** (shown with the key) and your **Team ID** (top right of the developer site).
3. In Vercel add `APNS_KEY` (the whole contents of the .p8 file, including the BEGIN/END lines), `APNS_KEY_ID`
   and `APNS_TEAM_ID`. Then redeploy.
4. The Xcode project already has the Push Notifications capability (`App/App.entitlements`). Make sure the
   App ID `com.infiniteqgraphics.ferridash` has Push Notifications enabled under Identifiers.
5. Builds run from Xcode on your own phone use Apple's test servers: set `APNS_SANDBOX=1` in Vercel while
   testing them, and remove it for TestFlight and App Store builds.

## Updating the version

- Android: `versionCode` (whole number, +1 every release) and `versionName` in `android/app/build.gradle`.
- iOS: **Version** and **Build** on the App target's **General** tab in Xcode.

## Known limits

- **CSV exports** (broadsheets, promotion schedules, import logins) download in a desktop browser, not inside the
  apps. Use a computer for those admin tasks.
- The apps need an internet connection; without one they show "No internet connection" with **Try again**.

Copyright © Infinite Q Graphics
