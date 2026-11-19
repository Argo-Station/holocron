# site.capnp — A4-C4 MEASURED, NOT BUILT (ruling `argo-a4-table-spike` §4 step 2): can ONE workerd process answer the
# built site from disk AND the table server on the same port, with exactly /t routed to the table server?
# This is a measurement for the launcher card, which chooses the program's mechanism; nothing ships from it.
#
#   http      the one public socket (run_table.mjs --port; 3102 by the card) → the router
#   internal  the table server's own address (run_table.mjs --internal-port, default 8790): the launcher reads /health
#             here, never through the site's origin (A4-C4)
#   site      a read-only disk service over the built tree (run_table.mjs --site <root>, as -d site=<root>)
#
# The table worker is table.capnp's, unchanged: the same bundle, namespaces, storage and compatibility date.

using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "router", worker = .routerWorker),
    (name = "table", worker = .tableWorker),
    (name = "site", disk = (path = "site-root", writable = false)),
    (name = "do-disk", disk = (path = "do-storage", writable = true)),
  ],
  sockets = [
    (name = "http", address = "127.0.0.1:3102", http = (), service = "router"),
    (name = "internal", address = "127.0.0.1:8790", http = (), service = "table"),
  ],
);

const routerWorker :Workerd.Worker = (
  modules = [(name = "router.js", esModule = embed "router.js")],
  compatibilityDate = "2026-07-24",
  bindings = [
    (name = "TABLE_SERVER", service = "table"),
    (name = "SITE", service = "site"),
  ],
);

const tableWorker :Workerd.Worker = (
  modules = [
    (name = "index.js", esModule = embed "bundle/index.js"),
  ],
  compatibilityDate = "2026-07-24",
  durableObjectNamespaces = [
    (className = "Table", uniqueKey = "holocron-table-server-Table", enableSql = true),
    (className = "Listing", uniqueKey = "holocron-table-server-Listing", enableSql = true),
    (className = "Code", uniqueKey = "holocron-table-server-Code", enableSql = true),
  ],
  durableObjectStorage = (localDisk = "do-disk"),
  bindings = [
    (name = "TABLE", durableObjectNamespace = "Table"),
    (name = "LISTING", durableObjectNamespace = "Listing"),
    (name = "CODE", durableObjectNamespace = "Code"),
  ],
);
