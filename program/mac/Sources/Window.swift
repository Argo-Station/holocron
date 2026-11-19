// Window.swift — the launcher window, as LAW draws it: `Docs/mockups/argo-a4-guide.html` @ f592705b7, frames
// window-s1-mac-a, window-s2-mac-a, window-s3-mac-a, window-s4-mac-a, window-s5-mac, and S6's note. Copy verbatim.
//
// The frames' measures: 460 pt wide; body padding 18/20/16; a 40 pt icon with 22 % corners, 14 pt from the headline
// (15 pt bold); the address in 15 pt semibold mono on white, a 1 pt #ccc border, 5 pt corners, Copy 10 pt after it;
// the update line on #fff6d6 with 6 pt corners, 12 pt above; the buttons 16 pt below, 8 pt apart; the foot 12 pt
// #6e6e73, 14 pt below. The frames are drawn light, so the window keeps the light (Aqua) appearance.
//
// NOT BUILT HERE: "Link to your account" and the linked state (T1's link card, D-615 b1). `linkSlot` keeps their place
// in the button row, after Open Holocron, so adding them changes nothing else.
// S4 is the OS's own alert (NSAlert as a sheet), never redrawn.
import AppKit

final class LauncherWindow: NSObject, NSWindowDelegate {
    enum Face { case running, portTaken }

    let window: NSWindow
    let face: Face
    private let body = NSStackView()
    private var lead: NSTextField!
    private var addrRow: NSStackView!
    private var addrLabel: NSTextField!
    private var updateBox: NSView!
    private var updateText: NSTextField!
    private(set) var linkSlot = NSStackView()
    private(set) var alert: NSAlert?
    private var updatePage: URL?

    var origin: String = "" { didSet { refresh() } }
    var offer: UpdateOffer? { didSet { refresh() } }
    var onClose: (() -> Void)?
    var onOpen: (() -> Void)?
    var onOpenURL: ((URL) -> Void)?
    var onChange: (() -> Void)?

    init(face: Face) {
        self.face = face
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 460, height: 160),
                          styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        super.init()
        window.title = "Holocron"
        window.appearance = NSAppearance(named: .aqua)
        window.backgroundColor = NSColor(srgbRed: 0xec / 255, green: 0xec / 255, blue: 0xec / 255, alpha: 1)
        window.isReleasedWhenClosed = false
        window.delegate = self
        build()
        refresh()
        window.center()
    }

    // ── drawing ──
    private func label(_ text: String, size: CGFloat = 13, weight: NSFont.Weight = .regular, color: NSColor = NSColor(srgbRed: 0x1d / 255, green: 0x1d / 255, blue: 0x1f / 255, alpha: 1)) -> NSTextField {
        let l = NSTextField(wrappingLabelWithString: text)
        l.font = NSFont.systemFont(ofSize: size, weight: weight)
        l.textColor = color
        l.isSelectable = false
        return l
    }

    private func button(_ title: String, primary: Bool = false, action: Selector) -> NSButton {
        let b = NSButton(title: title, target: self, action: action)
        b.bezelStyle = .rounded
        b.font = NSFont.systemFont(ofSize: 13)
        if primary { b.keyEquivalent = "\r" }
        return b
    }

    private func iconView() -> NSImageView {
        let v = NSImageView()
        v.image = NSImage(contentsOf: Paths.icon) ?? NSApp.applicationIconImage
        v.imageScaling = .scaleProportionallyUpOrDown
        v.wantsLayer = true
        v.layer?.cornerRadius = 40 * 0.22
        v.layer?.masksToBounds = true
        v.translatesAutoresizingMaskIntoConstraints = false
        v.widthAnchor.constraint(equalToConstant: 40).isActive = true
        v.heightAnchor.constraint(equalToConstant: 40).isActive = true
        return v
    }

    private func build() {
        body.orientation = .vertical
        body.alignment = .leading
        body.spacing = 0
        body.edgeInsets = NSEdgeInsets(top: 18, left: 20, bottom: 16, right: 20)
        body.translatesAutoresizingMaskIntoConstraints = false
        let content = NSView()
        content.addSubview(body)
        window.contentView = content
        NSLayoutConstraint.activate([
            body.leadingAnchor.constraint(equalTo: content.leadingAnchor),
            body.trailingAnchor.constraint(equalTo: content.trailingAnchor),
            body.topAnchor.constraint(equalTo: content.topAnchor),
            body.bottomAnchor.constraint(equalTo: content.bottomAnchor),
            content.widthAnchor.constraint(equalToConstant: 460),
        ])

        let head = NSStackView()
        head.orientation = .horizontal
        head.alignment = .centerY
        head.spacing = 14
        head.addArrangedSubview(iconView())

        if face == .portTaken {
            // window-s5-mac: only the message, and OK at the end of the row
            let err = label("Holocron can't start. Another program is using its address (port \(Build.port)). Close that program, or restart this computer, then open Holocron again.", size: 14)
            err.preferredMaxLayoutWidth = 300
            head.addArrangedSubview(err)
            body.addArrangedSubview(head)
            let row = NSStackView()
            row.orientation = .horizontal
            row.addArrangedSubview(NSView())   // pushes OK to the end (.hw-btns.end)
            row.addArrangedSubview(button("OK", primary: true, action: #selector(okPressed)))
            body.addArrangedSubview(row)
            body.setCustomSpacing(16, after: head)
            row.translatesAutoresizingMaskIntoConstraints = false
            row.widthAnchor.constraint(equalTo: body.widthAnchor, constant: -40).isActive = true
            return
        }

        head.addArrangedSubview(label("Holocron is running.", size: 15, weight: .bold))
        body.addArrangedSubview(head)

        lead = label("Players on your Wi-Fi open:")
        lead.preferredMaxLayoutWidth = 420
        body.addArrangedSubview(lead)
        body.setCustomSpacing(14, after: head)

        addrLabel = NSTextField(labelWithString: "")
        addrLabel.font = NSFont.monospacedSystemFont(ofSize: 15, weight: .semibold)
        addrLabel.textColor = NSColor(srgbRed: 0x1d / 255, green: 0x1d / 255, blue: 0x1f / 255, alpha: 1)
        addrLabel.isSelectable = true
        let box = NSView()
        box.wantsLayer = true
        box.layer?.backgroundColor = NSColor.white.cgColor
        box.layer?.borderColor = NSColor(srgbRed: 0xcc / 255, green: 0xcc / 255, blue: 0xcc / 255, alpha: 1).cgColor
        box.layer?.borderWidth = 1
        box.layer?.cornerRadius = 5
        addrLabel.translatesAutoresizingMaskIntoConstraints = false
        box.addSubview(addrLabel)
        NSLayoutConstraint.activate([
            addrLabel.leadingAnchor.constraint(equalTo: box.leadingAnchor, constant: 8),
            addrLabel.trailingAnchor.constraint(equalTo: box.trailingAnchor, constant: -8),
            addrLabel.topAnchor.constraint(equalTo: box.topAnchor, constant: 5),
            addrLabel.bottomAnchor.constraint(equalTo: box.bottomAnchor, constant: -5),
        ])
        addrRow = NSStackView(views: [box, button("Copy", action: #selector(copyPressed))])
        addrRow.orientation = .horizontal
        addrRow.alignment = .centerY
        addrRow.spacing = 10
        body.addArrangedSubview(addrRow)
        body.setCustomSpacing(4, after: lead)

        // window-s3-mac-a: one line above the buttons
        updateText = NSTextField(labelWithString: "")
        updateText.font = NSFont.systemFont(ofSize: 13)
        let getIt = NSButton(title: "Get it", target: self, action: #selector(getItPressed))
        getIt.isBordered = false
        getIt.attributedTitle = NSAttributedString(string: "Get it", attributes: [
            .foregroundColor: NSColor(srgbRed: 0x0a / 255, green: 0x64 / 255, blue: 0xd6 / 255, alpha: 1),
            .underlineStyle: NSUnderlineStyle.single.rawValue, .font: NSFont.systemFont(ofSize: 13)])
        let line = NSStackView(views: [updateText, getIt])
        line.orientation = .horizontal
        line.spacing = 4
        line.edgeInsets = NSEdgeInsets(top: 7, left: 10, bottom: 7, right: 10)
        line.wantsLayer = true
        line.layer?.backgroundColor = NSColor(srgbRed: 0xff / 255, green: 0xf6 / 255, blue: 0xd6 / 255, alpha: 1).cgColor
        line.layer?.cornerRadius = 6
        updateBox = line
        body.addArrangedSubview(updateBox)

        let btns = NSStackView(views: [button("Open Holocron", primary: true, action: #selector(openPressed))])
        btns.orientation = .horizontal
        btns.spacing = 8
        linkSlot.orientation = .horizontal
        linkSlot.spacing = 8
        btns.addArrangedSubview(linkSlot)   // T1's place: empty, so it takes no room
        body.addArrangedSubview(btns)

        let foot = label("Close this window to stop Holocron.", size: 12, color: NSColor(srgbRed: 0x6e / 255, green: 0x6e / 255, blue: 0x73 / 255, alpha: 1))
        body.addArrangedSubview(foot)
        body.setCustomSpacing(14, after: btns)
    }

    private func refresh() {
        guard face == .running else { onChange?(); return }
        if origin.isEmpty {
            lead.stringValue = "No Wi-Fi on this computer. Connect it so players can join."   // window-s2-mac-a
            addrRow.isHidden = true
        } else {
            lead.stringValue = "Players on your Wi-Fi open:"
            addrLabel.stringValue = origin
            addrRow.isHidden = false
        }
        if let o = offer {
            updateText.stringValue = "A new version of Holocron is out (\(o.version))."
            updatePage = o.page
            updateBox.isHidden = false
        } else {
            updateBox.isHidden = true
        }
        // .hw-upd sits 12 below the address (or the lead, in S2); .hw-btns 16 below whatever is last above them
        let lastText: NSView = addrRow.isHidden ? lead : addrRow
        body.setCustomSpacing(updateBox.isHidden ? 16 : 12, after: lastText)
        body.setCustomSpacing(16, after: updateBox)
        window.layoutIfNeeded()
        window.setContentSize(window.contentView!.fittingSize)
        onChange?()
    }

    // ── actions ──
    @objc private func copyPressed() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(origin, forType: .string)
    }
    @objc private func openPressed() { onOpen?() }
    @objc private func getItPressed() { if let p = updatePage { onOpenURL?(p) } }
    @objc private func okPressed() { onClose?() }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        onClose?()
        return false   // the app decides (S4), then exits; the window is never closed on its own
    }

    // ── S4: the OS's own alert ──
    func askPlayersAtTable(_ answer: @escaping (Bool) -> Void) {
        guard alert == nil else { return }
        let a = NSAlert()
        a.messageText = "Players are at your table. Closing stops Holocron for everyone."
        a.informativeText = ""
        a.alertStyle = .warning
        // window-s4-mac-a draws the app's rounded icon above the text: the bundle's own AppIcon.icns (an alert's default
        // icon is empty when the binary is started outside LaunchServices, as the suite and a crash restart do)
        if let icns = NSImage(contentsOf: Paths.resources.appendingPathComponent("AppIcon.icns")) { a.icon = icns }
        a.addButton(withTitle: "Keep running")    // the primary, as window-s4-mac-a draws it
        a.addButton(withTitle: "Stop Holocron")
        alert = a
        onChange?()
        a.beginSheetModal(for: window) { [weak self] resp in
            self?.alert = nil
            self?.onChange?()
            answer(resp == .alertSecondButtonReturn)
        }
    }

    // ── what the suite reads (HOLOCRON_TEST_REPORT) ──
    func visibleStrings() -> [String] {
        var out: [String] = []
        func walk(_ v: NSView) {
            if v.isHidden { return }
            if let b = v as? NSButton { out.append(b.title); return }
            if let t = v as? NSTextField { if !t.stringValue.isEmpty { out.append(t.stringValue) }; return }
            v.subviews.forEach(walk)
        }
        if let c = window.contentView { walk(c) }
        return out
    }

    func pressButton(titled title: String) -> Bool {
        if let a = alert {
            if let b = a.buttons.first(where: { $0.title == title }) { b.performClick(nil); return true }
            return false
        }
        var hit: NSButton?
        func walk(_ v: NSView) {
            if v.isHidden || hit != nil { return }
            if let b = v as? NSButton, b.title == title { hit = b; return }
            v.subviews.forEach(walk)
        }
        if let c = window.contentView { walk(c) }
        hit?.performClick(nil)
        return hit != nil
    }

    /// The window as it draws itself (title bar included), and the alert sheet when one is up. A bg session has no
    /// screen-recording grant, so the suite's pictures come from here, never from a screen capture.
    func snapshot(dir: URL, name: String) {
        let targets: [(NSView?, String)] = [(window.contentView?.superview, name), (alert?.window.contentView?.superview, name + "-alert")]
        for (view, file) in targets {
            guard let v = view, let rep = v.bitmapImageRepForCachingDisplay(in: v.bounds) else { continue }
            v.cacheDisplay(in: v.bounds, to: rep)
            try? rep.representation(using: .png, properties: [:])?.write(to: dir.appendingPathComponent(file + ".png"))
        }
    }
}
