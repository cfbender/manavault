import Capacitor
import Foundation
import UniformTypeIdentifiers

@objc(BridgeViewController)
class BridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(SharedImportPlugin())
        bridge?.registerPluginInstance(NativeShellPlugin())
    }
}
@objc(SharedImportPlugin)
public class SharedImportPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SharedImportPlugin"
    public let jsName = "SharedImport"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPendingImport", returnType: CAPPluginReturnPromise)
    ]

    private static var pendingImport: [String: Any]?
    private static weak var activePlugin: SharedImportPlugin?

    override public func load() {
        Self.activePlugin = self
    }

    @objc func getPendingImport(_ call: CAPPluginCall) {
        var result: [String: Any] = [:]

        if let payload = Self.pendingImport {
            result["import"] = payload
            Self.pendingImport = nil
        }

        call.resolve(result)
    }

    @discardableResult
    static func capture(url: URL) -> Bool {
        let accessing = url.startAccessingSecurityScopedResource()
        defer {
            if accessing {
                url.stopAccessingSecurityScopedResource()
            }
        }

        guard let data = try? Data(contentsOf: url), let text = decodedText(data), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return false
        }

        var mimeType: String? = nil
        if let contentType = try? url.resourceValues(forKeys: [.contentTypeKey]).contentType {
            mimeType = contentType.preferredMIMEType
        }

        let payload: [String: Any] = [
            "text": text,
            "fileName": url.lastPathComponent.isEmpty ? "Shared list.txt" : url.lastPathComponent,
            "mimeType": mimeType ?? "text/plain",
            "source": "ios-open"
        ]

        pendingImport = payload
        activePlugin?.notifyListeners("sharedImport", data: payload)
        return true
    }

    private static func decodedText(_ data: Data) -> String? {
        if let text = String(data: data, encoding: .utf8) {
            return text
        }

        return String(data: data, encoding: .isoLatin1)
    }
}

@objc(NativeShellPlugin)
public class NativeShellPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeShellPlugin"
    public let jsName = "NativeShell"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveServer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearServer", returnType: CAPPluginReturnPromise)
    ]

    private let serverUrlKey = "serverUrl"
    private let releaseRepository = "cfbender/manavault"
    private let fallbackVersion = "0.0.0"

    @objc func getSettings(_ call: CAPPluginCall) {
        call.resolve(settingsPayload())
    }

    @objc func saveServer(_ call: CAPPluginCall) {
        guard let serverUrl = call.getString("serverUrl")?.trimmingCharacters(in: .whitespacesAndNewlines), !serverUrl.isEmpty else {
            call.reject("Enter a ManaVault URL.")
            return
        }

        UserDefaults.standard.set(serverUrl, forKey: serverUrlKey)
        call.resolve(settingsPayload())
    }

    @objc func clearServer(_ call: CAPPluginCall) {
        UserDefaults.standard.removeObject(forKey: serverUrlKey)
        call.resolve(settingsPayload())
    }

    private func settingsPayload() -> [String: Any] {
        var payload: [String: Any] = [
            "appVersion": appVersion(),
            "releaseRepository": releaseRepository
        ]

        if let serverUrl = UserDefaults.standard.string(forKey: serverUrlKey)?.trimmingCharacters(in: .whitespacesAndNewlines), !serverUrl.isEmpty {
            payload["serverUrl"] = serverUrl
        }

        return payload
    }

    private func appVersion() -> String {
        if let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String, !version.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return version
        }

        return fallbackVersion
    }
}
