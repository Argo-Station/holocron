# table.capnp — the table server under workerd, Cloudflare's open-source runtime (ARGO A4, ruling
# `argo-a4-table-spike` §4 step 2). The run kit's config: run_table.mjs copies this file and the dry-run bundle into a
# run directory and starts `workerd serve` on it, so nothing here names a machine path.
#
#   bundle/index.js   the output of `npx wrangler deploy --dry-run` from table-server/, unchanged (A4-C6: one commit)
#   do-disk           Durable Object storage on local disk; run_table.mjs points it at --storage with -d do-disk=<dir>
#   http              the listening socket; run_table.mjs sets it with -s http=<host>:<port> (8790 by the card)
#
# The three namespaces mirror table-server/wrangler.jsonc: Table, Listing and Code, each SQLite-backed (`enableSql`).
# No vars: TEST_EMPTY_MS is never set, so the alarm is the shipped 30 minutes (deploy_shape F5's rule, held here too).

using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "table", worker = .tableWorker),
    (name = "do-disk", disk = (path = "do-storage", writable = true)),
  ],
  sockets = [
    (name = "http", address = "127.0.0.1:8790", http = (), service = "table"),
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
