// TestHooks.cs — the conformance suite's hooks (ruling `argo-a4-launcher-build` §3, ADDENDUM 6). Their meaning is the
// Mac build's (program/mac/Sources/TestHooks.swift); program/conformance/run.mjs is their guard.
//
// EVERY HOOK EXISTS ONLY UNDER HOLOCRON_TEST=1. Without it each accessor below answers null and the launcher runs exactly
// as shipped. The hooks:
//   HOLOCRON_TEST_OPEN          an executable run as `<it> <url>` in place of the default browser (the browser-open command)
//   HOLOCRON_TEST_LATEST_URL    replaces Build.LatestUrl (A4-C13); set and empty = the shipped empty-URL road
//   HOLOCRON_TEST_RELEASE_HOST  replaces Build.ReleaseHost, so a fixture's `page` can pass the host check
//   HOLOCRON_TEST_REPORT        a file the launcher rewrites (write, then rename) at every change: the window's state and
//                               its visible strings
//   HOLOCRON_TEST_CONTROL       a directory of command files the launcher consumes: `close` (the window's close, WM_CLOSE,
//                               the road of its close button), `quit` (Alt+F4's road, WM_SYSCOMMAND SC_CLOSE),
//                               `click <title>`, `alert <title>`
//   HOLOCRON_TEST_STATE         the root holding state\ and do-disk\, so a run never touches a real install
//   HOLOCRON_TEST_LAN           a file whose text stands in for the default route's IPv4 (empty = none); the RFC 1918
//                               filter still applies. Absent file = the system's own answer.
//   HOLOCRON_TEST_SNAPSHOT      a directory the launcher draws its own window into (PNG), at every change
using System;

static class Hooks
{
    public static readonly bool On = Environment.GetEnvironmentVariable("HOLOCRON_TEST") == "1";

    static string Env(string key) { return On ? Environment.GetEnvironmentVariable(key) : null; }

    public static string OpenCommand { get { return Env("HOLOCRON_TEST_OPEN"); } }
    public static string LatestUrl { get { return Env("HOLOCRON_TEST_LATEST_URL"); } }
    public static string ReleaseHost { get { return Env("HOLOCRON_TEST_RELEASE_HOST"); } }
    public static string ReportFile { get { return Env("HOLOCRON_TEST_REPORT"); } }
    public static string ControlDir { get { return Env("HOLOCRON_TEST_CONTROL"); } }
    public static string StateRoot { get { return Env("HOLOCRON_TEST_STATE"); } }
    public static string LanFile { get { return Env("HOLOCRON_TEST_LAN"); } }
    public static string SnapshotDir { get { return Env("HOLOCRON_TEST_SNAPSHOT"); } }
}
