// Program.cs — the Holocron program's Windows launcher (ruling `argo-a4-launcher-build` §4.3; CONTRACT §3, ADDENDA 5-7).
//
// One window, one workerd. Start → S1/S2 (S3 when the update check finds a newer version), or S5 when 8250 is held.
// Close (the window's close button, Alt+F4, the taskbar's Close window) → S4's ask when anyone else is at a table
// (A4-C12), then workerd stops and the launcher exits. Opened again while running → S6: no second instance; the browser
// opens and the window comes forward.
//
// MECHANISM (disclosed at the gate):
// - Single instance: a named mutex, Local\Holocron-<hash of the state root> (card §4.3). A second copy that finds it
//   held sets the named event Local\Holocron-reopen-<same hash>, lets the first copy take the foreground
//   (AllowSetForegroundWindow), and exits 0; the first copy answers it as S6. Scoped to the state root, so a test run
//   never wakes a real install's copy.
// - No workerd outlives the launcher: every close road stops it first, and the kill-on-close Job Object (Server.cs)
//   ends it on every other road, Task Manager and a crash included. Signing out or shutting down stops it with no ask
//   (the OS is ending the session; nothing can keep it running).
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

static class Program
{
    static Mutex single;   // held for the process's life

    [STAThread]
    static int Main()
    {
        try { Directory.CreateDirectory(Paths.State); } catch { }
        string scope = Hash(Paths.Root.ToLowerInvariant());
        bool mine;
        single = new Mutex(true, @"Local\Holocron-" + scope, out mine);
        if (!mine)
        {
            try { mine = single.WaitOne(0); } catch (AbandonedMutexException) { mine = true; }
        }
        if (!mine)
        {
            Logger.Write("already running: asking the running copy to come forward (S6)");
            Native.AllowSetForegroundWindow(Native.ASFW_ANY);
            try
            {
                using (var ev = new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\Holocron-reopen-" + scope)) ev.Set();
            }
            catch (Exception e) { Logger.Write("S6: could not reach the running copy: " + e.Message); }
            return 0;
        }
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        var app = new App(new EventWaitHandle(false, EventResetMode.AutoReset, @"Local\Holocron-reopen-" + scope));
        Application.Run(app);
        return 0;
    }

    static string Hash(string s)
    {
        ulong h = 1469598103934665603;
        foreach (byte b in System.Text.Encoding.UTF8.GetBytes(s)) h = (h ^ b) * 1099511628211;
        return h.ToString("x");
    }
}

sealed class App : ApplicationContext
{
    readonly Control ui = new Control();      // the UI thread's door for every other thread
    readonly Server server = new Server();
    readonly LanWatch lan;
    LauncherForm win;
    bool closing;
    int reportSeq, reopens;
    readonly List<string> opened = new List<string>();
    string phase = "starting";
    System.Windows.Forms.Timer controlTimer;

    public App(EventWaitHandle reopen)
    {
        IntPtr force = ui.Handle;   // creates the handle, so BeginInvoke works before any window exists
        var listen = new Thread(delegate ()
        {
            while (true) { reopen.WaitOne(); try { ui.BeginInvoke(new Action(ComeForward)); } catch { } }
        });
        listen.IsBackground = true;
        listen.Start();
        StartControl();
        lan = new LanWatch(ui, delegate (string origin) { if (win != null) win.Origin = origin; });
        Logger.Write("Holocron " + BuildInfo.Version + " starting");
        var t = new Thread(delegate ()
        {
            Server.StartResult r = server.Start(lan);
            ui.BeginInvoke(new Action(delegate { Started(r); }));
        });
        t.IsBackground = true;
        t.Start();
    }

    void Started(Server.StartResult result)
    {
        if (result == Server.StartResult.PortTaken)
        {
            phase = "port-taken";
            Show(new LauncherForm(Face.PortTaken));
            return;
        }
        if (result == Server.StartResult.Failed)
        {
            // A4-C14: no drawn state for this; the log carries the cause and the launcher exits
            Logger.Write("start failed: " + server.FailWhy);
            phase = "failed";
            Report();
            Environment.Exit(1);
        }
        phase = "running";
        server.OnUnexpectedExit = delegate (uint code)
        {
            ui.BeginInvoke(new Action(delegate { phase = "failed"; Report(); Environment.Exit(1); }));
        };
        var w = new LauncherForm(Face.Running);
        w.Origin = lan.Origin;
        Show(w);
        lan.Start();
        OpenBrowser(Build.LocalUrl);          // the browser opens on its own at start (S1)
        UpdateCheck.Run(delegate (UpdateOffer offer) { ui.BeginInvoke(new Action(delegate { if (win != null) win.Offer = offer; })); });
    }

    void Show(LauncherForm w)
    {
        win = w;
        w.OnChange = Report;
        w.OnCloseAsked = delegate { RequestClose(delegate (bool ok) { if (ok) Shutdown(0); }); };
        w.OnOpen = delegate { OpenBrowser(Build.LocalUrl); };
        w.OnOpenUrl = OpenBrowser;
        w.FormClosing += delegate (object sender, FormClosingEventArgs e)
        {
            // the OS ending the session: stop with no ask
            if (e.CloseReason == CloseReason.WindowsShutDown) { w.AllowClose = true; Shutdown(0); }
        };
        w.Show();
        w.Activate();
        Report();
    }

    // ── S6 ──
    void ComeForward()
    {
        reopens++;
        if (phase == "running") OpenBrowser(Build.LocalUrl);
        if (win != null)
        {
            if (win.WindowState == FormWindowState.Minimized) win.WindowState = FormWindowState.Normal;
            win.Show();
            win.Activate();
            Native.SetForegroundWindow(win.Handle);
        }
        Report();
    }

    // ── close: S4 per A4-C12, then stop ──
    void RequestClose(Action<bool> answer)
    {
        if (closing || (win != null && win.AlertUp)) { answer(false); return; }   // an ask is already up: it decides
        if (phase != "running") { answer(true); return; }
        closing = true;
        var t = new Thread(delegate ()
        {
            int? n = server.Presence();
            ui.BeginInvoke(new Action(delegate
            {
                if (n == null) Logger.Write("presence unreadable: closing as if no one is at a table");
                if (n != null && n.Value >= 1 && win != null)
                {
                    closing = false;
                    win.AskPlayersAtTable(delegate (bool stop) { answer(stop); });
                }
                else { closing = false; answer(true); }
            }));
        });
        t.IsBackground = true;
        t.Start();
    }

    void Shutdown(int code)
    {
        phase = "stopping";
        Report();
        server.Stop();
        Logger.Write("Holocron stopped");
        Environment.Exit(code);
    }

    // ── the browser (A4-C7.1); under the suite, its open command ──
    void OpenBrowser(string url)
    {
        opened.Add(url);
        try
        {
            string cmd = Hooks.OpenCommand;
            if (cmd != null)
            {
                var psi = new ProcessStartInfo(cmd, Server.Quote(url));
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                Process.Start(psi);
            }
            else Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        }
        catch (Exception e) { Logger.Write("could not open " + url + ": " + e.Message); }
        Report();
    }

    // ── the suite's report and control (HOLOCRON_TEST=1 only) ──
    void Report()
    {
        string file = Hooks.ReportFile;
        if (file == null) return;
        reportSeq++;
        var states = new List<object>();
        if (win != null)
        {
            if (win.Face == Face.PortTaken) states.Add("S5");
            else
            {
                states.Add(win.Origin.Length == 0 ? "S2" : "S1");
                if (win.Offer != null) states.Add("S3");
                if (win.AlertUp) states.Add("S4");
            }
        }
        var strings = new List<object>();
        if (win != null) foreach (string x in win.VisibleStrings()) strings.Add(x);
        var openedList = new List<object>();
        foreach (string x in opened) openedList.Add(x);
        var obj = new Dictionary<string, object>();
        obj["seq"] = reportSeq;
        obj["pid"] = Native.GetCurrentProcessId();
        obj["phase"] = phase;
        obj["states"] = states;
        obj["version"] = BuildInfo.Version;
        obj["strings"] = strings;
        obj["opened"] = openedList;
        obj["reopens"] = reopens;
        obj["windowVisible"] = win != null && win.Visible && win.WindowState != FormWindowState.Minimized;
        obj["workerdPid"] = server.Pid;
        obj["internalPort"] = server.InternalPort;
        if (win != null && win.AlertUp)
        {
            var a = new Dictionary<string, object>();
            a["text"] = LauncherForm.AlertText;
            a["informative"] = "";
            a["buttons"] = new List<object>(LauncherForm.AlertButtons);
            a["primary"] = "Keep running";
            obj["alert"] = a;
        }
        Paths.WriteAtomically(file, Json.Write(obj));
        string dir = Hooks.SnapshotDir;
        if (dir != null && win != null)
        {
            var names = new List<string>();
            foreach (object x in states) names.Add((string)x);
            win.Snapshot(dir, names.Count == 0 ? phase : string.Join("+", names.ToArray()));
        }
    }

    void StartControl()
    {
        string dir = Hooks.ControlDir;
        if (dir == null) return;
        try { Directory.CreateDirectory(dir); } catch { }
        controlTimer = new System.Windows.Forms.Timer();
        controlTimer.Interval = 200;
        controlTimer.Tick += delegate { PollControl(dir); };
        controlTimer.Start();
    }

    void PollControl(string dir)
    {
        string[] files;
        try { files = Directory.GetFiles(dir, "*.cmd"); } catch { return; }
        Array.Sort(files, StringComparer.Ordinal);
        foreach (string path in files)
        {
            string text;
            try { text = File.ReadAllText(path).Trim(); File.Delete(path); } catch { continue; }
            Logger.Write("test control: " + text);
            // Run from the top of the message loop, as a click or a key would: S4's dialog runs its own loop, and a
            // command run inside this tick would nest that loop inside the tick.
            string cmd = text;
            ui.BeginInvoke(new Action(delegate
            {
                if (cmd == "close") { if (win != null) win.Close(); }                       // the close button's road: WM_CLOSE
                else if (cmd == "quit")                                                     // Alt+F4's road
                { if (win != null) Native.SendMessage(win.Handle, Native.WM_SYSCOMMAND, new IntPtr(Native.SC_CLOSE), IntPtr.Zero); }
                else if (cmd.StartsWith("click ") || cmd.StartsWith("alert "))
                {
                    string title = cmd.Substring(6);
                    if (win == null || !win.PressButton(title)) Logger.Write("test control: no button " + title);
                }
                Report();
            }));
        }
    }
}
