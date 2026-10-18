# DoubleCheck Key (Bluetooth proximity companion)

The DoubleCheck Key is the user's personal authentication device: a phone that
broadcasts over Bluetooth LE and serves a secret device key. When the user signs
in, the login page (frontend/src/bluetooth.ts) scans for the key, connects, and
reads the secret. The backend checks it against `AUTH_DEVICE_KEY`. A match means
the phone is within Bluetooth range, so the log-in is approved without the
survey. Anything else falls back to the DoubleCheck survey.

```
 Computer / phone signing in              Personal device (DoubleCheck Key)
 ┌──────────────────────────┐   BLE scan  ┌──────────────────────────────┐
 │ Login page (Web Bluetooth)│ ──────────► │ Advertises service UUID      │
 │ reads key characteristic  │ ◄────────── │ serves AUTH_DEVICE_KEY       │
 └────────────┬─────────────┘             └──────────────────────────────┘
              │ POST /api/proximity/verify
              ▼
          Backend: key matches? → MFA code : survey fallback
```

Web pages can only scan for Bluetooth devices, not broadcast as one, so the key
has to be a native app on **both** Android and iOS. The login side is a normal
web page.

## Shared values

| | |
|---|---|
| Service UUID | `07285c8e-5a66-47f4-8e3b-a5b2d860a75c` |
| Key characteristic UUID | `4eb838d4-69c2-46a4-8201-dc0a34406332` (read, UTF-8 text) |
| Advertised name | `DoubleCheck Key` (anything starting with `DoubleCheck` works) |
| Key value | `AUTH_DEVICE_KEY` from `backend/.env` (and Render's env vars) |

## Option 1: iOS app (`ios/DoubleCheckKeyApp.swift`)

Needs a Mac with Xcode and a real iPhone (the simulator has no Bluetooth).

1. Xcode → New Project → iOS App, interface SwiftUI, name it DoubleCheckKey.
2. Replace the generated `DoubleCheckKeyApp.swift` with the one here and delete `ContentView.swift`.
3. Target → Info → add `NSBluetoothAlwaysUsageDescription`
   ("DoubleCheck uses Bluetooth to confirm you're near the device you're signing in on.").
4. Run it on your iPhone (a free Apple ID works under Signing & Capabilities).
5. Paste your `AUTH_DEVICE_KEY` and tap Start. Keep the app open while signing in.

## Option 2: no code, using a BLE testing app

### Android: nRF Connect for Mobile (Nordic Semiconductor, free)
1. Menu → **Configure GATT server** → add a service with the service UUID above,
   and a characteristic with the key UUID, property **Read**, initial value = your
   `AUTH_DEVICE_KEY` as text (UTF-8).
2. **Advertiser** tab → new advertising packet → add the service UUID and the
   device name → turn it on.

### iOS: LightBlue (Punch Through, free)
Create a virtual peripheral, give it the service and characteristic UUIDs above,
and set the characteristic's value to your `AUTH_DEVICE_KEY` (UTF-8). Keep
LightBlue in the foreground.

## Where the login page works

| Browser signing in | Works? |
|---|---|
| Chrome / Edge on Windows, macOS, Android, ChromeOS | Yes |
| Chrome on Linux | May need `chrome://flags/#enable-experimental-web-platform-features` |
| Safari, Firefox, any iPhone browser | No: falls back to the survey |
| Bluefy (iOS Web BLE browser) | Yes |

The page must be served over HTTPS (Render) or `localhost`.

## Prototype limits

- The key is a static secret: someone within Bluetooth range with a BLE scanner
  could read it. A real version would have the server issue a one-time challenge
  that the companion signs with a key stored in the phone's secure enclave.
- Chrome always shows a device chooser, and the user picks the key. Successfully
  connecting proves the key is within Bluetooth range (roughly 10–30 m); it
  doesn't measure distance.
