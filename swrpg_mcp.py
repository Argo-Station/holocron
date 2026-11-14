#!/usr/bin/env python3
"""swrpg_mcp — MCP server entry point.

Exposes swrpg_index retrieval tools to MCP-compatible agents
(Claude Desktop, Claude Code, etc.).

    python3 swrpg_mcp.py                                # stdio (legacy / spawned-child)
    python3 swrpg_mcp.py --transport http               # streamable-http on 127.0.0.1:8765
    python3 swrpg_mcp.py --transport http --port 9000   # custom port

For Claude Desktop integration and launchd service setup, see
Docs/MCP_INTEGRATION.md.
"""
import argparse
from swrpg_index.mcp_server import run

if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--transport', choices=['stdio', 'http'], default='stdio')
    ap.add_argument('--host', default='127.0.0.1')
    ap.add_argument('--port', type=int, default=8765)
    args = ap.parse_args()
    run(transport=args.transport, host=args.host, port=args.port)
