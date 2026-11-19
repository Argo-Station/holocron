// Paths.cs — the build's fixed values (§3), where the program keeps things (A4-C11's directories) and its one log
// (A4-C14).
//
// A4-C8:  the program's port is 8250, TCP, on every OS, never changed between releases.
// A4-C13: LATEST_URL and the release host are BUILD CONSTANTS, empty in every build until the end-goal refresh. An empty
//         LATEST_URL means no GET at all (D-609). The packaging card names the host and the file.
// The program's version is the site's release version at its build (package.json `version`): build.mjs writes it into
// BuildInfo.g.cs (BuildInfo.Version), never into this file.
//
//   <exe dir>\Holocron.exe                    the launcher
//   <exe dir>\server\Holocron.exe             the server: npm @cloudflare/workerd-windows-64's workerd.exe, pinned, the
//                                             same bytes renamed, so Windows' firewall names it holocron.exe, not
//                                             workerd.exe (`argo-a4-launcher-build` ADDENDUM 17 (iv)); its own folder,
//                                             so its full path is never the launcher's
//   <exe dir>\serve\holocron.capnp            the one config file; <exe dir>\site\ is the built site, read-only
//   <root>\state\     the launcher's: lan.json, workerd.pid, holocron.log. Read-only to workerd.
//   <root>\do-disk\   the tables' storage, emptied at each start (D-524 b4, D-621 b1).
// <root> is %LOCALAPPDATA%\Holocron, or HOLOCRON_TEST_STATE under the suite.
using System;
using System.IO;
using System.Text;
using System.Threading;

static class Build
{
    public const int Port = 8250;
    public const string LatestUrl = "";
    public const string ReleaseHost = "";
    /// What the GM's browser opens (A4-C7.1): the loopback origin, never the LAN address.
    public static string LocalUrl { get { return "http://localhost:" + Port + "/"; } }
}

static class Paths
{
    public static readonly string Root = Hooks.StateRoot != null ? Path.GetFullPath(Hooks.StateRoot)
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Holocron");
    public static readonly string State = Path.Combine(Root, "state");
    public static readonly string DoDisk = Path.Combine(Root, "do-disk");
    public static readonly string LanJson = Path.Combine(State, "lan.json");
    public static readonly string PidFile = Path.Combine(State, "workerd.pid");
    public static readonly string Log = Path.Combine(State, "holocron.log");

    public static readonly string ExeDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
    public static readonly string Workerd = Path.Combine(Path.Combine(ExeDir, "server"), "Holocron.exe");
    public static readonly string Serve = Path.Combine(ExeDir, "serve");
    public static readonly string Config = Path.Combine(Serve, "holocron.capnp");
    public static readonly string Site = Path.Combine(ExeDir, "site");
    public static readonly string IconPng = Path.Combine(ExeDir, "icon.png");

    /// Write, then rename: a reader never sees half a file (A4-C11's lan.json; the test report). A reader holding the file
    /// open (workerd's disk service, the suite) can refuse the rename for a moment, so it is retried.
    public static void WriteAtomically(string path, string text)
    {
        string tmp = Path.Combine(Path.GetDirectoryName(path), "." + Path.GetFileName(path) + "." + Native.GetCurrentProcessId() + ".tmp");
        try
        {
            File.WriteAllBytes(tmp, new UTF8Encoding(false).GetBytes(text));
            for (int i = 0; i < 25; i++)
            {
                if (Native.MoveFileEx(tmp, path, Native.MOVEFILE_REPLACE_EXISTING | Native.MOVEFILE_WRITE_THROUGH)) return;
                Thread.Sleep(20);
            }
            Logger.Write("could not replace " + Path.GetFileName(path));
            try { File.Delete(tmp); } catch { }
        }
        catch (Exception e) { Logger.Write("could not write " + Path.GetFileName(path) + ": " + e.Message); }
    }
}

static class Logger
{
    static readonly object Gate = new object();

    public static void Write(string line)
    {
        string text = DateTime.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'") + " " + line + "\n";
        lock (Gate)
        {
            try
            {
                Directory.CreateDirectory(Paths.State);
                // workerd appends to the same file through its inherited handle, so both share it
                using (var f = new FileStream(Paths.Log, FileMode.Append, FileAccess.Write, FileShare.ReadWrite | FileShare.Delete))
                {
                    byte[] b = Encoding.UTF8.GetBytes(text);
                    f.Write(b, 0, b.Length);
                }
            }
            catch { }
        }
    }
}
