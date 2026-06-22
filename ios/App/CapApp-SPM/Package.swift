// swift-tools-version: 5.9
import PackageDescription

// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "CapApp-SPM",
            targets: ["CapApp-SPM"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.0"),
        .package(name: "CapacitorCamera", path: "../../../node_modules/.aube/@capacitor+camera@8.2.0_@capacitor+core@8.4.0/node_modules/@capacitor/camera"),
        .package(name: "CapacitorFilesystem", path: "../../../node_modules/.aube/@capacitor+filesystem@8.1.2_@capacitor+core@8.4.0/node_modules/@capacitor/filesystem"),
        .package(name: "CapacitorStatusBar", path: "../../../node_modules/.aube/@capacitor+status-bar@8.0.2_@capacitor+core@8.4.0/node_modules/@capacitor/status-bar")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCamera", package: "CapacitorCamera"),
                .product(name: "CapacitorFilesystem", package: "CapacitorFilesystem"),
                .product(name: "CapacitorStatusBar", package: "CapacitorStatusBar")
            ]
        )
    ]
)
