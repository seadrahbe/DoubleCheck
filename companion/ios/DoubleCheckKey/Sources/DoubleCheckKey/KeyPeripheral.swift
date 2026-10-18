import CoreBluetooth
import Foundation

// Must match frontend/src/bluetooth.ts
let keyServiceUUID = CBUUID(string: "07285C8E-5A66-47F4-8E3B-A5B2D860A75C")
let keyCharacteristicUUID = CBUUID(string: "4EB838D4-69C2-46A4-8201-DC0A34406332")

// Broadcasts the rotating proximity code as the Bluetooth name ("DC-12345678").
// The login page reads it from Chrome's device list without connecting, so
// nothing triggers a pairing prompt. The characteristic serves the same code
// (never the secret) for browsers that do connect.
final class KeyPeripheral: NSObject, ObservableObject, CBPeripheralManagerDelegate {
    @Published var status = "Starting Bluetooth…"
    @Published var isBroadcasting = false
    @Published var code = ""
    @Published var secondsLeft = 0
    // The AUTH_DEVICE_KEY from backend/.env (or Render's environment).
    @Published var secret: String {
        didSet {
            UserDefaults.standard.set(secret, forKey: "deviceKey")
            currentStep = nil
            refresh()
        }
    }

    private var manager: CBPeripheralManager!
    private var serviceAdded = false
    private var currentStep: UInt64?
    private var timer: Timer?

    override init() {
        _secret = Published(initialValue: UserDefaults.standard.string(forKey: "deviceKey") ?? "")
        super.init()
        manager = CBPeripheralManager(delegate: self, queue: nil)
        timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.refresh()
        }
    }

    // Runs every second: updates the countdown and, at each new 30 s step,
    // restarts advertising under the new code's name.
    private func refresh() {
        secondsLeft = ProximityCode.secondsLeft()
        let secret = self.secret.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !secret.isEmpty else {
            code = ""
            stopBroadcasting(status: "Paste your device key to start.")
            return
        }
        let step = ProximityCode.step()
        guard step != currentStep else { return }
        currentStep = step
        code = ProximityCode.code(secret: secret, step: step)
        startBroadcasting()
    }

    private func startBroadcasting() {
        guard manager.state == .poweredOn, !code.isEmpty else { return }
        if !serviceAdded {
            // Plain .readable on purpose: .readEncryptionRequired would make iOS
            // demand pairing. value: nil means reads go through didReceiveRead.
            let characteristic = CBMutableCharacteristic(
                type: keyCharacteristicUUID, properties: [.read], value: nil, permissions: [.readable])
            let service = CBMutableService(type: keyServiceUUID, primary: true)
            service.characteristics = [characteristic]
            manager.add(service)
            serviceAdded = true
        }
        manager.stopAdvertising()
        manager.startAdvertising([
            CBAdvertisementDataLocalNameKey: "DC-\(code)",
            CBAdvertisementDataServiceUUIDsKey: [keyServiceUUID],
        ])
    }

    private func stopBroadcasting(status: String) {
        if isBroadcasting { manager.stopAdvertising() }
        isBroadcasting = false
        self.status = status
    }

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        switch peripheral.state {
        case .poweredOn:
            currentStep = nil // force a fresh broadcast
            refresh()
        case .unauthorized:
            stopBroadcasting(status: "Allow Bluetooth for DoubleCheck Key in Settings.")
        case .poweredOff:
            stopBroadcasting(status: "Turn on Bluetooth.")
        default:
            stopBroadcasting(status: "Bluetooth is unavailable on this device.")
        }
        if peripheral.state != .poweredOn { serviceAdded = false }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
        if let error {
            serviceAdded = false
            stopBroadcasting(status: "Couldn't set up the key: \(error.localizedDescription)")
        }
    }

    func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
        if let error {
            stopBroadcasting(status: "Couldn't start broadcasting: \(error.localizedDescription)")
        } else {
            isBroadcasting = true
            status = "Broadcasting. Keep this app open near the computer you're signing in on."
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
        let data = Data(code.utf8)
        guard request.offset <= data.count else {
            peripheral.respond(to: request, withResult: .invalidOffset)
            return
        }
        request.value = data.subdata(in: request.offset..<data.count)
        peripheral.respond(to: request, withResult: .success)
    }
}
