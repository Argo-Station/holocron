// Paths.swift — where the program keeps things (A4-C11's directories) and its one log (A4-C14).
//
//   <root>/state/     the launcher's: lan.json, workerd.pid, launcher.lock, holocron.log. Read-only to workerd.
//   <root>/do-disk/   the tables' storage, emptied at each start (D-524 b4, D-621 b1).
//   <app>/Contents/Resources/serve/holocron.capnp   the one config file; site/ beside it is the built site, read-only.
// <root> is ~/Library/Application Support/Holocron, or HOLOCRON_TEST_STATE under the suite.
import Foundation

enum Paths {
    static let root: URL = {
        if let r = Hooks.stateRoot { return URL(fileURLWithPath: r, isDirectory: true) }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent("Holocron", isDirectory: true)
    }()
    static let state = root.appendingPathComponent("state", isDirectory: true)
    static let doDisk = root.appendingPathComponent("do-disk", isDirectory: true)
    static let lanJSON = state.appendingPathComponent("lan.json")
    static let pidFile = state.appendingPathComponent("workerd.pid")
    static let lockFile = state.appendingPathComponent("launcher.lock")
    static let log = state.appendingPathComponent("holocron.log")

    static let resources = Bundle.main.resourceURL!
    static let config = resources.appendingPathComponent("serve/holocron.capnp")
    static let site = resources.appendingPathComponent("site", isDirectory: true)
    static let workerd = Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/workerd")
    static let icon = resources.appendingPathComponent("icon.png")

    /// Write, then rename: a reader never sees half a file (A4-C11's lan.json; the test report).
    static func writeAtomically(_ data: Data, to url: URL) {
        let tmp = url.deletingLastPathComponent().appendingPathComponent(".\(url.lastPathComponent).\(getpid()).tmp")
        do {
            try data.write(to: tmp)
            if rename(tmp.path, url.path) != 0 { try? FileManager.default.removeItem(at: tmp) }
        } catch { Log.write("could not write \(url.lastPathComponent): \(error.localizedDescription)") }
    }
}

enum Log {
    private static let queue = DispatchQueue(label: "holocron.log")
    static func write(_ line: String) {
        let stamp = ISO8601DateFormatter().string(from: Date())
        let text = "\(stamp) \(line)\n"
        queue.sync {
            try? FileManager.default.createDirectory(at: Paths.state, withIntermediateDirectories: true)
            if let h = try? FileHandle(forWritingTo: Paths.log) {
                h.seekToEndOfFile(); h.write(text.data(using: .utf8)!); try? h.close()
            } else {
                try? text.data(using: .utf8)!.write(to: Paths.log)
            }
        }
    }
}
