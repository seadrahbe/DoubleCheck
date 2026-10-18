import Foundation
#if canImport(CoreLocation)
import CoreLocation
#endif

// GPS fallback for the verify step. Asks for one location fix. This only confirms
// the phone itself has a location; comparing it to the computer being logged in
// on would be a server-side check in a real build.
final class LocationProbe: NSObject {
    #if canImport(CoreLocation)
    private let manager = CLLocationManager()
    private var cont: CheckedContinuation<Bool, Never>?

    static var available: Bool { CLLocationManager.locationServicesEnabled() }

    func fix() async -> Bool {
        await withCheckedContinuation { continuation in
            cont = continuation
            manager.delegate = self
            manager.requestWhenInUseAuthorization()
            manager.requestLocation()
        }
    }

    private func finish(_ ok: Bool) {
        cont?.resume(returning: ok)
        cont = nil
    }
    #else
    static var available: Bool { false }
    func fix() async -> Bool { false }
    #endif
}

#if canImport(CoreLocation)
extension LocationProbe: CLLocationManagerDelegate {
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        finish(!locations.isEmpty)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        finish(false)
    }
}
#endif
