// Real Web Bluetooth pairing for the web login: scans for the user's DoubleCheck
// Key (the phone app broadcasting over BLE) and reads its proof — the rotating
// 8-digit code from the advertised name "DC-<code>", or the characteristic value.
// The backend checks the proof against AUTH_DEVICE_KEY, which only works when the
// phone is actually within Bluetooth range.
//
// These values must match the companion app (companion/ios/DoubleCheckKey).
export const KEY_SERVICE_UUID = '07285c8e-5a66-47f4-8e3b-a5b2d860a75c'
export const KEY_CHARACTERISTIC_UUID = '4eb838d4-69c2-46a4-8201-dc0a34406332'
const CODE_NAME = /^DC-(\d{8})$/
const CONNECT_TIMEOUT_MS = 10_000

export type PairFailure = 'unsupported' | 'cancelled' | 'failed'
export type PairResult = { ok: true; proof: string } | { ok: false; reason: PairFailure; message: string }

const isIOS = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)

// Null if this browser can do Web Bluetooth; otherwise a reason it can't.
export function bluetoothUnsupportedReason(): string | null {
  if (!window.isSecureContext) return 'Bluetooth needs HTTPS (or localhost).'
  if (navigator.bluetooth) return null
  if (isIOS()) return 'Safari and other iPhone browsers block Bluetooth. Open this page in the Bluefy browser app.'
  if (/Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent)) {
    return 'Chrome on Linux needs chrome://flags/#enable-experimental-web-platform-features turned on.'
  }
  return 'This browser has no Web Bluetooth. Use Chrome or Edge.'
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms))])
}

// Must be called straight from a click handler — the chooser needs the gesture.
export async function pairWithPhone(): Promise<PairResult> {
  const unsupported = bluetoothUnsupportedReason()
  if (unsupported) return { ok: false, reason: 'unsupported', message: unsupported }

  let device: BluetoothDevice
  try {
    device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [KEY_SERVICE_UUID] }, { namePrefix: 'DC-' }, { namePrefix: 'DoubleCheck' }],
      optionalServices: [KEY_SERVICE_UUID],
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'NotFoundError') {
      return { ok: false, reason: 'cancelled', message: 'No DoubleCheck Key was selected.' }
    }
    return { ok: false, reason: 'failed', message: (err as Error).message }
  }

  // Broadcast proof: the rotating code is right there in the name — no connection.
  const broadcast = device.name?.match(CODE_NAME)
  if (broadcast) return { ok: true, proof: broadcast[1] }

  // Otherwise connect and read the characteristic.
  try {
    const server = await withTimeout(device.gatt!.connect(), CONNECT_TIMEOUT_MS, 'Timed out connecting to your key.')
    const service = await server.getPrimaryService(KEY_SERVICE_UUID)
    const characteristic = await service.getCharacteristic(KEY_CHARACTERISTIC_UUID)
    const value = await characteristic.readValue()
    return { ok: true, proof: new TextDecoder().decode(value).trim() }
  } catch (err) {
    const name = device.name ?? 'That device'
    return { ok: false, reason: 'failed', message: `Couldn't read ${name}: ${(err as Error).message}` }
  } finally {
    device.gatt?.disconnect()
  }
}
