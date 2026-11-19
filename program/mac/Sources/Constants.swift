// Constants.swift — the build's fixed values (ruling `argo-a4-launcher-build` §3).
//
// A4-C8:  the program's port is 8250, TCP, on every OS, never changed between releases.
// A4-C13: LATEST_URL and the release host are BUILD CONSTANTS, empty in every build until the end-goal refresh. An empty
//         LATEST_URL means no GET at all (D-609). The packaging card names the host and the file.
// The program's version is the site's release version at its build (package.json `version`), which build.mjs writes
// into Info.plist as CFBundleShortVersionString; `Program.version` reads it from there.
import Foundation

enum Build {
    static let port: UInt16 = 8250
    static let latestURL = ""
    static let releaseHost = ""
}

enum Program {
    static var version: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "0.0.0"
    }
    /// What the GM's browser opens (A4-C7.1): the loopback origin, never the LAN address.
    static var localURL: String { "http://localhost:\(Build.port)/" }
}
