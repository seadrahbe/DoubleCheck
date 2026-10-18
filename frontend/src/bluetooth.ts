// Bluetooth proximity check against the user's "DoubleCheck Key": a phone app
// acting as a BLE peripheral. Browsers can only scan and connect (they can't
// advertise), so this page is the scanner and the key must be a native app.
//
// Two ways the key proves it's nearby:
//   - Broadcast (DoubleCheck Key app): its Bluetooth name is "DC-<8-digit code>",
//     a code that rotates every 30 s. Read straight from the device list, so the
//     page never connects and nothing can trigger a pairing prompt.
//   - Connect and read (LightBlue / nRF Connect): read the key characteristic.
//
// These values must match companion/ios/DoubleCheckKey and companion/README.md.
export const KEY_SERVICE_UUID = '07285c8e-5a66-47f4-8e3b-a5b2d860a75c'
export const KEY_CHARACTERISTIC_UUID = '4eb838d4-69c2-46a4-8201-dc0a34406332'
const KEY_NAME_PREFIX = 'DoubleCheck'
const CODE_NAME_PREFIX = 'DC-'
const CODE_NAME = /^DC-(\d{8})$/
const CONNECT_TIMEOUT_MS = 10_000
// Phones sometimes drop a fresh connection (e.g. when the OS's own background
// reads on connect get refused), so reconnect and retry the read a few times.
const READ_ATTEMPTS = 3
const RETRY_DELAY_MS = 500

export type ProximityFailure = 'unsupported' | 'cancelled' | 'needs-pairing' | 'failed'

export type ProximityResult =
  // proof: a rotating code or the static device key, checked by the backend.
  | { ok: true; proof: string; deviceName: string; method: 'broadcast' | 'connection' }
  | { ok: false; reason: ProximityFailure; message: string }

const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)

// Returns a message explaining why this browser can't do the check, or null if it can.
export function bluetoothUnsupportedReason(): string | null {
  if (!window.isSecureContext) return 'Bluetooth needs HTTPS (or localhost).'
  if (navigator.bluetooth) return null
  const ua = navigator.userAgent
  if (isIOS()) return 'Safari and other iPhone browsers block Bluetooth. Open this page in the Bluefy browser app instead.'
  if (/Linux/.test(ua) && !/Android/.test(ua) && /Chrome\//.test(ua)) {
    return 'Chrome on Linux needs chrome://flags/#enable-experimental-web-platform-features turned on.'
  }
  return 'This browser has no Web Bluetooth. Use Chrome or Edge.'
}

// Connects (or reconnects) and reads the key. Returns null if the device has no
// key service; throws on connection/read errors so the caller can retry.
async function readKey(device: BluetoothDevice): Promise<string | null> {
  const gatt = device.gatt!
  const server = gatt.connected ? gatt : await withTimeout(gatt.connect(), CONNECT_TIMEOUT_MS, 'Timed out connecting to your key.')
  let service: BluetoothRemoteGATTService
  try {
    service = await server.getPrimaryService(KEY_SERVICE_UUID)
  } catch (err) {
    if (!gatt.connected) throw err // dropped mid-lookup: retryable, not "no service"
    return null
  }
  // Only ever touch our own read-only characteristic: no notifications, no
  // writes, nothing that would make the phone ask to pair.
  const characteristic = await service.getCharacteristic(KEY_CHARACTERISTIC_UUID)
  const value = await characteristic.readValue()
  return new TextDecoder().decode(value).trim()
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))])
}

// GATT errors that mean the key demanded pairing (its characteristic requires
// encryption). Pairing a phone this way is what crashes Chrome on Linux, so we
// stop instead of retrying.
const PAIRING_ERROR = /authenticat|encrypt|insufficient|pair|bond|security/i

// Must be called straight from a click handler: browsers only allow the device
// chooser in response to a user gesture.
//
// showAllDevices lists every nearby Bluetooth device instead of filtering for
// the key: iPhones often leave app services out of their broadcast and show up
// as just "iPhone", so the filtered list can come up empty. Picking a device
// that isn't the key is harmless: the read below fails and so does the check.
//
// Never pairs: Web Bluetooth only pairs if the key requires encryption, and the
// key must expose its characteristic as plain Read (see companion/README.md).
export async function checkProximity({ showAllDevices = false } = {}): Promise<ProximityResult> {
  const unsupported = bluetoothUnsupportedReason()
  if (unsupported) return { ok: false, reason: 'unsupported', message: unsupported }

  let device: BluetoothDevice
  try {
    device = await navigator.bluetooth.requestDevice(
      showAllDevices
        ? { acceptAllDevices: true, optionalServices: [KEY_SERVICE_UUID] }
        : {
            // Match on the service UUID, or on the name in case the app only
            // advertises its name (e.g. iOS apps in the background).
            filters: [{ services: [KEY_SERVICE_UUID] }, { namePrefix: CODE_NAME_PREFIX }, { namePrefix: KEY_NAME_PREFIX }],
            optionalServices: [KEY_SERVICE_UUID],
          },
    )
  } catch (err) {
    // NotFoundError: the chooser was closed without picking a device, usually
    // because no key showed up in it.
    if (err instanceof DOMException && err.name === 'NotFoundError') {
      return { ok: false, reason: 'cancelled', message: 'No DoubleCheck Key was selected.' }
    }
    return { ok: false, reason: 'failed', message: (err as Error).message }
  }

  // Broadcast proof: the code is right there in the name. No connection at all.
  const broadcast = device.name?.match(CODE_NAME)
  if (broadcast) return { ok: true, proof: broadcast[1], deviceName: 'DoubleCheck Key', method: 'broadcast' }

  try {
    for (let attempt = 1; ; attempt++) {
      try {
        const proof = await readKey(device)
        if (proof === null) {
          const name = device.name ?? 'That device'
          return { ok: false, reason: 'failed', message: `${name} isn't running a DoubleCheck Key (no key service found).` }
        }
        return { ok: true, proof, deviceName: device.name ?? 'DoubleCheck Key', method: 'connection' }
      } catch (err) {
        const message = (err as Error).message
        if (PAIRING_ERROR.test(message)) {
          return {
            ok: false,
            reason: 'needs-pairing',
            message:
              'Your key asked to pair, so we stopped. Set the key characteristic to plain Read (no encryption) and decline any pairing prompt.',
          }
        }
        const dropped = !device.gatt?.connected || /disconnect|NetworkError/i.test(message)
        if (!dropped || attempt >= READ_ATTEMPTS) {
          const hint = dropped ? ' The connection kept dropping: keep the key app open and the phone unlocked.' : ''
          return { ok: false, reason: 'failed', message: `Couldn't read your key: ${message}${hint}` }
        }
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
      }
    }
  } finally {
    device.gatt?.disconnect()
  }
}
