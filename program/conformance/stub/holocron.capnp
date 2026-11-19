# stub/holocron.capnp — the conformance suite's STAND-IN for program/serve/holocron.capnp (argo-a4-program-serve, §4.1),
# used only until that card merges (ruling `argo-a4-launcher-build` §4.2). It keeps A4-C11's interface exactly — the
# socket names http and internal, the directory names site, state and do-disk — so the launcher cannot tell the two
# apart. Behind it: the measured harness (scripts/argo_a4/router.js, the table bundle unchanged) and a STUB presence
# (inner.js), whose count the suite sets in state/stub_presence.json. Never shipped.

using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "router", worker = .routerWorker),
    (name = "inner", worker = .innerWorker),
    (name = "table", worker = .tableWorker),
    (name = "site", disk = (path = "site", writable = false)),
    (name = "state", disk = (path = "state", writable = false)),
    (name = "do-disk", disk = (path = "do-disk", writable = true)),
  ],
  sockets = [
    (name = "http", address = "127.0.0.1:8250", http = (), service = "router"),
    (name = "internal", address = "127.0.0.1:0", http = (), service = "inner"),
  ],
);

const routerWorker :Workerd.Worker = (
  modules = [
    (name = "router.js", esModule = embed "router.js"),
    (name = "harness_router.js", esModule = embed "harness_router.js"),
  ],
  compatibilityDate = "2026-07-24",
  bindings = [
    (name = "TABLE_SERVER", service = "table"),
    (name = "SITE", service = "site"),
    (name = "STATE", service = "state"),
  ],
);

const innerWorker :Workerd.Worker = (
  modules = [(name = "inner.js", esModule = embed "inner.js")],
  compatibilityDate = "2026-07-24",
  bindings = [
    (name = "TABLE_SERVER", service = "table"),
    (name = "STATE", service = "state"),
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
