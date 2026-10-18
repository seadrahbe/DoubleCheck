// Bluetooth proximity check against the user's "DoubleCheck Key": a phone app
// (companion/ios, or nRF Connect / LightBlue) acting as a BLE peripheral that
// serves a secret device key. Browsers can only scan and connect (they can't
// advertise), so this page is the scanner and the key must be a native app.
//
// These UUIDs must match companion/ios/DoubleCheckKeyApp.swift and companion/README.md.
export const KEY_SERVICE_UUID = '07285c8e-5a66-47f4-8e3b-a5b2d860a75c'
export const KEY_CHARACTERISTIC_UUID = '4eb838d4-69c2-46a4-8201-dc0a34406332'
const KEY_NAME_PREFIX = 'DoubleCheck'
const CONNECT_TIMEOUT_MS = 10_000

export type ProximityFailure = 'unsupported' | 'cancelled' | 'failed'

export type ProximityResult =
  | { ok: true; deviceKey: string; deviceName: string }
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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))])
}

// Must be called straight from a click handler: browsers only allow the device
// chooser in response to a user gesture.
export async function checkProximity(): Promise<ProximityResult> {
  const unsupported = bluetoothUnsupportedReason()
  if (unsupported) return { ok: false, reason: 'unsupported', message: unsupported }

  let device: BluetoothDevice
  try {
    device = await navigator.bluetooth.requestDevice({
      // Match on the service UUID, or on the name in case the app only advertises
      // its name (e.g. iOS apps in the background).
      filters: [{ services: [KEY_SERVICE_UUID] }, { namePrefix: KEY_NAME_PREFIX }],
      optionalServices: [KEY_SERVICE_UUID],
    })
  } catch (err) {
    // NotFoundError: the chooser was closed without picking a device, usually
    // because no key was in range.
    if (err instanceof DOMException && err.name === 'NotFoundError') {
      return { ok: false, reason: 'cancelled', message: 'No DoubleCheck Key was selected.' }
    }
    return { ok: false, reason: 'failed', message: (err as Error).message }
  }

  try {
    const server = await withTimeout(device.gatt!.connect(), CONNECT_TIMEOUT_MS, 'Timed out connecting to your key.')
    const service = await server.getPrimaryService(KEY_SERVICE_UUID)
    const characteristic = await service.getCharacteristic(KEY_CHARACTERISTIC_UUID)
    const value = await characteristic.readValue()
    const deviceKey = new TextDecoder().decode(value).trim()
    return { ok: true, deviceKey, deviceName: device.name ?? 'DoubleCheck Key' }
  } catch (err) {
    return { ok: false, reason: 'failed', message: `Couldn't read your key: ${(err as Error).message}` }
  } finally {
    device.gatt?.disconnect()
  }
}
