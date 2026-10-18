import Foundation

// Talks to the DoubleCheck backend (the same endpoints the web app uses).
// The base URL is configured in Settings and stored in UserDefaults, e.g.
// https://doublecheck-backend.onrender.com

enum Backend {
    static var baseURL: String {
        get { UserDefaults.standard.string(forKey: "backendURL") ?? "" }
        set { UserDefaults.standard.set(newValue, forKey: "backendURL") }
    }
}

struct ChatMessage: Codable, Identifiable {
    enum Role: String, Codable { case user, assistant }
    var id = UUID()
    var role: Role
    var content: String

    private enum CodingKeys: String, CodingKey { case role, content }
}

struct FlaggedLogin: Decodable {
    let token: String
    let location: String
    let ip: String
}

enum BigFishAction: String, Decodable {
    case `continue`, proceed, extortion, notMe = "not_me"
}

struct BigFishReply: Decodable {
    let reply: String
    let action: BigFishAction
    let suggestions: [String]
    let live: Bool
}

struct IssuedCode: Decodable {
    let code: String
}

enum APIError: LocalizedError {
    case noBackendURL
    case http(Int, String)
    var errorDescription: String? {
        switch self {
        case .noBackendURL: return "Set the backend URL in Settings first."
        case let .http(status, msg): return msg.isEmpty ? "Request failed (\(status))." : msg
        }
    }
}

enum API {
    private static func request<T: Decodable>(_ path: String, body: Encodable?) async throws -> T {
        let base = Backend.baseURL.trimmingCharacters(in: .whitespaces)
        guard !base.isEmpty, let url = URL(string: "\(base)/api\(path)") else { throw APIError.noBackendURL }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body { req.httpBody = try JSONEncoder().encode(AnyEncodable(body)) }

        let (data, response) = try await URLSession.shared.data(for: req)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let msg = (try? JSONDecoder().decode([String: String].self, from: data))?["error"] ?? ""
            throw APIError.http(status, msg)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }

    static func flaggedLogin() async throws -> FlaggedLogin {
        try await request("/flagged-login", body: nil)
    }

    static func bigFish(token: String, messages: [ChatMessage]) async throws -> BigFishReply {
        struct Body: Encodable { let messages: [ChatMessage] }
        return try await request("/bigfish/\(token)", body: Body(messages: messages))
    }

    static func issueCode(token: String) async throws -> IssuedCode {
        try await request("/issue-code/\(token)", body: nil)
    }
}

// Lets us encode a heterogeneous Encodable value through JSONEncoder.
private struct AnyEncodable: Encodable {
    private let encodeFunc: (Encoder) throws -> Void
    init(_ wrapped: Encodable) { encodeFunc = wrapped.encode }
    func encode(to encoder: Encoder) throws { try encodeFunc(encoder) }
}
