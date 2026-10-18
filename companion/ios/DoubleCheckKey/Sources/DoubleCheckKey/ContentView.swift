import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// Fictional bank shown in the demo app. Not a real institution.
let bankName = "Sound Credit Union"

struct ContentView: View {
    // Keeps broadcasting the rotating proximity code the whole time the app is open.
    @StateObject private var key = KeyPeripheral()
    @State private var showSettings = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            FlowView(key: key)
            Button {
                showSettings = true
            } label: {
                Image(systemName: "gearshape").padding(10)
            }
            .accessibilityLabel("Settings")
        }
        .sheet(isPresented: $showSettings) {
            SettingsView(key: key)
        }
        #if canImport(UIKit)
        // iOS stops broadcasting the name when the app leaves the foreground,
        // so keep the screen awake while the app is open.
        .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        .onDisappear { UIApplication.shared.isIdleTimerDisabled = false }
        #endif
    }
}

// Setup, out of the main flow: the backend URL, the Bluetooth device key, and
// the live proximity code. The user doesn't need these during a normal sign-in.
struct SettingsView: View {
    @ObservedObject var key: KeyPeripheral
    @AppStorage("backendURL") private var backendURL = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Backend URL") {
                    TextField("https://your-backend.onrender.com", text: $backendURL)
                        .autocorrectionDisabled()
                        #if os(iOS)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        #endif
                        .font(.system(.body, design: .monospaced))
                    Text("Where Big Fish and verification requests go.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Section("Device key") {
                    TextField("AUTH_DEVICE_KEY", text: $key.secret)
                        .autocorrectionDisabled()
                        #if os(iOS)
                        .textInputAutocapitalization(.never)
                        #endif
                        .font(.system(.body, design: .monospaced))
                    Text("Must match the server's AUTH_DEVICE_KEY.")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if !key.code.isEmpty {
                    Section("Current proximity code") {
                        Text("DC-\(key.code)").font(.system(.body, design: .monospaced))
                        Text("New code in \(key.secondsLeft)s").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                Section {
                    Text(key.status).font(.footnote).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                Button("Done") { dismiss() }
            }
        }
    }
}
