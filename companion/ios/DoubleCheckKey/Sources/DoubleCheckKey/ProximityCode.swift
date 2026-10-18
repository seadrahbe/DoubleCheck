import CryptoKit
import Foundation

// Rotating proximity code (TOTP, RFC 6238, HMAC-SHA256), broadcast in the
// Bluetooth name as "DC-<code>". Must match backend/src/proximityCode.ts.
enum ProximityCode {
    static let period: TimeInterval = 30
    static let digits = 8

    static func step(at date: Date = Date()) -> UInt64 {
        UInt64(floor(date.timeIntervalSince1970 / period))
    }

    static func code(secret: String, step: UInt64) -> String {
        let counter = withUnsafeBytes(of: step.bigEndian) { Data($0) }
        let key = SymmetricKey(data: Data(secret.utf8))
        let mac = Array(HMAC<SHA256>.authenticationCode(for: counter, using: key))
        let offset = Int(mac[mac.count - 1] & 0x0f)
        let binary = (UInt32(mac[offset] & 0x7f) << 24)
            | (UInt32(mac[offset + 1]) << 16)
            | (UInt32(mac[offset + 2]) << 8)
            | UInt32(mac[offset + 3])
        let value = String(binary % 100_000_000)
        return String(repeating: "0", count: digits - value.count) + value
    }

    static func secondsLeft(at date: Date = Date()) -> Int {
        let elapsed = date.timeIntervalSince1970.truncatingRemainder(dividingBy: period)
        return Int(ceil(period - elapsed))
    }
}
