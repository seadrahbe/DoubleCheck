import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// Fictional bank shown in the demo app. Not a real institution.
let bankName = "Northwind Bank"

struct ContentView: View {
    @StateObject private var key = KeyPeripheral()
    @State private var showSettings = false

    private var ready: Bool { key.isBroadcasting }

    var body: some View {
        VStack(spacing: 24) {
            HStack {
                Label(bankName, systemImage: "building.columns.fill")
                    .font(.headline)
                Spacer()
                Button {
                    showSettings = true
                } label: {
                    Image(systemName: "gearshape")
                }
                .accessibilityLabel("Settings")
            }

            Spacer()

            Image(systemName: ready ? "checkmark.shield.fill" : "shield")
                .font(.system(size: 72))
                .foregroundStyle(ready ? Color.green : Color.secondary)

            VStack(spacing: 8) {
                Text(ready ? "Ready to sign in" : "Setting up…")
                    .font(.title2.bold())
                Text(
                    ready
                        ? "Keep this app open. When you sign in on your computer, we'll confirm it's really you."
                        : key.status
                )
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
                .padding(.horizontal)
            }

            Spacer()
        }
        .padding(24)
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

// The device key and live proximity code live here, out of the main flow: the
// user never needs to see them during a normal sign-in.
struct SettingsView: View {
    @ObservedObject var key: KeyPeripheral
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Device key") {
                    TextField("AUTH_DEVICE_KEY", text: $key.secret)
                        .autocorrectionDisabled()
                        #if os(iOS)
                        .textInputAutocapitalization(.never)
                        #endif
                        .font(.system(.body, design: .monospaced))
                    Text("Must match the server's AUTH_DEVICE_KEY.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                if !key.code.isEmpty {
                    Section("Current proximity code") {
                        Text("DC-\(key.code)")
                            .font(.system(.body, design: .monospaced))
                        Text("New code in \(key.secondsLeft)s")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                Section {
                    Text(key.status)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
            .toolbar {
                Button("Done") { dismiss() }
            }
        }
    }
}
