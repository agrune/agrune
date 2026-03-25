import { createRequire } from 'module'; const require = createRequire(import.meta.url);
import {
  BACKEND_HOST,
  BACKEND_PORT
} from "./chunk-QOOGW6ER.js";
import "./chunk-IGG3I32P.js";

// src/backend-client.ts
import { connect as netConnect } from "net";
var DEFAULT_TIMEOUT_MS = 3e3;
function nextRequestId() {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
function createBackendClient(options = {}) {
  const host = options.host ?? BACKEND_HOST;
  const port = options.port ?? BACKEND_PORT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    async ping() {
      await withAgentConnection(host, port, timeoutMs, async ({ socket }) => {
        socket.end();
      });
    },
    async callTool(name, args = {}) {
      return withAgentConnection(host, port, timeoutMs, ({ socket, readNextMessage }) => {
        const requestId = nextRequestId();
        socket.write(JSON.stringify({ type: "agent_request", requestId, name, args }) + "\n");
        return new Promise((resolve, reject) => {
          let settled = false;
          const finish = (callback) => {
            if (settled) return;
            settled = true;
            callback();
          };
          readNextMessage((message) => {
            if (message.type === "backend_error") {
              finish(() => reject(new Error(message.message)));
              return;
            }
            if (message.type !== "agent_response" || message.requestId !== requestId) {
              return;
            }
            finish(() => {
              socket.end();
              resolve({ text: message.text, ...message.isError ? { isError: true } : {} });
            });
          });
          socket.once("close", () => {
            finish(() => reject(new Error("Backend connection closed before tool response")));
          });
        });
      });
    }
  };
}
async function withAgentConnection(host, port, timeoutMs, effect) {
  const socket = netConnect(port, host);
  let buffer = "";
  let messageListener = null;
  const readNextMessage = (listener) => {
    messageListener = listener;
  };
  const deliver = (message) => {
    messageListener?.(message);
  };
  socket.setEncoding("utf8");
  const handshakeReady = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for backend handshake"));
      socket.destroy();
    }, timeoutMs);
    socket.once("connect", () => {
      socket.write(JSON.stringify({ type: "backend_handshake", role: "agent-client" }) + "\n");
    });
    socket.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        if (message.type === "backend_ready") {
          clearTimeout(timer);
          resolveHandshake(message, resolve, reject);
          continue;
        }
        if (message.type === "backend_error") {
          clearTimeout(timer);
          reject(new Error(message.message));
          socket.destroy();
          return;
        }
        deliver(message);
      }
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  await handshakeReady;
  return effect({ socket, readNextMessage });
}
function resolveHandshake(message, resolve, reject) {
  if (message.role !== "agent-client") {
    reject(new Error(`Unexpected backend role: ${message.role}`));
    return;
  }
  resolve();
}
export {
  createBackendClient
};
//# sourceMappingURL=backend-client-3UC4NMM2.js.map