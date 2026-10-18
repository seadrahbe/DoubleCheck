// swift-tools-version: 6.0

import PackageDescription

// xtool project: build and install from Linux with `xtool dev` (see companion/README.md).
let package = Package(
    name: "DoubleCheckKey",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        // An xtool project should contain exactly one library product,
        // representing the main app.
        .library(
            name: "DoubleCheckKey",
            targets: ["DoubleCheckKey"]
        ),
    ],
    targets: [
        .target(
            name: "DoubleCheckKey"
        ),
    ],
    // Swift 5 mode: CoreBluetooth's delegate callbacks predate Swift 6's strict
    // concurrency checking.
    swiftLanguageModes: [.v5]
)
