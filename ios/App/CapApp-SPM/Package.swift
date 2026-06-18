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
        .package(name: "CapacitorCamera", path: "../../../../../../.cache/aube/virtual-store/@capacitor+camera@8.2.0_@capacitor+core@8.4.0_-c9bf380fc0e53f6a/node_modules/@capacitor/camera"),
        .package(name: "CapacitorFilesystem", path: "../../../../../../.cache/aube/virtual-store/@capacitor+filesystem@8.1.2_@capacitor+core@8.4.0_-2169c8c63d855856/node_modules/@capacitor/filesystem")
    ],
    targets: [
        .target(
            name: "CapApp-SPM",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "CapacitorCamera", package: "CapacitorCamera"),
                .product(name: "CapacitorFilesystem", package: "CapacitorFilesystem")
            ]
        )
    ]
)
