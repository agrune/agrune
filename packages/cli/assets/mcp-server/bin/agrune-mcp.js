#!/usr/bin/env node
import { createRequire } from 'module'; const require = createRequire(import.meta.url);

// bin/agrune-mcp.ts
import { spawn } from "child_process";
import { createServer as createNetServer, connect as netConnect } from "net";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
var args = process.argv.slice(2);
var AGRUNE_HOME = join(homedir(), ".agrune");
var PORT_FILE = join(AGRUNE_HOME, "port");
var { BACKEND_HOST, BACKEND_PORT } = await import("../backend-protocol-5N7EHCTD.js");
if (args[0] === "--native-host") {
  let connectToBackend = function() {
    const port = readBackendPort();
    handshakeComplete = false;
    sockBuffer = "";
    const newSock = netConnect(port, BACKEND_HOST);
    sock = newSock;
    newSock.setEncoding("utf8");
    newSock.on("connect", () => {
      newSock.write(JSON.stringify({ type: "backend_handshake", role: "native-host" }) + "\n");
    });
    newSock.on("data", (chunk) => {
      sockBuffer += chunk;
      const lines = sockBuffer.split("\n");
      sockBuffer = lines.pop();
      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === "backend_ready") {
              handshakeComplete = true;
              process.stderr.write(`[agrune native-host] connected to backend on port ${port}
`);
              continue;
            }
            if (parsed.type === "backend_error") {
              process.stderr.write(`[agrune native-host] backend error: ${parsed.message}
`);
              continue;
            }
            nativeTransport.send(parsed);
          } catch {
          }
        }
      }
    });
    newSock.on("error", (err) => {
      process.stderr.write(`[agrune native-host] connection error: ${err.message}
`);
    });
    newSock.on("close", () => {
      process.stderr.write("[agrune native-host] disconnected from backend, reconnecting...\n");
      handshakeComplete = false;
      sock = null;
      scheduleReconnect();
    });
  }, scheduleReconnect = function() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectToBackend();
    }, RECONNECT_INTERVAL_MS);
  };
  connectToBackend2 = connectToBackend, scheduleReconnect2 = scheduleReconnect;
  const { createNativeMessagingTransport } = await import("../native-messaging-7DFDIQRA.js");
  const nativeTransport = createNativeMessagingTransport(process.stdin, process.stdout);
  let sock = null;
  let handshakeComplete = false;
  let sockBuffer = "";
  let reconnectTimer = null;
  const RECONNECT_INTERVAL_MS = 2e3;
  nativeTransport.onMessage((msg) => {
    if (!handshakeComplete || !sock) {
      process.stderr.write("[agrune native-host] backend not ready, dropping message\n");
      return;
    }
    sock.write(JSON.stringify(msg) + "\n");
  });
  connectToBackend();
  process.stdin.resume();
} else if (args[0] === "--backend-daemon") {
  const { AgagruneBackend } = await import("../backend-ZKPJUGPU.js");
  const backend = new AgagruneBackend();
  let nativeSocket = null;
  const tcpServer = createNetServer((client) => {
    client.setEncoding("utf8");
    let buffer = "";
    let role = null;
    const detachNativeSocket = () => {
      if (nativeSocket === client) {
        nativeSocket = null;
        backend.setNativeSender(null);
        process.stderr.write("[agrune-backend] native host disconnected\n");
      }
    };
    client.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch {
          continue;
        }
        if (!role) {
          if (parsed.type !== "backend_handshake" || parsed.role !== "agent-client" && parsed.role !== "native-host") {
            client.write(JSON.stringify({ type: "backend_error", message: "backend handshake required" }) + "\n");
            client.destroy();
            return;
          }
          role = parsed.role;
          client.write(JSON.stringify({ type: "backend_ready", role }) + "\n");
          if (role === "native-host") {
            if (nativeSocket && nativeSocket !== client) {
              nativeSocket.destroy();
            }
            nativeSocket = client;
            backend.setNativeSender((msg) => {
              if (!client.destroyed) {
                client.write(JSON.stringify(msg) + "\n");
              }
            });
            process.stderr.write("[agrune-backend] native host connected\n");
          }
          continue;
        }
        if (role === "native-host") {
          backend.handleNativeMessage(parsed);
          continue;
        }
        if (parsed.type !== "agent_request" || typeof parsed.requestId !== "string" || typeof parsed.name !== "string") {
          client.write(JSON.stringify({ type: "backend_error", message: "invalid agent request" }) + "\n");
          continue;
        }
        void backend.handleToolCall(parsed.name, asRecord(parsed.args)).then((result) => {
          if (!client.destroyed) {
            client.write(JSON.stringify({
              type: "agent_response",
              requestId: parsed.requestId,
              ...result
            }) + "\n");
          }
        }).catch((error) => {
          if (!client.destroyed) {
            client.write(JSON.stringify({
              type: "agent_response",
              requestId: parsed.requestId,
              text: error instanceof Error ? error.message : String(error),
              isError: true
            }) + "\n");
          }
        });
      }
    });
    client.on("close", detachNativeSocket);
    client.on("error", detachNativeSocket);
  });
  tcpServer.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      process.stderr.write(`[agrune-backend] already running on ${BACKEND_HOST}:${BACKEND_PORT}
`);
      process.exit(0);
    }
    throw error;
  });
  await new Promise((resolve, reject) => {
    tcpServer.once("error", reject);
    tcpServer.listen(BACKEND_PORT, BACKEND_HOST, () => {
      tcpServer.off("error", reject);
      mkdirSync(AGRUNE_HOME, { recursive: true });
      writeFileSync(PORT_FILE, String(BACKEND_PORT));
      process.stderr.write(`[agrune-backend] listening on ${BACKEND_HOST}:${BACKEND_PORT}
`);
      resolve();
    });
  });
  const IDLE_TIMEOUT_MS = 10 * 60 * 1e3;
  const shutdown = () => {
    process.stderr.write("[agrune-backend] idle timeout \u2014 shutting down\n");
    tcpServer.close();
    process.exit(0);
  };
  let idleTimer = setTimeout(shutdown, IDLE_TIMEOUT_MS);
  backend.onActivity = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(shutdown, IDLE_TIMEOUT_MS);
  };
} else {
  const { StdioServerTransport } = await import("../stdio-BZMG3GZC.js");
  const { McpServer } = await import("../mcp-3AA7OIIV.js");
  const { createBackendClient } = await import("../backend-client-3UC4NMM2.js");
  const { registerAgagruneTools } = await import("../mcp-tools-VQHON2U3.js");
  const mcp = new McpServer(
    { name: "agrune", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );
  async function callToolWithReconnect(name, toolArgs) {
    try {
      const client = createBackendClient({ host: BACKEND_HOST, port: readBackendPort() });
      return await client.callTool(name, toolArgs);
    } catch {
      await ensureBackendDaemon();
      const client = createBackendClient({ host: BACKEND_HOST, port: readBackendPort() });
      return client.callTool(name, toolArgs);
    }
  }
  registerAgagruneTools(mcp, callToolWithReconnect);
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
}
var connectToBackend2;
var scheduleReconnect2;
function readBackendPort() {
  if (!existsSync(PORT_FILE)) {
    return BACKEND_PORT;
  }
  const parsed = parseInt(readFileSync(PORT_FILE, "utf-8").trim(), 10);
  return Number.isFinite(parsed) ? parsed : BACKEND_PORT;
}
async function ensureBackendDaemon() {
  const { createBackendClient } = await import("../backend-client-3UC4NMM2.js");
  const backendClient = createBackendClient({ host: BACKEND_HOST, port: readBackendPort(), timeoutMs: 500 });
  try {
    await backendClient.ping();
    return;
  } catch {
    spawnDetachedBackend();
  }
  const deadline = Date.now() + 5e3;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      await createBackendClient({ host: BACKEND_HOST, port: readBackendPort(), timeoutMs: 500 }).ping();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to start agrune backend daemon");
}
function spawnDetachedBackend() {
  if (!process.argv[1]) {
    throw new Error("Cannot determine current script path for backend spawn");
  }
  const child = spawn(
    process.execPath,
    [...process.execArgv, process.argv[1], "--backend-daemon"],
    {
      detached: true,
      stdio: "ignore"
    }
  );
  child.unref();
}
function asRecord(value) {
  return value && typeof value === "object" ? value : {};
}
//# sourceMappingURL=agrune-mcp.js.map