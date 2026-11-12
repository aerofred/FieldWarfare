// swift-tools-version: 5.9
import PackageDescription

// The Capacitor CLI names this package after the npm package
// (field-warfare-ar → FieldWarfareAr).
let package = Package(
    name: "FieldWarfareAr",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "FieldWarfareAr", targets: ["ArPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "ArPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/ArPlugin")
    ]
)
