// DoubleCheck Key: turns an iPhone into the user's personal authentication device.
// It advertises over Bluetooth LE and serves the device key to the DoubleCheck
// login page, which proves the phone is within Bluetooth range of the computer.
//
// Setup: Xcode > New Project > iOS App (SwiftUI), replace the generated App file
// with this one, and add to Info.plist:
//   NSBluetoothAlwaysUsageDescription = "DoubleCheck uses Bluetooth to confirm you're near the device you're signing in on."
// Keep the app in the foreground while signing in: iOS strips the advertised
// name and service from backgrounded apps.

import CoreBluetooth
import SwiftUI

// Must match frontend/src/bluetooth.ts
let keyServiceUUID = CBUUID(string: "07285C8E-5A66-47F4-8E3B-A5B2D860A75C")
let keyCharacteristicUUID = CBUUID(string: "4EB838D4-69C2-46A4-8201-DC0A34406332")

@main
struct DoubleCheckKeyApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

final class KeyPeripheral: NSObject, ObservableObject, CBPeripheralManagerDelegate {
    @Published var status = "Starting Bluetooth…"
    @Published var isAdvertising = false
    // The AUTH_DEVICE_KEY from backend/.env.
    @Published var deviceKey: String {
        didSet { UserDefaults.standard.set(deviceKey, forKey: "deviceKey") }
    }

    private var manager: CBPeripheralManager!

    override init() {
        _deviceKey = Published(initialValue: UserDefaults.standard.string(forKey: "deviceKey") ?? "")
        super.init()
        manager = CBPeripheralManager(delegate: self, queue: nil)
    }

    func start() {
        guard manager.state == .poweredOn, !deviceKey.isEmpty else { return }
        manager.stopAdvertising()
        manager.removeAllServices()
        // value: nil means reads go through didReceiveRead, so key edits apply immediately.
        let characteristic = CBMutableCharacteristic(
            type: keyCharacteristicUUID, properties: [.read], value: nil, permissions: [.readable])
        let service = CBMutableService(type: keyServiceUUID, primary: true)
        service.characteristics = [characteristic]
        manager.add(service)
    }

    func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        isAdvertising = false
        switch peripheral.state {
        case .poweredOn:
            status = deviceKey.isEmpty ? "Enter your device key to start." : "Bluetooth ready."
            start()
        case .unauthorized: status = "Allow Bluetooth for DoubleCheck Key in Settings."
        case .poweredOff: status = "Turn on Bluetooth."
        default: status = "Bluetooth is unavailable on this device."
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didAdd service: CBService, error: Error?) {
        if let error {
            status = "Couldn't set up the key: \(error.localizedDescription)"
            return
        }
        peripheral.startAdvertising([
            CBAdvertisementDataLocalNameKey: "DoubleCheck Key",
            CBAdvertisementDataServiceUUIDsKey: [keyServiceUUID],
        ])
    }

    func peripheralManagerDidStartAdvertising(_ peripheral: CBPeripheralManager, error: Error?) {
        if let error {
            status = "Couldn't start broadcasting: \(error.localizedDescription)"
            isAdvertising = false
        } else {
            status = "Broadcasting. Keep this app open near the computer you're signing in on."
            isAdvertising = true
        }
    }

    func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveRead request: CBATTRequest) {
        let data = Data(deviceKey.utf8)
        guard request.offset <= data.count else {
            peripheral.respond(to: request, withResult: .invalidOffset)
            return
        }
        request.value = data.subdata(in: request.offset..<data.count)
        peripheral.respond(to: request, withResult: .success)
    }
}

struct ContentView: View {
    @StateObject private var key = KeyPeripheral()

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: key.isAdvertising ? "checkmark.shield.fill" : "shield")
                .font(.system(size: 64))
                .foregroundStyle(key.isAdvertising ? .green : .secondary)
            Text("DoubleCheck Key").font(.title.bold())
            Text(key.status)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
            TextField("Device key (AUTH_DEVICE_KEY)", text: $key.deviceKey)
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .font(.system(.body, design: .monospaced))
            Button(key.isAdvertising ? "Restart" : "Start") { key.start() }
                .buttonStyle(.borderedProminent)
                .disabled(key.deviceKey.isEmpty)
        }
        .padding(24)
    }
}
