// Update.cs — the update check (A4-C13; `argo-a4-self-host-draft` ADDENDUM 2).
//
// At start, one GET to LATEST_URL: no body, no cookie, no query, no version. The User-Agent is exactly `Holocron` (.NET
// sends none of its own on HttpWebRequest, and never a version). 5 s timeout. An empty LATEST_URL means no GET at all.
// The answer `{"v":1,"version":"x.y.z","page":"https://…"}` shows S3 only when `version` is numerically newer than the
// program's own and `page` is https on the release host named at the build. Any failure means no line.
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;

sealed class UpdateOffer
{
    public readonly string Version; public readonly Uri Page;
    public UpdateOffer(string version, Uri page) { Version = version; Page = page; }
}

static class UpdateCheck
{
    public static void Run(Action<UpdateOffer> done)
    {
        string raw = Hooks.LatestUrl ?? Build.LatestUrl;
        string host = Hooks.ReleaseHost ?? Build.ReleaseHost;
        Uri parsed;
        if (string.IsNullOrEmpty(raw) || !Uri.TryCreate(raw, UriKind.Absolute, out parsed)) { done(null); return; }
        // no query, no fragment, no user info
        var u = new UriBuilder(parsed); u.Query = ""; u.Fragment = ""; u.UserName = ""; u.Password = "";
        Uri url = u.Uri;
        var t = new Thread(delegate ()
        {
            UpdateOffer offer = null;
            try
            {
                var req = (HttpWebRequest)WebRequest.Create(url);
                req.Method = "GET";
                req.UserAgent = "Holocron";
                req.CookieContainer = null;
                req.Credentials = null;
                req.PreAuthenticate = false;
                req.AllowAutoRedirect = false;
                req.CachePolicy = new System.Net.Cache.RequestCachePolicy(System.Net.Cache.RequestCacheLevel.NoCacheNoStore);
                req.Timeout = 5000;
                req.ReadWriteTimeout = 5000;
                req.KeepAlive = false;
                using (var resp = (HttpWebResponse)req.GetResponse())
                using (var r = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
                {
                    if (resp.StatusCode == HttpStatusCode.OK) offer = Judge(r.ReadToEnd(), BuildInfo.Version, host);
                }
            }
            catch (Exception) { offer = null; }
            if (offer == null) Logger.Write("update check: no line");
            done(offer);
        });
        t.IsBackground = true;
        t.Start();
    }

    public static UpdateOffer Judge(string text, string own, string releaseHost)
    {
        Dictionary<string, object> o;
        try { o = Json.Parse(text) as Dictionary<string, object>; } catch (Exception) { return null; }
        if (o == null || Json.Int(o, "v") != 1) return null;
        string version = Json.Text(o, "version");
        int[] theirs = Numbers(version), mine = Numbers(own);
        if (theirs == null || mine == null || !Newer(theirs, mine)) return null;
        string pageText = Json.Text(o, "page");
        Uri page;
        if (pageText == null || !Uri.TryCreate(pageText, UriKind.Absolute, out page)) return null;
        if (page.Scheme != "https" || string.IsNullOrEmpty(releaseHost) || !string.Equals(page.Host, releaseHost, StringComparison.OrdinalIgnoreCase)) return null;
        return new UpdateOffer(version, page);
    }

    public static int[] Numbers(string v)
    {
        if (v == null) return null;
        string[] parts = v.Split('.');
        if (parts.Length != 3) return null;
        int[] n = new int[3];
        for (int i = 0; i < 3; i++)
        {
            if (parts[i].Length == 0) return null;
            foreach (char c in parts[i]) if (c < '0' || c > '9') return null;
            if (!int.TryParse(parts[i], out n[i])) return null;
        }
        return n;
    }

    public static bool Newer(int[] a, int[] b)
    {
        for (int i = 0; i < 3; i++) if (a[i] != b[i]) return a[i] > b[i];
        return false;
    }
}
