// Lan.cs — the players' address (A4-C7.2) and the watch that keeps it true (A4-C11).
//
// MECHANISM (disclosed at the gate): the address is the IPv4 of the default route's interface — GetBestInterface's
// answer for a public destination, a routing-table lookup that sends nothing — when that address is RFC 1918 (10/8,
// 172.16/12, 192.168/16). Anything else, or no route, publishes "". One address, never a choice shown to the GM.
// The watch: NetworkChange.NetworkAddressChanged, plus a 5 s backstop poll (A4-C11: ≤ 10 s). Each pass rewrites
// state\lan.json (write, then rename) only when the origin changed, and tells the window.
using System;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;

static class Lan
{
    public static bool IsPrivate(string ip)
    {
        string[] parts = (ip ?? "").Split('.');
        if (parts.Length != 4) return false;
        int[] p = new int[4];
        for (int i = 0; i < 4; i++)
        {
            if (parts[i].Length == 0 || parts[i].Length > 3) return false;
            foreach (char c in parts[i]) if (c < '0' || c > '9') return false;
            p[i] = int.Parse(parts[i]);
            if (p[i] > 255) return false;
        }
        if (p[0] == 10) return true;
        if (p[0] == 172 && p[1] >= 16 && p[1] <= 31) return true;
        if (p[0] == 192 && p[1] == 168) return true;
        return false;
    }

    /// The candidate address before the RFC 1918 filter: the test file's text, or the default route's IPv4.
    public static string Candidate()
    {
        string f = Hooks.LanFile;
        if (f != null && File.Exists(f))
        {
            try { return File.ReadAllText(f).Trim(); } catch { return ""; }
        }
        try
        {
            int index;
            // 8.8.8.8 as the lookup's destination, in network order: only the route table is read
            if (Native.GetBestInterface(BitConverter.ToUInt32(new byte[] { 8, 8, 8, 8 }, 0), out index) != 0) return "";
            string first = "";
            foreach (NetworkInterface ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up) continue;
                IPInterfaceProperties props = ni.GetIPProperties();
                IPv4InterfaceProperties v4;
                try { v4 = props.GetIPv4Properties(); } catch (NetworkInformationException) { continue; }
                if (v4 == null || v4.Index != index) continue;
                foreach (UnicastIPAddressInformation a in props.UnicastAddresses)
                {
                    if (a.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                    string s = a.Address.ToString();
                    if (IsPrivate(s)) return s;
                    if (first.Length == 0) first = s;
                }
            }
            return first;
        }
        catch (Exception) { return ""; }
    }

    public static string Origin()
    {
        string ip = Candidate();
        return IsPrivate(ip) ? "http://" + ip + ":" + Build.Port : "";
    }
}

sealed class LanWatch
{
    public string Origin = "";
    readonly Action<string> onChange;
    readonly System.Windows.Forms.Control ui;
    System.Windows.Forms.Timer timer;

    public LanWatch(System.Windows.Forms.Control ui, Action<string> onChange) { this.ui = ui; this.onChange = onChange; }

    /// Computes and writes lan.json once; called before workerd starts so the router's first answer is already true.
    public void PublishNow()
    {
        Origin = Lan.Origin();
        Write();
    }

    public void Start()
    {
        NetworkChange.NetworkAddressChanged += delegate { try { ui.BeginInvoke(new Action(Check)); } catch { } };
        timer = new System.Windows.Forms.Timer();
        timer.Interval = 5000;
        timer.Tick += delegate { Check(); };
        timer.Start();
    }

    public void Check()
    {
        string now = Lan.Origin();
        if (now == Origin) return;
        Logger.Write("lan: " + (Origin.Length == 0 ? "none" : Origin) + " -> " + (now.Length == 0 ? "none" : now));
        Origin = now;
        Write();
        onChange(now);
    }

    void Write()
    {
        // The contract's own shape, key order included; the origin holds only [0-9a-z.:/] so it needs no escaping.
        Paths.WriteAtomically(Paths.LanJson, "{\"v\":1,\"origin\":\"" + Origin + "\"}");
    }
}
