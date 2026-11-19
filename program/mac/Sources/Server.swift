// Server.swift — the one workerd process (A4-C11) and its lifetime (A4-C14).
//
// START: reclaim our own orphan, pre-check 8250, empty do-disk, publish lan.json, start
//   workerd serve <Resources/serve/holocron.capnp>
//     --socket-addr http=*:8250 --socket-addr internal=127.0.0.1:<free>
//     -d site=<Resources/site> -d state=<root/state> -d do-disk=<root/do-disk>
// then wait for the internal socket's /health. A held port is S5 and nothing starts. Any other failure writes
// state/holocron.log and the launcher exits without drawing a state (A4-C14: none is drawn).
// STOP: SIGTERM, a hard SIGKILL after 5 s, then the pid file goes.
//
// MECHANISM (disclosed at the gate):
// - The port pre-check: a TCP connect to 127.0.0.1:8250 and to [::1]:8250 (anyone answering holds the address a browser
//   reaches) and a bind of 0.0.0.0:8250 (anyone holding the wildcard). Either way S5, never another port. A bind race
//   lost after the pre-check reads workerd's own "Address already in use" and is S5 too.
// - The orphan reclaim: state/workerd.pid names the last workerd this program started. It is killed only while that pid is
//   alive AND its executable path (proc_pidpath) is this bundle's own Contents/MacOS/workerd. Anything else is left alone.
import Foundation
import Darwin

final class Server {
    enum StartResult { case running, portTaken, failed(String) }

    private(set) var pid: pid_t = 0
    private var exitSource: DispatchSourceProcess?
    private(set) var internalPort: UInt16 = 0
    private var stopping = false
    var onUnexpectedExit: ((Int32) -> Void)?

    // ── A4-C14: reclaim only our own orphan ──
    static func reclaimOrphan() {
        guard let text = try? String(contentsOf: Paths.pidFile, encoding: .utf8),
              let pid = pid_t(text.trimmingCharacters(in: .whitespacesAndNewlines)), pid > 1 else { return }
        defer { try? FileManager.default.removeItem(at: Paths.pidFile) }
        guard kill(pid, 0) == 0 else { return }
        guard let exe = executablePath(of: pid) else { return }
        let ours = Paths.workerd.resolvingSymlinksInPath().path
        guard exe == ours else {
            Log.write("pid file names \(pid) (\(exe)), not this program's workerd: left alone")
            return
        }
        Log.write("reclaiming orphan workerd \(pid)")
        kill(pid, SIGTERM)
        if !waitGone(pid, seconds: 5) { kill(pid, SIGKILL); _ = waitGone(pid, seconds: 2) }
    }

    static func executablePath(of pid: pid_t) -> String? {
        var buf = [CChar](repeating: 0, count: 4 * Int(MAXPATHLEN))
        let n = proc_pidpath(pid, &buf, UInt32(buf.count))
        guard n > 0 else { return nil }
        return URL(fileURLWithPath: String(cString: buf)).resolvingSymlinksInPath().path
    }

    /// How the last child reaped by waitGone ended: "signal N", "exit N", or "" when it was not ours to reap.
    static var lastEnd = ""

    static func waitGone(_ pid: pid_t, seconds: Double) -> Bool {
        let end = Date().addingTimeInterval(seconds)
        lastEnd = ""
        while Date() < end {
            var status: Int32 = 0
            if waitpid(pid, &status, WNOHANG) == pid {                   // our own child: reap it
                let sig = status & 0x7f
                lastEnd = sig == 0 ? "exit \((status >> 8) & 0xff)" : "signal \(sig)"
                return true
            }
            if kill(pid, 0) != 0 && errno == ESRCH { return true }
            usleep(50_000)
        }
        return false
    }

    // ── A4-C14: is 8250 free? ──
    static func portHeld(_ port: UInt16) -> Bool {
        if connects(host: "127.0.0.1", port: port, family: AF_INET) { return true }
        if connects(host: "::1", port: port, family: AF_INET6) { return true }
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return true }
        defer { close(fd) }
        var one: Int32 = 1
        setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &one, socklen_t(MemoryLayout<Int32>.size))
        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = port.bigEndian
        addr.sin_addr.s_addr = INADDR_ANY
        let ok = withUnsafePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
        return ok != 0
    }

    static func connects(host: String, port: UInt16, family: Int32) -> Bool {
        var hints = addrinfo(ai_flags: AI_NUMERICHOST, ai_family: family, ai_socktype: SOCK_STREAM, ai_protocol: 0, ai_addrlen: 0, ai_canonname: nil, ai_addr: nil, ai_next: nil)
        var res: UnsafeMutablePointer<addrinfo>?
        guard getaddrinfo(host, String(port), &hints, &res) == 0, let ai = res else { return false }
        defer { freeaddrinfo(res) }
        let fd = socket(ai.pointee.ai_family, SOCK_STREAM, 0)
        guard fd >= 0 else { return false }
        defer { close(fd) }
        // Non-blocking connect with a short wait: a refused loopback answers at once.
        let flags = fcntl(fd, F_GETFL, 0)
        _ = fcntl(fd, F_SETFL, flags | O_NONBLOCK)
        let r = connect(fd, ai.pointee.ai_addr, ai.pointee.ai_addrlen)
        if r == 0 { return true }
        guard errno == EINPROGRESS else { return false }
        var pfd = pollfd(fd: fd, events: Int16(POLLOUT), revents: 0)
        guard poll(&pfd, 1, 500) == 1 else { return false }
        var err: Int32 = 0
        var len = socklen_t(MemoryLayout<Int32>.size)
        getsockopt(fd, SOL_SOCKET, SO_ERROR, &err, &len)
        return err == 0
    }

    static func freeLoopbackPort() -> UInt16 {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        defer { close(fd) }
        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = 0
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        _ = withUnsafePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } }
        var len = socklen_t(MemoryLayout<sockaddr_in>.size)
        _ = withUnsafeMutablePointer(to: &addr) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(fd, $0, &len) } }
        return UInt16(bigEndian: addr.sin_port)
    }

    // ── start ──
    func start(lan: LanWatch) -> StartResult {
        Server.reclaimOrphan()
        if Server.portHeld(Build.port) { Log.write("port \(Build.port) is held by another program"); return .portTaken }

        let fm = FileManager.default
        try? fm.removeItem(at: Paths.doDisk)
        do { try fm.createDirectory(at: Paths.doDisk, withIntermediateDirectories: true) }
        catch { return .failed("could not make do-disk: \(error.localizedDescription)") }
        for need in [Paths.workerd, Paths.config, Paths.site] where !fm.fileExists(atPath: need.path) {
            return .failed("missing \(need.path)")
        }
        lan.publishNow()

        internalPort = Server.freeLoopbackPort()
        // posix_spawn, not Foundation's Process: the launcher ignores SIGTERM/SIGINT/SIGHUP to catch them, and an ignored
        // signal is inherited across exec — workerd would never hear its graceful stop. SETSIGDEF puts them back to
        // default, and CLOEXEC_DEFAULT keeps launcher.lock's descriptor out of workerd, so an orphan never holds it.
        // workerd's stdout and stderr append to state/holocron.log.
        let args = ["workerd", "serve", Paths.config.path,
                    "--socket-addr", "http=*:\(Build.port)",
                    "--socket-addr", "internal=127.0.0.1:\(internalPort)",
                    "-d", "site=\(Paths.site.path)",
                    "-d", "state=\(Paths.state.path)",
                    "-d", "do-disk=\(Paths.doDisk.path)"]
        let logStart = (try? FileManager.default.attributesOfItem(atPath: Paths.log.path)[.size] as? Int) ?? 0
        guard let pid = Server.spawn(Paths.workerd.path, args, cwd: Paths.config.deletingLastPathComponent().path, log: Paths.log.path) else {
            return .failed("workerd did not start: \(String(cString: strerror(errno)))")
        }
        self.pid = pid
        Paths.writeAtomically("\(pid)\n".data(using: .utf8)!, to: Paths.pidFile)
        Log.write("workerd \(pid) started; internal 127.0.0.1:\(internalPort)")

        let end = Date().addingTimeInterval(15)
        while Date() < end {
            var status: Int32 = 0
            if waitpid(pid, &status, WNOHANG) == pid {
                self.pid = 0
                try? FileManager.default.removeItem(at: Paths.pidFile)
                let tail = Server.logSince(logStart)
                if tail.localizedCaseInsensitiveContains("address already in use") { return .portTaken }
                return .failed("workerd exited at start (status \(status))")
            }
            if healthy() { watchExit(pid); return .running }
            usleep(100_000)
        }
        stop()
        return .failed("workerd did not answer /health within 15 s")
    }

    static func spawn(_ path: String, _ argv: [String], cwd: String, log: String) -> pid_t? {
        var attr: posix_spawnattr_t?
        posix_spawnattr_init(&attr)
        defer { posix_spawnattr_destroy(&attr) }
        var def = sigset_t(), mask = sigset_t()
        sigemptyset(&def); sigemptyset(&mask)
        for s in [SIGTERM, SIGINT, SIGHUP, SIGPIPE] { sigaddset(&def, s) }
        posix_spawnattr_setsigdefault(&attr, &def)
        posix_spawnattr_setsigmask(&attr, &mask)
        posix_spawnattr_setflags(&attr, Int16(POSIX_SPAWN_SETSIGDEF | POSIX_SPAWN_SETSIGMASK | POSIX_SPAWN_CLOEXEC_DEFAULT))
        var fa: posix_spawn_file_actions_t?
        posix_spawn_file_actions_init(&fa)
        defer { posix_spawn_file_actions_destroy(&fa) }
        posix_spawn_file_actions_addopen(&fa, 0, "/dev/null", O_RDONLY, 0)
        posix_spawn_file_actions_addopen(&fa, 1, log, O_WRONLY | O_APPEND | O_CREAT, 0o644)
        posix_spawn_file_actions_adddup2(&fa, 1, 2)
        posix_spawn_file_actions_addchdir_np(&fa, cwd)
        let cargs = argv.map { strdup($0) } + [nil]
        defer { cargs.forEach { free($0) } }
        var pid: pid_t = 0
        let rc = posix_spawn(&pid, path, &fa, &attr, cargs, environ)
        if rc != 0 { errno = rc; return nil }
        return pid
    }

    static func logSince(_ offset: Int) -> String {
        guard let h = try? FileHandle(forReadingFrom: Paths.log) else { return "" }
        defer { try? h.close() }
        h.seek(toFileOffset: UInt64(offset))
        return String(data: h.readDataToEndOfFile(), encoding: .utf8) ?? ""
    }

    /// workerd dying while the window is up: logged, and the launcher is told (it exits; no state is drawn for it).
    private func watchExit(_ pid: pid_t) {
        let src = DispatchSource.makeProcessSource(identifier: pid, eventMask: .exit, queue: .main)
        src.setEventHandler { [weak self] in
            src.cancel()
            guard let self = self, !self.stopping, self.pid == pid else { return }
            var status: Int32 = 0
            waitpid(pid, &status, 0)
            self.pid = 0
            try? FileManager.default.removeItem(at: Paths.pidFile)
            Log.write("workerd exited unexpectedly (status \(status))")
            self.onUnexpectedExit?(status)
        }
        src.resume()
        exitSource = src
    }

    private func healthy() -> Bool {
        guard let (code, _) = Server.get("http://127.0.0.1:\(internalPort)/health", timeout: 1) else { return false }
        return code == 200
    }

    // ── A4-C12: everyone a close would cut off ──
    /// nil when the count cannot be read; the window treats that as no one (logged).
    func presence(_ done: @escaping (Int?) -> Void) {
        let port = internalPort
        DispatchQueue.global().async {
            var n: Int? = nil
            if let (code, body) = Server.get("http://127.0.0.1:\(port)/program/presence", timeout: 2), code == 200,
               let obj = try? JSONSerialization.jsonObject(with: body) as? [String: Any],
               (obj["v"] as? Int) == 1, let players = obj["players"] as? Int, players >= 0 { n = players }
            DispatchQueue.main.async { done(n) }
        }
    }

    static func get(_ url: String, timeout: Double) -> (Int, Data)? {
        guard let u = URL(string: url) else { return nil }
        let cfg = URLSessionConfiguration.ephemeral
        cfg.timeoutIntervalForRequest = timeout
        cfg.timeoutIntervalForResource = timeout
        cfg.connectionProxyDictionary = [:]
        let session = URLSession(configuration: cfg)
        defer { session.invalidateAndCancel() }
        let sem = DispatchSemaphore(value: 0)
        var out: (Int, Data)?
        session.dataTask(with: u) { data, resp, _ in
            if let h = resp as? HTTPURLResponse { out = (h.statusCode, data ?? Data()) }
            sem.signal()
        }.resume()
        _ = sem.wait(timeout: .now() + timeout + 0.5)
        return out
    }

    // ── stop: graceful, then hard after 5 s ──
    func stop() {
        stopping = true
        let pid = self.pid
        guard pid > 0 else { return }
        // MEASURED (workerd 1.20260722.1): on SIGTERM workerd drains, and an open WebSocket (a player at a table) never
        // drains, so SIGTERM alone always met the hard kill. On SIGINT it closes every socket cleanly and exits (52 ms).
        // So: SIGTERM, which ends at once when nothing is open; SIGINT after 1 s; SIGKILL at 5 s.
        kill(pid, SIGTERM)
        var gone = Server.waitGone(pid, seconds: 1)
        if !gone {
            kill(pid, SIGINT)
            gone = Server.waitGone(pid, seconds: 4)
        }
        if !gone {
            Log.write("workerd \(pid) did not stop in 5 s: killed")
            kill(pid, SIGKILL)
            _ = Server.waitGone(pid, seconds: 2)
        }
        try? FileManager.default.removeItem(at: Paths.pidFile)
        // the suite's C14.graceful reads this: a graceful stop ends by SIGTERM (signal 15), SIGINT (signal 2) or exit 0
        Log.write("workerd \(pid) stopped (\(Server.lastEnd.isEmpty ? "not reaped" : Server.lastEnd))")
        self.pid = 0
    }
}
