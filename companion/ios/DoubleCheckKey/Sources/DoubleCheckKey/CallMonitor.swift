import Foundation
#if canImport(CallKit)
import CallKit
#endif

// Reports whether the phone is on a call. CallKit sees cellular calls, FaceTime,
// and VoIP apps that integrate with CallKit; many third-party video apps don't
// surface here, which is a known limitation of the platform.
final class CallMonitor: NSObject, ObservableObject {
    @Published var isOnCall = false

    #if canImport(CallKit)
    private let observer = CXCallObserver()

    override init() {
        super.init()
        observer.setDelegate(self, queue: .main)
        recompute()
    }

    private func recompute() {
        isOnCall = observer.calls.contains { !$0.hasEnded }
    }
    #endif
}

#if canImport(CallKit)
extension CallMonitor: CXCallObserverDelegate {
    func callObserver(_ observer: CXCallObserver, callChanged call: CXCall) {
        recompute()
    }
}
#endif
