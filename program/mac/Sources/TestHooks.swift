// TestHooks.swift — the conformance suite's hooks (ruling `argo-a4-launcher-build` §3, "One conformance suite").
//
// EVERY HOOK EXISTS ONLY UNDER HOLOCRON_TEST=1. Without it each accessor below answers nil and the launcher runs exactly
// as shipped. The hooks:
//   HOLOCRON_TEST_OPEN          an executable run as `<it> <url>` in place of the default browser (the browser-open command)
//   HOLOCRON_TEST_LATEST_URL    replaces Build.latestURL (A4-C13); set and empty = the shipped empty-URL road
//   HOLOCRON_TEST_RELEASE_HOST  replaces Build.releaseHost, so a fixture's `page` can pass the host check
//   HOLOCRON_TEST_REPORT        a file the launcher rewrites (write, then rename) at every change: the window's state and
//                               its visible strings
//   HOLOCRON_TEST_CONTROL       a directory of command files the launcher consumes: `close` (the window's close, the same
//                               road as its close button), `quit` (⌘Q's road), `click <title>`, `alert <title>`
//   HOLOCRON_TEST_STATE         the root holding state/ and do-disk/, so a run never touches a real install
//   HOLOCRON_TEST_LAN           a file whose text stands in for the default route's IPv4 (empty = none); the RFC 1918
//                               filter still applies. Absent file = the system's own answer.
//   HOLOCRON_TEST_SNAPSHOT      a directory the launcher draws its own window into (PNG), at every change
import Foundation

enum Hooks {
    static let on = ProcessInfo.processInfo.environment["HOLOCRON_TEST"] == "1"
    private static func env(_ key: String) -> String? { on ? ProcessInfo.processInfo.environment[key] : nil }

    static var openCommand: String? { env("HOLOCRON_TEST_OPEN") }
    static var latestURL: String? { env("HOLOCRON_TEST_LATEST_URL") }
    static var releaseHost: String? { env("HOLOCRON_TEST_RELEASE_HOST") }
    static var reportFile: String? { env("HOLOCRON_TEST_REPORT") }
    static var controlDir: String? { env("HOLOCRON_TEST_CONTROL") }
    static var stateRoot: String? { env("HOLOCRON_TEST_STATE") }
    static var lanFile: String? { env("HOLOCRON_TEST_LAN") }
    static var snapshotDir: String? { env("HOLOCRON_TEST_SNAPSHOT") }
}
