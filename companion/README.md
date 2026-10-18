# DoubleCheck Key (Bluetooth proximity companion)

The DoubleCheck Key is the user's personal authentication device: a phone app
that broadcasts over Bluetooth LE. When the user signs in, the login page
(frontend/src/bluetooth.ts) looks for the key in Chrome's Bluetooth device list
and gets a proof from it. The backend checks the proof. A match means the phone
is within Bluetooth range, so the user is signed in without the survey.
Anything else falls back to the DoubleCheck survey.

```
 Computer / phone signing in                 Personal device (DoubleCheck Key)
 ┌───────────────────────────┐  BLE scan    ┌────────────────────────────────┐
 │ Login page (Web Bluetooth) │ ◄─────────── │ Broadcasts name "DC-12345678"  │
 │ reads the code from the    │  (no         │ (code rotates every 30 s,      │
 │ device list                │  connection) │  derived from AUTH_DEVICE_KEY) │
 └─────────────┬─────────────┘              └────────────────────────────────┘
               │ POST /api/proximity/verify { proof }
               ▼
     Backend: valid, unused code? → signed in : survey fallback
```

Two kinds of key:

| Key | Proof | Connects? |
|---|---|---|
| **DoubleCheck Key app** (`ios/DoubleCheckKey`) | Rotating 8-digit code in its Bluetooth name | **No**: so no pairing prompts on any computer |
| **LightBlue / nRF Connect** (no code) | Static `AUTH_DEVICE_KEY` in a characteristic | Yes: on Linux, an iPhone key can trigger pairing prompts |

Web pages can only scan for Bluetooth devices, not broadcast as one, so the key
has to be a native app. The login side is a normal web page.

## Shared values

| | |
|---|---|
| Service UUID | `07285c8e-5a66-47f4-8e3b-a5b2d860a75c` |
| Key characteristic UUID | `4eb838d4-69c2-46a4-8201-dc0a34406332` (read, UTF-8 text) |
| Advertised name | App: `DC-<8-digit code>`. Others: anything starting with `DoubleCheck` |
| Rotating code | TOTP (RFC 6238), HMAC-SHA256 keyed with `AUTH_DEVICE_KEY` (UTF-8), 30 s steps, 8 digits |
| Key value | `AUTH_DEVICE_KEY` from `backend/.env` (and Render's env vars) |

## No pairing

The check never pairs, and the key must not ask it to. Pairing the phone with
the computer (in system Bluetooth settings, or by accepting a prompt) breaks the
check: the computer reuses the paired audio connection, which doesn't carry app
services, and on Linux it can crash Chrome.

- Set the key characteristic's permission to plain **Read**, not "encrypted" or
  "authenticated". Those make the phone demand pairing before the read.
- Decline any pairing prompt on either device.
- If the phone was paired before, forget it on both sides (`bluetoothctl remove <address>` on Linux).
- If a pairing requirement shows up anyway, the login page stops and says so instead of pairing.

## Option 1: iOS app, built and installed from Linux with xtool

[xtool](https://github.com/xtool-org/xtool) builds iOS apps on Linux and installs
them on an iPhone over USB, signed with your Apple ID. A free Apple ID works; the
app then stops opening after **7 days** and you re-run `xtool dev` to renew it.

### One-time setup (about an hour, mostly downloads)

1. **Swift 6.4 toolchain:** follow <https://swift.org/install/linux>, then check
   `swift --version` says 6.4.
2. **usbmuxd** (talks to the iPhone over USB): `sudo apt-get install usbmuxd libimobiledevice-utils`
3. **Xcode 27 download** (for the iOS SDK; you don't run Xcode): in your browser, sign in at
   <https://developer.apple.com/download/all/?q=Xcode> with your Apple ID and download
   `Xcode_27.xip` (about 3 GB+).
4. **xtool:**
   ```bash
   curl -fL "https://github.com/xtool-org/xtool/releases/latest/download/xtool-$(uname -m).AppImage" -o xtool
   chmod +x xtool && sudo mv xtool /usr/local/bin/
   xtool --help
   ```
5. **`xtool setup`:**
   - Login mode: choose **1: Password** (works with any Apple ID). It uses
     private Apple APIs; xtool's docs suggest a throwaway Apple ID to be cautious.
   - Enter your Apple ID email, password and 2FA code.
   - When asked for `Path to Xcode.xip`, enter where you saved it (e.g. `~/Downloads/Xcode_27.xip`).
   - Check: `swift sdk list` should show `darwin`.

### Install on your iPhone

1. Plug the iPhone into the laptop with a USB cable and unlock it.
2. Build and install:
   ```bash
   cd companion/ios/DoubleCheckKey
   xtool dev
   ```
   The first build takes several minutes.
3. **Trust this computer** on the iPhone if asked, enter your passcode, and
   re-run `xtool dev` if it errors right after.
4. **Developer Mode:** if xtool says it's required, go to iPhone **Settings →
   Privacy & Security → Developer Mode** (it appears after this first attempt),
   turn it on, let the phone restart, confirm, then re-run `xtool dev`.
5. If xtool says the bundle ID is taken, change `bundleID` in `xtool.yml` to
   something unique (e.g. `com.yourname.DoubleCheckKey`) and re-run.
6. Open **DoubleCheck Key** on the phone. If iOS says "Untrusted Developer", go
   to **Settings → General → VPN & Device Management → [your Apple ID] → Trust**.
7. Allow Bluetooth when asked. Then tap the gear (**Settings**) once and paste
   your `AUTH_DEVICE_KEY` (the value in Render's backend environment if you're
   signing in on the deployed site). This is a one-time setup; the main screen
   then just shows "Ready to sign in."

The app is themed as a fictional bank ("Northwind Bank"), standing in for a real
institution's banking app. Change `bankName` in `ContentView.swift` and
`BANK_NAME` in `frontend/src/brand.ts` to re-skin it.

### Sign in

The intended flow: on the login page the user enters their email and is told to
**open their banking app**. Opening the app starts the Bluetooth broadcast on its
own, with no code to read or type. Back in the browser they click **Continue**
and pick **DC-…** in Chrome's device list, and they're signed in.

Keep the app open with the screen on while signing in. The page reads the
rotating code from the device name and never connects, so no pairing prompt
appears. (Chrome's one-time device picker is a browser privacy requirement that a
web page can't skip; a fully background check would need a native app on the
computer too.)

### Troubleshooting

| Symptom | Fix |
|---|---|
| "code didn't match" | Phone and computer clocks must be set automatically (codes are time-based). Make sure the app and backend use the same `AUTH_DEVICE_KEY`. |
| "That code was just used" | Each code works once. Wait for the next one (≤ 30 s). |
| The list shows "iPhone" instead of DC-… | The app isn't in the foreground, or Chrome is showing an old name: close the list, wait a few seconds, try again. |
| The app won't open after a week | Free Apple ID signing expired: re-run `xtool dev`. |

## Option 2: no code, using a BLE testing app

### Android: nRF Connect for Mobile (Nordic Semiconductor, free)
1. Menu → **Configure GATT server** → add a service with the service UUID above,
   and a characteristic with the key UUID, property **Read**, permission **Read**
   (not encrypted), initial value = your `AUTH_DEVICE_KEY` as text (UTF-8).
2. **Advertiser** tab → new advertising packet → add the service UUID and the
   device name → turn it on.

### iOS: LightBlue (Punch Through, free)
Create a virtual peripheral, give it the service and characteristic UUIDs above,
make the characteristic **Read** only (no encryption), and set its value to your
`AUTH_DEVICE_KEY` in UTF-8/text format, not Hex. Keep LightBlue in the foreground.

The phone usually shows up in Chrome as just "iPhone". If the device list is
empty, use **Show all nearby devices** on the login page and pick your phone.

## Where the login page works

| Browser signing in | Works? |
|---|---|
| Chrome / Edge on Windows, macOS, Android, ChromeOS | Yes |
| Chrome on Linux | May need `chrome://flags/#enable-experimental-web-platform-features` |
| Safari, Firefox, any iPhone browser | No: falls back to the survey |
| Bluefy (iOS Web BLE browser) | Yes |

The page must be served over HTTPS (Render) or `localhost`.

## Prototype limits

- With the app, the broadcast code changes every 30 s and works once, so a
  passer-by can't reuse it later. Someone near the phone could still relay a
  fresh code to a remote computer within its lifetime (a relay attack): stopping
  that needs distance measurement (Bluetooth Channel Sounding or UWB).
- LightBlue / nRF Connect keys serve the static secret, which anyone within
  Bluetooth range could read.
- `AUTH_DEVICE_KEY` is shared between the backend and the app. A real version
  would provision a per-device key stored in the phone's Secure Enclave.
- Chrome always shows a device chooser, and the user picks the key. Successfully
  connecting proves the key is within Bluetooth range (roughly 10–30 m); it
  doesn't measure distance.
