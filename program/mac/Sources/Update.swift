// Update.swift — the update check (A4-C13; `argo-a4-self-host-draft` ADDENDUM 2).
//
// At start, one GET to LATEST_URL: no body, no cookie, no query, no version. The User-Agent is exactly `Holocron` (the
// OS default would carry CFNetwork's and Darwin's versions). 5 s timeout. An empty LATEST_URL means no GET at all.
// The answer `{"v":1,"version":"x.y.z","page":"https://…"}` shows S3 only when `version` is numerically newer than the
// program's own and `page` is https on the release host named at the build. Any failure means no line.
import Foundation

struct UpdateOffer { let version: String; let page: URL }

enum UpdateCheck {
    static func run(_ done: @escaping (UpdateOffer?) -> Void) {
        let raw = Hooks.latestURL ?? Build.latestURL
        let host = Hooks.releaseHost ?? Build.releaseHost
        guard !raw.isEmpty, var comps = URLComponents(string: raw) else { done(nil); return }
        comps.query = nil
        comps.fragment = nil
        comps.user = nil
        comps.password = nil
        guard let url = comps.url else { done(nil); return }

        let cfg = URLSessionConfiguration.ephemeral
        cfg.httpShouldSetCookies = false
        cfg.httpCookieAcceptPolicy = .never
        cfg.httpCookieStorage = nil
        cfg.urlCredentialStorage = nil
        cfg.urlCache = nil
        cfg.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        cfg.timeoutIntervalForRequest = 5
        cfg.timeoutIntervalForResource = 5
        cfg.httpAdditionalHeaders = ["User-Agent": "Holocron"]
        let session = URLSession(configuration: cfg)
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.httpShouldHandleCookies = false
        req.setValue("Holocron", forHTTPHeaderField: "User-Agent")
        session.dataTask(with: req) { data, resp, err in
            session.finishTasksAndInvalidate()
            var offer: UpdateOffer? = nil
            if err == nil, let h = resp as? HTTPURLResponse, h.statusCode == 200, let data = data {
                offer = judge(data, own: Program.version, releaseHost: host)
            }
            if offer == nil { Log.write("update check: no line") }
            DispatchQueue.main.async { done(offer) }
        }.resume()
    }

    static func judge(_ data: Data, own: String, releaseHost: String) -> UpdateOffer? {
        guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              (obj["v"] as? Int) == 1,
              let version = obj["version"] as? String, let theirs = numbers(version),
              let mine = numbers(own), newer(theirs, than: mine),
              let pageText = obj["page"] as? String, let page = URL(string: pageText),
              page.scheme == "https", !releaseHost.isEmpty, page.host?.lowercased() == releaseHost.lowercased()
        else { return nil }
        return UpdateOffer(version: version, page: page)
    }

    static func numbers(_ v: String) -> [Int]? {
        let parts = v.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3 else { return nil }
        let n = parts.compactMap { p -> Int? in p.allSatisfy(\.isNumber) && !p.isEmpty ? Int(p) : nil }
        return n.count == 3 ? n : nil
    }

    static func newer(_ a: [Int], than b: [Int]) -> Bool {
        for i in 0..<3 where a[i] != b[i] { return a[i] > b[i] }
        return false
    }
}
