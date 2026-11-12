// swift-tools-version: 5.9
import PackageDescription

// The Capacitor CLI names this package after the npm package
// (field-warfare-lan-host → FieldWarfareLanHost).
let package = Package(
    name: "FieldWarfareLanHost",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "FieldWarfareLanHost", targets: ["LanHostPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "LanHostPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/LanHostPlugin")
    ]
)
