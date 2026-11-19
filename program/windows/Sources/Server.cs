// Server.cs — the one workerd process (A4-C11) and its lifetime (A4-C14).
//
// START: reclaim our own orphan, pre-check 8250, empty do-disk, publish lan.json, start
//   <exe dir>\server\Holocron.exe (workerd, renamed; ADDENDUM 17) serve <exe dir>\serve\holocron.capnp
//     --socket-addr http=*:8250 --socket-addr internal=127.0.0.1:<free>
//     -d site=<exe dir>\site -d state=<root>\state -d do-disk=<root>\do-disk
// then wait for the internal socket's /health. A held port is S5 and nothing starts. Any other failure writes
// state\holocron.log and the launcher exits without drawing a state (A4-C14: none is drawn).
// STOP: CTRL_C on workerd's own console, a hard TerminateProcess at 5 s, then the pid file goes.
//
// MECHANISM (disclosed at the gate):
// - workerd is a child in a kill-on-close Job Object (card §4.3): created suspended, assigned to the job, then resumed,
//   so it never runs outside it. The launcher holds the job's only handle, so any end of the launcher — a crash, Task
//   Manager, TerminateProcess — ends workerd with it (the suite's C14.job).
// - workerd gets a console of its own with no window (CREATE_NO_WINDOW), its stdout and stderr appended to
//   state\holocron.log through one inherited handle.
// - The graceful stop (`argo-a4-launcher-build` ADDENDUM 13): the launcher attaches to that console, sends
//   CTRL_C_EVENT (the C runtime's SIGINT, 2), and detaches; at 5 s TerminateProcess. workerd 1.20260722.1 has no
//   Windows drain: kj's console handler (printStackTraceOnCrash) writes `*** Received CTRL+C` to the log and lets the
//   OS end it with STATUS_CONTROL_C_EXIT (PC run 2's probe: 32 ms). A CTRL_C reaches no handler in a process whose
//   inheritable ignore-CTRL_C flag is set (CREATE_NEW_PROCESS_GROUP sets it, e.g. Node's detached spawn; the probe:
//   deaf), so Start clears that flag just before CreateProcess (workerd takes the flag's state at its creation) and
//   sets it again just after, so the launcher ignores CTRL_C for the rest of its life, its own stop's included: the
//   event reaches every process attached to the console, the sender too (ADDENDUM 14, probe case 2's measured shape;
//   a managed handler returning TRUE protected nothing, ERRATUM E-A4LB-6). Never CTRL_BREAK, which no flag blocks:
//   it ended the sender every time (ERRATUM E-A4LB-5). The log
//   reads `stopped (signal 2)` when workerd ended STATUS_CONTROL_C_EXIT after the event, `stopped (exit 0)` on 0,
//   `stopped (exit <code>)` else (ADDENDUM 7 §3).
// - The port pre-check: a TCP connect to 127.0.0.1:8250 and to [::1]:8250 (anyone answering holds the address a browser
//   reaches) and an exclusive bind of 0.0.0.0:8250 (anyone holding the wildcard, or an OS-reserved range, which refuses
//   the bind with WSAEACCES). Either way S5, never another port. A bind race lost after the pre-check reads workerd's
//   own "Address already in use" and is S5 too.
// - The orphan reclaim: state\workerd.pid names the last workerd this program started. It is ended only while that pid
//   is alive AND its image path (QueryFullProcessImageName) is this bundle's own server\Holocron.exe (Paths.Workerd; by full path, never by name, which is
//   the launcher's too), and then by
//   TerminateProcess. Anything else is left alone. A Job Object leaves no orphan by any road the OS gives it; this covers a workerd started outside one.
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

sealed class Server
{
    public enum StartResult { Running, PortTaken, Failed }

    public int Pid;
    public int InternalPort;
    public string FailWhy = "";
    public Action<uint> OnUnexpectedExit;
    IntPtr process = IntPtr.Zero;
    IntPtr job = IntPtr.Zero;
    volatile bool stopping;

    // ── A4-C14: reclaim only our own orphan ──
    public static void ReclaimOrphan()
    {
        string text;
        try { text = File.ReadAllText(Paths.PidFile).Trim(); } catch { return; }
        int pid;
        try { File.Delete(Paths.PidFile); } catch { }
        if (!int.TryParse(text, out pid) || pid <= 4) return;
        IntPtr h = Native.OpenProcess(Native.PROCESS_QUERY_LIMITED_INFORMATION | Native.PROCESS_TERMINATE | Native.SYNCHRONIZE, false, pid);
        if (h == IntPtr.Zero) return;
        try
        {
            uint code;
            if (!Native.GetExitCodeProcess(h, out code) || code != Native.STILL_ACTIVE) return;
            string exe = ImagePath(h);
            if (exe == null) return;
            if (!string.Equals(Full(exe), Full(Paths.Workerd), StringComparison.OrdinalIgnoreCase))
            {
                Logger.Write("pid file names " + pid + " (" + exe + "), not this program's workerd: left alone");
                return;
            }
            // TerminateProcess: an orphan has no launcher watching its console, and nothing here needs it to stop politely
            Logger.Write("reclaiming orphan workerd " + pid);
            Native.TerminateProcess(h, 1);
            Native.WaitForSingleObject(h, 5000);
        }
        finally { Native.CloseHandle(h); }
    }

    static string Full(string p) { try { return Path.GetFullPath(p); } catch { return p; } }

    public static string ImagePath(IntPtr h)
    {
        var b = new StringBuilder(1024);
        int n = b.Capacity;
        return Native.QueryFullProcessImageName(h, 0, b, ref n) ? b.ToString(0, n) : null;
    }

    // ── A4-C14: is 8250 free? ──
    public static bool PortHeld(int port)
    {
        if (Connects(IPAddress.Loopback, port)) return true;
        if (Socket.OSSupportsIPv6 && Connects(IPAddress.IPv6Loopback, port)) return true;
        var s = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
        try
        {
            s.ExclusiveAddressUse = true;
            s.Bind(new IPEndPoint(IPAddress.Any, port));
            return false;
        }
        catch (SocketException e)
        {
            Logger.Write("port " + port + " bind refused: " + e.SocketErrorCode + " (" + e.ErrorCode + ")");
            return true;
        }
        finally { s.Close(); }
    }

    static bool Connects(IPAddress ip, int port)
    {
        var s = new Socket(ip.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
        try
        {
            IAsyncResult r = s.BeginConnect(new IPEndPoint(ip, port), null, null);
            if (!r.AsyncWaitHandle.WaitOne(500)) return false;
            s.EndConnect(r);
            return true;
        }
        catch (Exception) { return false; }
        finally { s.Close(); }
    }

    static int FreeLoopbackPort()
    {
        var l = new TcpListener(IPAddress.Loopback, 0);
        l.Start();
        int p = ((IPEndPoint)l.LocalEndpoint).Port;
        l.Stop();
        return p;
    }

    // ── start ──
    public StartResult Start(LanWatch lan)
    {
        ReclaimOrphan();
        if (PortHeld(Build.Port)) { Logger.Write("port " + Build.Port + " is held by another program"); return StartResult.PortTaken; }

        try
        {
            if (Directory.Exists(Paths.DoDisk)) Directory.Delete(Paths.DoDisk, true);
            Directory.CreateDirectory(Paths.DoDisk);
        }
        catch (Exception e) { return Fail("could not make do-disk: " + e.Message); }
        foreach (string need in new[] { Paths.Workerd, Paths.Config })
            if (!File.Exists(need)) return Fail("missing " + need);
        if (!Directory.Exists(Paths.Site)) return Fail("missing " + Paths.Site);
        lan.PublishNow();

        InternalPort = FreeLoopbackPort();
        var args = new List<string> {
            Paths.Workerd, "serve", Paths.Config,
            "--socket-addr", "http=*:" + Build.Port,
            "--socket-addr", "internal=127.0.0.1:" + InternalPort,
            "-d", "site=" + Paths.Site,
            "-d", "state=" + Paths.State,
            "-d", "do-disk=" + Paths.DoDisk,
        };
        long logStart = 0;
        try { logStart = new FileInfo(Paths.Log).Length; } catch { }
        string why;
        if (!Spawn(args, Paths.Serve, out why)) return Fail("workerd did not start: " + why);
        Paths.WriteAtomically(Paths.PidFile, Pid + "\n");
        Logger.Write("workerd " + Pid + " started; internal 127.0.0.1:" + InternalPort);

        DateTime end = DateTime.UtcNow.AddSeconds(15);
        while (DateTime.UtcNow < end)
        {
            if (Native.WaitForSingleObject(process, 0) == Native.WAIT_OBJECT_0)
            {
                uint code; Native.GetExitCodeProcess(process, out code);
                Release();
                try { File.Delete(Paths.PidFile); } catch { }
                string tail = LogSince(logStart).ToLowerInvariant();
                if (tail.Contains("address already in use") || tail.Contains("10048")) return StartResult.PortTaken;
                return Fail("workerd exited at start (exit " + code + ")");
            }
            if (Healthy()) { WatchExit(); return StartResult.Running; }
            Thread.Sleep(100);
        }
        Stop();
        return Fail("workerd did not answer /health within 15 s");
    }

    StartResult Fail(string why) { FailWhy = why; return StartResult.Failed; }

    /// Windows' command-line quoting (the rules CommandLineToArgvW and the C runtime read back).
    public static string Quote(string a)
    {
        if (a.Length > 0 && a.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) return a;
        var b = new StringBuilder("\"");
        int slashes = 0;
        foreach (char c in a)
        {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { b.Append('\\', slashes * 2 + 1); b.Append('"'); }
            else { b.Append('\\', slashes); b.Append(c); }
            slashes = 0;
        }
        b.Append('\\', slashes * 2);
        b.Append('"');
        return b.ToString();
    }

    bool Spawn(List<string> argv, string cwd, out string why)
    {
        why = "";
        job = Native.CreateJobObject(IntPtr.Zero, null);
        if (job == IntPtr.Zero) { why = "CreateJobObject " + Marshal.GetLastWin32Error(); return false; }
        var info = new Native.JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
        info.BasicLimitInformation.LimitFlags = Native.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        if (!Native.SetInformationJobObject(job, Native.JobObjectExtendedLimitInformation, ref info, Marshal.SizeOf(typeof(Native.JOBOBJECT_EXTENDED_LIMIT_INFORMATION))))
        { why = "SetInformationJobObject " + Marshal.GetLastWin32Error(); return false; }

        var sa = new Native.SECURITY_ATTRIBUTES();
        sa.nLength = Marshal.SizeOf(typeof(Native.SECURITY_ATTRIBUTES));
        sa.bInheritHandle = true;
        Directory.CreateDirectory(Paths.State);
        IntPtr log = Native.CreateFile(Paths.Log, Native.FILE_APPEND_DATA | Native.SYNCHRONIZE, Native.FILE_SHARE_ALL, ref sa, Native.OPEN_ALWAYS, 0, IntPtr.Zero);
        IntPtr nul = Native.CreateFile("NUL", Native.GENERIC_READ, Native.FILE_SHARE_ALL, ref sa, Native.OPEN_EXISTING, 0, IntPtr.Zero);
        if (log == Native.INVALID_HANDLE_VALUE || nul == Native.INVALID_HANDLE_VALUE) { why = "log handle " + Marshal.GetLastWin32Error(); return false; }
        try
        {
            var si = new Native.STARTUPINFO();
            si.cb = Marshal.SizeOf(typeof(Native.STARTUPINFO));
            si.dwFlags = Native.STARTF_USESTDHANDLES;
            si.hStdInput = nul; si.hStdOutput = log; si.hStdError = log;
            var line = new StringBuilder();
            foreach (string a in argv) { if (line.Length > 0) line.Append(' '); line.Append(Quote(a)); }
            Native.PROCESS_INFORMATION pi;
            // CREATE_BREAKAWAY_FROM_JOB is not asked: if the launcher itself runs inside a job (a scheduled task's), the
            // new job nests inside it (Windows 8 and later), and workerd ends with either.
            // ADDENDUM 14: workerd is created with the ignore-CTRL_C flag clear, so it hears its CTRL_C; the launcher
            // sets the flag again at once, so it never hears that CTRL_C itself
            Native.SetConsoleCtrlHandler(IntPtr.Zero, false);
            bool created = Native.CreateProcess(argv[0], line, IntPtr.Zero, IntPtr.Zero, true,
                    Native.CREATE_SUSPENDED | Native.CREATE_NO_WINDOW, IntPtr.Zero, cwd, ref si, out pi);
            int createErr = Marshal.GetLastWin32Error();
            Native.SetConsoleCtrlHandler(IntPtr.Zero, true);
            if (!created) { why = "CreateProcess " + createErr; return false; }
            if (!Native.AssignProcessToJobObject(job, pi.hProcess))
            {
                why = "AssignProcessToJobObject " + Marshal.GetLastWin32Error();
                Native.TerminateProcess(pi.hProcess, 1);
                Native.CloseHandle(pi.hThread); Native.CloseHandle(pi.hProcess);
                return false;
            }
            Native.ResumeThread(pi.hThread);
            Native.CloseHandle(pi.hThread);
            process = pi.hProcess;
            Pid = pi.dwProcessId;
            return true;
        }
        finally { Native.CloseHandle(log); Native.CloseHandle(nul); }
    }

    static string LogSince(long offset)
    {
        try
        {
            using (var f = new FileStream(Paths.Log, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            {
                if (offset > f.Length) offset = 0;
                f.Seek(offset, SeekOrigin.Begin);
                return new StreamReader(f, Encoding.UTF8).ReadToEnd();
            }
        }
        catch { return ""; }
    }

    /// workerd dying while the window is up: logged, and the launcher is told (it exits; no state is drawn for it).
    void WatchExit()
    {
        IntPtr h = process;
        int pid = Pid;
        var t = new Thread(delegate ()
        {
            Native.WaitForSingleObject(h, Native.INFINITE);
            if (stopping || Pid != pid) return;
            uint code; Native.GetExitCodeProcess(h, out code);
            Pid = 0;
            try { File.Delete(Paths.PidFile); } catch { }
            Logger.Write("workerd exited unexpectedly (exit " + code + ")");
            if (OnUnexpectedExit != null) OnUnexpectedExit(code);
        });
        t.IsBackground = true;
        t.Start();
    }

    bool Healthy()
    {
        int code; string body;
        return Get("http://127.0.0.1:" + InternalPort + "/health", 1000, out code, out body) && code == 200;
    }

    // ── A4-C12: everyone a close would cut off ──
    /// null when the count cannot be read; the window treats that as no one (logged).
    public int? Presence()
    {
        int code; string body;
        if (!Get("http://127.0.0.1:" + InternalPort + "/program/presence", 2000, out code, out body) || code != 200) return null;
        try
        {
            var o = Json.Parse(body) as Dictionary<string, object>;
            int? n = Json.Int(o, "players");
            if (Json.Int(o, "v") != 1 || n == null || n < 0) return null;
            return n;
        }
        catch (Exception) { return null; }
    }

    public static bool Get(string url, int timeoutMs, out int code, out string body)
    {
        code = 0; body = "";
        try
        {
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.Proxy = null;                     // loopback only: never through a system proxy
            req.Timeout = timeoutMs;
            req.ReadWriteTimeout = timeoutMs;
            req.KeepAlive = false;
            using (var resp = (HttpWebResponse)req.GetResponse())
            using (var r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                code = (int)resp.StatusCode;
                body = r.ReadToEnd();
                return true;
            }
        }
        catch (WebException e)
        {
            var resp = e.Response as HttpWebResponse;
            if (resp == null) return false;
            code = (int)resp.StatusCode;
            resp.Close();
            return true;
        }
        catch (Exception) { return false; }
    }

    // ── a console control event, sent to one process's own console ──
    static readonly object ConsoleGate = new object();
    static bool CtrlEvent(int pid, int ev)
    {
        lock (ConsoleGate)
        {
            Native.FreeConsole();
            if (!Native.AttachConsole(pid)) return false;
            bool ok = Native.GenerateConsoleCtrlEvent(ev, 0);
            Native.FreeConsole();
            return ok;
        }
    }

    // ── stop: graceful, then hard after 5 s ──
    public void Stop()
    {
        stopping = true;
        int pid = Pid;
        IntPtr h = process;
        if (pid <= 0 || h == IntPtr.Zero) { Release(); return; }
        bool sent = CtrlEvent(pid, Native.CTRL_C_EVENT);
        if (!sent) Logger.Write("workerd " + pid + ": CTRL_C could not be sent (" + Marshal.GetLastWin32Error() + ")");
        bool gone = Native.WaitForSingleObject(h, 5000) == Native.WAIT_OBJECT_0;
        if (!gone)
        {
            Logger.Write("workerd " + pid + " did not stop in 5 s: killed");
            Native.TerminateProcess(h, 1);
            Native.WaitForSingleObject(h, 2000);
        }
        uint code;
        string end = "not reaped";
        if (Native.GetExitCodeProcess(h, out code) && code != Native.STILL_ACTIVE)
            end = (gone && sent && code == Native.STATUS_CONTROL_C_EXIT) ? "signal 2" : "exit " + code;
        try { File.Delete(Paths.PidFile); } catch { }
        // the suite's C14.graceful reads this line (`argo-a4-launcher-build` ADDENDUM 7 §3)
        Logger.Write("workerd " + pid + " stopped (" + end + ")");
        Pid = 0;
        Release();
    }

    void Release()
    {
        if (process != IntPtr.Zero) { Native.CloseHandle(process); process = IntPtr.Zero; }
        // the job handle stays open until the launcher ends: closing it is the kill
    }
}
