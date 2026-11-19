// Lan.swift — the players' address (A4-C7.2) and the watch that keeps it true (A4-C11).
//
// MECHANISM (disclosed at the gate): the address is the IPv4 of the default route's interface — SystemConfiguration's
// State:/Network/Global/IPv4 PrimaryInterface — when that address is RFC 1918 (10/8, 172.16/12, 192.168/16). Anything
// else, or no default route, publishes "". One address, never a choice shown to the GM.
// The watch: a SCDynamicStore notification on the global and per-interface IPv4 keys, plus a ≤ 10 s backstop poll.
// Each pass rewrites state/lan.json (write, then rename) only when the origin changed, and tells the window.
import Foundation
import SystemConfiguration

enum Lan {
    static func isPrivate(_ ip: String) -> Bool {
        let p = ip.split(separator: ".").compactMap { Int($0) }
        guard p.count == 4, p.allSatisfy({ (0...255).contains($0) }) else { return false }
        if p[0] == 10 { return true }
        if p[0] == 172 && (16...31).contains(p[1]) { return true }
        if p[0] == 192 && p[1] == 168 { return true }
        return false
    }

    /// The candidate address before the RFC 1918 filter: the test file's text, or the default route's IPv4.
    static func candidate() -> String {
        if let f = Hooks.lanFile, FileManager.default.fileExists(atPath: f) {
            return ((try? String(contentsOfFile: f, encoding: .utf8)) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        }
        guard let store = SCDynamicStoreCreate(nil, "Holocron" as CFString, nil, nil),
              let global = SCDynamicStoreCopyValue(store, "State:/Network/Global/IPv4" as CFString) as? [String: Any],
              let iface = global["PrimaryInterface"] as? String else { return "" }
        let all = ipv4s(of: iface)
        return all.first(where: isPrivate) ?? all.first ?? ""
    }

    static func ipv4s(of iface: String) -> [String] {
        var out: [String] = []
        var head: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&head) == 0 else { return out }
        defer { freeifaddrs(head) }
        var p = head
        while let a = p {
            if let sa = a.pointee.ifa_addr, sa.pointee.sa_family == UInt8(AF_INET), String(cString: a.pointee.ifa_name) == iface {
                var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
                if getnameinfo(sa, socklen_t(sa.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 {
                    out.append(String(cString: host))
                }
            }
            p = a.pointee.ifa_next
        }
        return out
    }

    static func origin() -> String {
        let ip = candidate()
        return isPrivate(ip) ? "http://\(ip):\(Build.port)" : ""
    }
}

final class LanWatch {
    private(set) var origin: String = ""
    private var store: SCDynamicStore?
    private var timer: Timer?
    private let onChange: (String) -> Void

    init(onChange: @escaping (String) -> Void) { self.onChange = onChange }

    /// Computes and writes lan.json once; called before workerd starts so the router's first answer is already true.
    func publishNow() {
        origin = Lan.origin()
        write()
    }

    func start() {
        var ctx = SCDynamicStoreContext(version: 0, info: Unmanaged.passUnretained(self).toOpaque(), retain: nil, release: nil, copyDescription: nil)
        store = SCDynamicStoreCreate(nil, "Holocron" as CFString, { _, _, info in
            guard let info = info else { return }
            let me = Unmanaged<LanWatch>.fromOpaque(info).takeUnretainedValue()
            DispatchQueue.main.async { me.check() }
        }, &ctx)
        if let s = store {
            SCDynamicStoreSetNotificationKeys(s, ["State:/Network/Global/IPv4"] as CFArray, ["State:/Network/Interface/.*/IPv4"] as CFArray)
            if let src = SCDynamicStoreCreateRunLoopSource(nil, s, 0) { CFRunLoopAddSource(CFRunLoopGetMain(), src, .commonModes) }
        }
        let t = Timer(timeInterval: 10, repeats: true) { [weak self] _ in self?.check() }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    func check() {
        let now = Lan.origin()
        guard now != origin else { return }
        Log.write("lan: \(origin.isEmpty ? "none" : origin) -> \(now.isEmpty ? "none" : now)")
        origin = now
        write()
        onChange(now)
    }

    private func write() {
        // The contract's own shape, key order included; the origin holds only [0-9a-z.:/] so it needs no escaping.
        Paths.writeAtomically("{\"v\":1,\"origin\":\"\(origin)\"}".data(using: .utf8)!, to: Paths.lanJSON)
    }
}
