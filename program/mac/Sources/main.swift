// main.swift — the Holocron program's Mac launcher (ruling `argo-a4-launcher-build` §4.2; CONTRACT §3).
//
// One window, one workerd. Start → S1/S2 (S3 when the update check finds a newer version), or S5 when 8250 is held.
// Close (the window's close, ⌘Q, ⌘W) → S4's ask when anyone else is at a table (A4-C12), then workerd stops and the
// launcher exits. Opened again while running → S6: no second instance; the browser opens and the window comes forward.
//
// MECHANISM (disclosed at the gate):
// - Single instance: an exclusive flock on state/launcher.lock. A second copy that cannot take it posts a distributed
//   notification naming this state root and exits 0; the first copy answers it as S6. LaunchServices' own reopen
//   (opening the app while it runs) lands on the same answer through applicationShouldHandleReopen.
// - No workerd outlives the launcher by a road the launcher can catch: every close road, SIGTERM, SIGINT and SIGHUP
//   stop it first. SIGKILL cannot be caught; the next start reclaims that orphan (Server.reclaimOrphan).
import AppKit

final class App: NSObject, NSApplicationDelegate {
    private var lockFD: Int32 = -1
    private let server = Server()
    private var lan: LanWatch!
    private var win: LauncherWindow?
    private var closing = false
    private var signalSources: [DispatchSourceSignal] = []
    private var controlTimer: Timer?
    private var reportSeq = 0
    private var opened: [String] = []
    private var reopens = 0
    private var phase = "starting"

    static var notificationName: Notification.Name {
        // scoped to the state root, so a test run never wakes a real install's copy
        var h: UInt64 = 1469598103934665603
        for b in Paths.root.path.utf8 { h = (h ^ UInt64(b)) &* 1099511628211 }
        return Notification.Name("work.holocron.program.reopen.\(String(h, radix: 16))")
    }

    func applicationDidFinishLaunching(_ note: Notification) {
        try? FileManager.default.createDirectory(at: Paths.state, withIntermediateDirectories: true)
        guard takeLock() else {
            Log.write("already running: asking the running copy to come forward (S6)")
            DistributedNotificationCenter.default().postNotificationName(App.notificationName, object: nil, userInfo: nil, deliverImmediately: true)
            exit(0)
        }
        DistributedNotificationCenter.default().addObserver(self, selector: #selector(reopenAsked), name: App.notificationName, object: nil, suspensionBehavior: .deliverImmediately)
        catchSignals()
        startControl()
        lan = LanWatch { [weak self] origin in self?.win?.origin = origin }
        Log.write("Holocron \(Program.version) starting")

        DispatchQueue.global().async {
            let result = self.server.start(lan: self.lan)
            DispatchQueue.main.async { self.started(result) }
        }
    }

    private func started(_ result: Server.StartResult) {
        switch result {
        case .portTaken:
            phase = "port-taken"
            show(LauncherWindow(face: .portTaken))
        case .failed(let why):
            // A4-C14: no drawn state for this; the log carries the cause and the launcher exits
            Log.write("start failed: \(why)")
            phase = "failed"
            report()
            exit(1)
        case .running:
            phase = "running"
            server.onUnexpectedExit = { [weak self] status in
                self?.phase = "failed"
                self?.report()
                exit(1)
            }
            let w = LauncherWindow(face: .running)
            w.origin = lan.origin
            show(w)
            lan.start()
            openBrowser(URL(string: Program.localURL)!)          // the browser opens on its own at start (S1)
            UpdateCheck.run { [weak self] offer in self?.win?.offer = offer }
        }
    }

    private func show(_ w: LauncherWindow) {
        win = w
        w.onChange = { [weak self] in self?.report() }
        w.onClose = { [weak self] in self?.requestClose { ok in if ok { self?.shutdown(0) } } }
        w.onOpen = { [weak self] in self?.openBrowser(URL(string: Program.localURL)!) }
        w.onOpenURL = { [weak self] u in self?.openBrowser(u) }
        w.window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        report()
    }

    // ── S6 ──
    @objc private func reopenAsked() { comeForward() }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { comeForward(); return false }
    private func comeForward() {
        reopens += 1
        if phase == "running" { openBrowser(URL(string: Program.localURL)!) }
        win?.window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        report()
    }

    // ── close: S4 per A4-C12, then stop ──
    func requestClose(_ answer: @escaping (Bool) -> Void) {
        guard !closing, win?.alert == nil else { answer(false); return }   // an ask is already up: it decides
        guard phase == "running" else { answer(true); return }
        closing = true
        server.presence { [weak self] n in
            guard let self = self else { return }
            if n == nil { Log.write("presence unreadable: closing as if no one is at a table") }
            if let n = n, n >= 1 {
                self.win?.askPlayersAtTable { stop in
                    self.closing = false
                    answer(stop)
                }
            } else {
                self.closing = false
                answer(true)
            }
        }
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        requestClose { [weak self] ok in
            if ok { self?.stopServer() }
            NSApp.reply(toApplicationShouldTerminate: ok)
        }
        return .terminateLater
    }

    func applicationWillTerminate(_ note: Notification) { stopServer() }

    private func stopServer() {
        phase = "stopping"
        report()
        server.stop()
    }

    private func shutdown(_ code: Int32) {
        stopServer()
        Log.write("Holocron stopped")
        exit(code)
    }

    private func catchSignals() {
        for s in [SIGTERM, SIGINT, SIGHUP] {
            signal(s, SIG_IGN)
            let src = DispatchSource.makeSignalSource(signal: s, queue: .main)
            src.setEventHandler { [weak self] in Log.write("signal \(s): stopping"); self?.shutdown(0) }
            src.resume()
            signalSources.append(src)
        }
    }

    private func takeLock() -> Bool {
        lockFD = open(Paths.lockFile.path, O_CREAT | O_RDWR, 0o644)
        guard lockFD >= 0 else { return true }   // cannot lock: run rather than refuse
        return flock(lockFD, LOCK_EX | LOCK_NB) == 0
    }

    // ── the browser (A4-C7.1); under the suite, its open command ──
    private func openBrowser(_ url: URL) {
        opened.append(url.absoluteString)
        if let cmd = Hooks.openCommand {
            let p = Process()
            p.executableURL = URL(fileURLWithPath: cmd)
            p.arguments = [url.absoluteString]
            try? p.run()
        } else {
            NSWorkspace.shared.open(url)
        }
        report()
    }

    // ── the suite's report and control (HOLOCRON_TEST=1 only) ──
    private func report() {
        guard let file = Hooks.reportFile else { return }
        reportSeq += 1
        var states: [String] = []
        if let w = win {
            if w.face == .portTaken { states.append("S5") }
            else {
                states.append(w.origin.isEmpty ? "S2" : "S1")
                if w.offer != nil { states.append("S3") }
                if w.alert != nil { states.append("S4") }
            }
        }
        var obj: [String: Any] = [
            "seq": reportSeq, "pid": Int(getpid()), "phase": phase, "states": states, "version": Program.version,
            "strings": win?.visibleStrings() ?? [], "opened": opened, "reopens": reopens,
            "windowVisible": win?.window.isVisible ?? false,
            "workerdPid": Int(server.pid), "internalPort": Int(server.internalPort),
        ]
        if let a = win?.alert {
            obj["alert"] = ["text": a.messageText, "informative": a.informativeText, "buttons": a.buttons.map { $0.title },
                            "primary": a.buttons.first?.title ?? ""]
        }
        if let data = try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys]) {
            Paths.writeAtomically(data, to: URL(fileURLWithPath: file))
        }
        if let dir = Hooks.snapshotDir, let w = win {
            let name = (states.isEmpty ? phase : states.joined(separator: "+"))
            w.window.displayIfNeeded()
            w.snapshot(dir: URL(fileURLWithPath: dir), name: name)
        }
    }

    private func startControl() {
        guard let dir = Hooks.controlDir else { return }
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        let t = Timer(timeInterval: 0.2, repeats: true) { [weak self] _ in self?.pollControl(dir) }
        RunLoop.main.add(t, forMode: .common)
        controlTimer = t
    }

    private func pollControl(_ dir: String) {
        let fm = FileManager.default
        guard let names = try? fm.contentsOfDirectory(atPath: dir) else { return }
        for name in names.filter({ $0.hasSuffix(".cmd") }).sorted() {
            let path = (dir as NSString).appendingPathComponent(name)
            let text = ((try? String(contentsOfFile: path, encoding: .utf8)) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            try? fm.removeItem(atPath: path)
            Log.write("test control: \(text)")
            // Run from the top of the run loop, as a click or a key would: a command run inside this timer's callback
            // would nest ⌘Q's wait inside it, and the timer could not fire again to answer the ask.
            RunLoop.main.perform(inModes: [.common]) { [weak self] in
                guard let self = self else { return }
                if text == "close" { self.win?.window.performClose(nil) }            // the window's own close road
                else if text == "quit" { NSApp.terminate(nil) }                       // ⌘Q's road
                else if text.hasPrefix("click ") || text.hasPrefix("alert ") {
                    let title = String(text.split(separator: " ", maxSplits: 1)[1])
                    if self.win?.pressButton(titled: title) != true { Log.write("test control: no button \(title)") }
                }
                self.report()
            }
        }
    }
}

let app = NSApplication.shared
let delegate = App()
app.delegate = delegate
app.setActivationPolicy(.regular)

// The menu: the app menu's Hide and Quit (⌘Q), and the Window menu's Minimize and Close (⌘W, the window's close road).
let menu = NSMenu()
let appItem = NSMenuItem()
menu.addItem(appItem)
let appMenu = NSMenu()
appMenu.addItem(withTitle: "Hide Holocron", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
appMenu.addItem(NSMenuItem.separator())
appMenu.addItem(withTitle: "Quit Holocron", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
appItem.submenu = appMenu
let winItem = NSMenuItem()
menu.addItem(winItem)
let winMenu = NSMenu(title: "Window")
winMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
winMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
winItem.submenu = winMenu
app.mainMenu = menu
app.windowsMenu = winMenu
app.run()
