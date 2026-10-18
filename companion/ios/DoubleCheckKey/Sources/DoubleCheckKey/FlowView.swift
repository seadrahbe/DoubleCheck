import SwiftUI

// The flagged-login flow, in step with the web experience:
// open → check for an active call → Big Fish chat → (proceed) confirm → verify →
// code; or, if Big Fish concludes extortion / "this wasn't me", it ends the chat
// and shows steps to secure the account (the web app is where the lock happens).
enum FlowStep {
    case loading, callcheck, chat, confirm, verifying, code, secure, error
}

let supportName = "\(bankName) support"
let supportPhone = "1-800-555-0100"

// Starter replies for the first turn; after that, suggestions come from Big Fish.
let openingSuggestions = ["It's me, I'm logging in", "Someone asked me to do this", "I'm not sure"]

struct FlowView: View {
    @ObservedObject var key: KeyPeripheral
    @StateObject private var calls = CallMonitor()

    @State private var step: FlowStep = .loading
    @State private var token = ""
    @State private var location = "an unfamiliar location"
    @State private var code = ""
    @State private var secureReason: BigFishAction = .extortion
    @State private var errorText = ""

    var body: some View {
        Group {
            switch step {
            case .loading:
                ProgressView("Connecting…")
            case .error:
                VStack(spacing: 16) {
                    Text(errorText).foregroundStyle(.red).multilineTextAlignment(.center)
                    Button("Try again") { Task { await start() } }.buttonStyle(.borderedProminent)
                }
                .padding()
            case .callcheck:
                CallCheckView(calls: calls) { step = .chat }
            case .chat:
                ChatView(
                    token: token,
                    location: location,
                    onProceed: { step = .confirm },
                    onBlocked: { reason in
                        secureReason = reason
                        step = .secure
                    }
                )
            case .confirm:
                ConfirmView(onBack: { step = .chat }, onConfirm: { Task { await confirmAndVerify() } })
            case .verifying:
                VerifyingView(key: key, onDone: { step = .code })
            case .code:
                CodeView(code: code) { Task { await start() } }
            case .secure:
                SecureAccountView(reason: secureReason) { Task { await start() } }
            }
        }
        .task { await start() }
    }

    private func start() async {
        step = .loading
        do {
            let fl = try await API.flaggedLogin()
            token = fl.token
            location = fl.location
            step = .callcheck
        } catch {
            errorText = error.localizedDescription
            step = .error
        }
    }

    // Issues the one-time code once, from the confirm action, then shows the
    // verify animation.
    private func confirmAndVerify() async {
        step = .verifying
        do {
            code = try await API.issueCode(token: token).code
        } catch {
            errorText = error.localizedDescription
            step = .error
        }
    }
}

struct CallCheckView: View {
    @ObservedObject var calls: CallMonitor
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "phone.fill").font(.system(size: 48)).foregroundStyle(.secondary)
            Text("Are you on a phone or video call right now?").font(.title3.bold()).multilineTextAlignment(.center)
            if calls.isOnCall {
                Text("It looks like you're on a call. If someone is guiding you through this login, please hang up before continuing. A real bank or agency will never need to stay on the line.")
                    .multilineTextAlignment(.center).foregroundStyle(.secondary)
                Label("Waiting for the call to end…", systemImage: "hourglass").foregroundStyle(.orange)
            } else {
                Text("Good — no active call detected. If anyone is messaging you about this login, consider stopping first.")
                    .multilineTextAlignment(.center).foregroundStyle(.secondary)
                Button("Continue", action: onContinue).buttonStyle(.borderedProminent)
            }
        }
        .padding(24)
    }
}

struct ChatView: View {
    let token: String
    let location: String
    let onProceed: () -> Void
    let onBlocked: (BigFishAction) -> Void

    @State private var turns: [ChatMessage] = []
    @State private var suggestions: [String] = openingSuggestions
    @State private var cleared = false
    @State private var input = ""
    @State private var busy = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(systemName: "fish.fill").font(.title2).foregroundStyle(.teal)
                VStack(alignment: .leading, spacing: 0) {
                    Text("Big Fish").font(.headline)
                    Text("\(bankName) safety team").font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
            }
            .padding(.bottom, 8)

            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(turns) { turn in
                        Text(turn.content)
                            .padding(10)
                            .background(turn.role == .user ? Color.accentColor : Color(white: 0.92))
                            .foregroundStyle(turn.role == .user ? Color.white : Color.black)
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .frame(maxWidth: .infinity, alignment: turn.role == .user ? .trailing : .leading)
                    }
                    if busy {
                        Text("…").padding(10).background(Color(white: 0.92)).clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                }
            }

            if cleared {
                Button("Continue to sign in", action: onProceed)
                    .buttonStyle(.borderedProminent)
                    .padding(.top, 6)
            }

            if !suggestions.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(suggestions, id: \.self) { chip in
                            Button(chip) { send(chip) }
                                .font(.caption)
                                .disabled(busy)
                                .buttonStyle(.bordered)
                        }
                    }
                }
                .padding(.vertical, 6)
            }

            HStack {
                TextField("Type a message…", text: $input)
                    .textFieldStyle(.roundedBorder)
                Button("Send") { send(input) }.disabled(busy || input.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            if !cleared {
                Button("I'd like to log in and access my account", action: onProceed)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.top, 8)
            }
        }
        .padding(16)
        .onAppear {
            if turns.isEmpty {
                turns = [ChatMessage(role: .assistant, content: "Hi, I'm Big Fish from the \(bankName) safety team. A login from \(location) was flagged, so I just want to make sure you're okay. You're not in trouble — is this you choosing to log in?")]
            }
        }
    }

    private func send(_ text: String) {
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, !busy else { return }
        turns.append(ChatMessage(role: .user, content: content))
        suggestions = []
        input = ""
        busy = true
        let history = turns
        Task {
            defer { busy = false }
            do {
                let res = try await API.bigFish(token: token, messages: history)
                turns.append(ChatMessage(role: .assistant, content: res.reply))
                switch res.action {
                case .extortion, .notMe:
                    // Let the message land, then move to the secure-account steps.
                    try? await Task.sleep(nanoseconds: 2_200_000_000)
                    onBlocked(res.action)
                case .proceed:
                    cleared = true
                    suggestions = res.suggestions
                case .continue:
                    suggestions = res.suggestions
                }
            } catch {
                turns.append(ChatMessage(role: .assistant, content: "Sorry, I had trouble responding. Please try again."))
                suggestions = openingSuggestions
            }
        }
    }
}

struct ConfirmView: View {
    let onBack: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 48)).foregroundStyle(.yellow)
            Text("Are you sure?").font(.title2.bold())
            Text("If anyone is guiding you, pressuring you, or asked you to log in or share a code, please stop now and talk to someone you trust first.")
                .multilineTextAlignment(.center).foregroundStyle(.secondary)
            Button("Yes, verify and log me in", action: onConfirm).buttonStyle(.borderedProminent)
            Button("Go back", action: onBack)
        }
        .padding(24)
    }
}

struct VerifyingView: View {
    @ObservedObject var key: KeyPeripheral
    let onDone: () -> Void
    @State private var lines: [String] = []

    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
            Text("Verifying it's you").font(.title3.bold())
            VStack(alignment: .leading, spacing: 6) {
                ForEach(lines, id: \.self) { line in
                    Text(line).font(.callout).foregroundStyle(line.contains("✓") ? .green : .secondary)
                }
            }
        }
        .padding(24)
        .task { await run() }
    }

    private func run() async {
        func add(_ s: String) { lines.append(s) }
        func wait(_ ms: UInt64) async { try? await Task.sleep(nanoseconds: ms * 1_000_000) }

        add("Checking your DoubleCheck Key over Bluetooth…")
        await wait(1100)
        if key.isBroadcasting {
            add("Verified your key is nearby over Bluetooth ✓")
        } else if LocationProbe.available {
            add("Bluetooth unavailable. Checking your location…")
            _ = await LocationProbe().fix()
            add("Verified by your location ✓")
        } else {
            add("Bluetooth and location unavailable. Sending your code…")
        }
        await wait(900)
        onDone()
    }
}

struct CodeView: View {
    let code: String
    let onDone: () -> Void

    private var grouped: String {
        code.count == 6 ? "\(code.prefix(3)) \(code.suffix(3))" : code
    }

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "checkmark.circle.fill").font(.system(size: 56)).foregroundStyle(.green)
            Text("You're verified").font(.title2.bold())
            Text("Here's your one-time code. Never share it with anyone.")
                .multilineTextAlignment(.center).foregroundStyle(.secondary)
            Text(grouped).font(.system(size: 40, weight: .bold, design: .monospaced)).foregroundStyle(.green)
            Text("This is how the code reaches you when your phone can't be auto-verified nearby.")
                .font(.caption).multilineTextAlignment(.center).foregroundStyle(.secondary)
            Button("Done", action: onDone)
        }
        .padding(24)
    }
}

// Shown when Big Fish blocks the login (extortion or "this wasn't me"). The lock
// itself lives on the web; here we gently guide the person to secure the account.
struct SecureAccountView: View {
    let reason: BigFishAction
    let onDone: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Image(systemName: "lifepreserver.fill")
                    .font(.system(size: 44)).foregroundStyle(.orange)
                    .frame(maxWidth: .infinity)
                Text("Let's keep your account safe").font(.title3.bold()).frame(maxWidth: .infinity)
                Text(reason == .extortion
                    ? "You're not in trouble, and none of this is your fault. We've paused the sign-in on your computer. Here are a few steps to protect yourself:"
                    : "Thanks for letting us know this wasn't you. We've paused the sign-in on your computer. Here's how to secure your account:")
                    .foregroundStyle(.secondary)

                stepRow(1, "Change your password now, and anywhere you've reused it.")
                stepRow(2, "Review recent activity and sign out of devices you don't recognize.")
                stepRow(3, "Never share a code or move money because someone told you to.")
                stepRow(4, "Call \(supportName) at \(supportPhone) — they'll help you finish securing things.")
                if reason == .extortion {
                    stepRow(5, "If someone is threatening you, contact local law enforcement.")
                }

                Button("Done", action: onDone).frame(maxWidth: .infinity).padding(.top, 4)
            }
            .padding(20)
        }
    }

    private func stepRow(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Text("\(n)").font(.caption.bold()).foregroundStyle(.white)
                .frame(width: 22, height: 22).background(Color.accentColor).clipShape(Circle())
            Text(text).font(.callout)
        }
    }
}
