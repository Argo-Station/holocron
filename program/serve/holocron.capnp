# holocron.capnp — the Holocron PROGRAM's one workerd config (ruling `argo-a4-launcher-build` §3 A4-C11; card §4.1).
# One process serves this computer's Holocron and its table on one address. program/build.mjs copies this file and
# router.js beside the table server's bundle (table/index.js) into program/out/serve/; the launcher starts
#
#   workerd serve <out>/serve/holocron.capnp -d site=<out>/site -d state=<state dir> -d do-disk=<empty dir>
#                 -s internal=127.0.0.1:<a free port picked at each start>
#
#   http      *:8250, every IPv4 interface (A4-C8: the port never changes; A4-C7.5, A4-C9) → the router
#   internal  127.0.0.1:<free>, the table server direct: its /health and /program/presence (A4-C12) are read here, never
#             through the site's origin. The 0 below is only a placeholder; the launcher always passes -s internal=…
#   site      the program's built site (program/out/site/), read-only
#   state     the launcher's directory (its lan.json), read-only to workerd
#   do-disk   the tables' storage; the launcher empties it at each start (D-524 b4, D-621 b1)
#
# The table worker is table-server/'s bundle, unchanged, plus a PRESENCE namespace that no online config binds.

using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "router", worker = .routerWorker),
    (name = "table", worker = .tableWorker),
    (name = "site", disk = (path = "site", writable = false)),
    (name = "state", disk = (path = "state", writable = false)),
    (name = "do-disk", disk = (path = "do-disk", writable = true)),
  ],
  sockets = [
    (name = "http", address = "*:8250", http = (), service = "router"),
    (name = "internal", address = "127.0.0.1:0", http = (), service = "table"),
  ],
);

const routerWorker :Workerd.Worker = (
  modules = [(name = "router.js", esModule = embed "router.js")],
  compatibilityDate = "2026-07-24",
  bindings = [
    (name = "TABLE_SERVER", service = "table"),
    (name = "SITE", service = "site"),
    (name = "STATE", service = "state"),
  ],
);

const tableWorker :Workerd.Worker = (
  modules = [(name = "index.js", esModule = embed "table/index.js")],
  compatibilityDate = "2026-07-24",
  durableObjectNamespaces = [
    (className = "Table", uniqueKey = "holocron-table-server-Table", enableSql = true),
    (className = "Listing", uniqueKey = "holocron-table-server-Listing", enableSql = true),
    (className = "Code", uniqueKey = "holocron-table-server-Code", enableSql = true),
    (className = "Presence", uniqueKey = "holocron-program-Presence", enableSql = true),
  ],
  durableObjectStorage = (localDisk = "do-disk"),
  bindings = [
    (name = "TABLE", durableObjectNamespace = "Table"),
    (name = "LISTING", durableObjectNamespace = "Listing"),
    (name = "CODE", durableObjectNamespace = "Code"),
    (name = "PRESENCE", durableObjectNamespace = "Presence"),
  ],
);
