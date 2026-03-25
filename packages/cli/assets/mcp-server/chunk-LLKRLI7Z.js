import { createRequire } from 'module'; const require = createRequire(import.meta.url);
import {
  external_exports
} from "./chunk-J5GXOUVN.js";

// src/mcp-tools.ts
function toMcpToolResult(result) {
  return {
    content: [{ type: "text", text: result.text }],
    ...result.isError ? { isError: true } : {}
  };
}
function registerAgagruneTools(mcp, handleToolCall) {
  const optionalTabId = {
    tabId: external_exports.number().optional().describe("Tab ID (omit for active tab)")
  };
  mcp.tool(
    "agrune_sessions",
    "List active browser sessions (tabs). Only call this when switching between multiple tabs. agrune_snapshot automatically uses the active tab.",
    {},
    async () => toMcpToolResult(await handleToolCall("agrune_sessions", {}))
  );
  mcp.tool(
    "agrune_snapshot",
    "Get page snapshot with actionable targets. Calling with outline mode (default) returns a group summary. To get targetIds for a specific group, specify groupId to expand it. To get all targets at once, use mode=full. Do not re-snapshot after actions \u2014 one snapshot per task is enough. Defaults: reason=ready, sensitive=false.",
    {
      groupId: external_exports.string().optional().describe("Expand a group to get its targetIds"),
      groupIds: external_exports.array(external_exports.string()).optional().describe("Expand multiple groups"),
      mode: external_exports.enum(["outline", "full"]).optional().describe("outline (default): group summary; full: all targets"),
      includeTextContent: external_exports.boolean().optional().describe("Include text content"),
      ...optionalTabId
    },
    async (args) => toMcpToolResult(await handleToolCall("agrune_snapshot", args))
  );
  mcp.tool(
    "agrune_act",
    "Click an annotated target element by targetId. When ok:true is returned, the click succeeded \u2014 do not call agrune_snapshot to verify. Only re-snapshot when you need targets on a completely different page.",
    {
      targetId: external_exports.string().describe("Target ID"),
      ...optionalTabId
    },
    async (args) => toMcpToolResult(await handleToolCall("agrune_act", args))
  );
  mcp.tool(
    "agrune_fill",
    "Fill an input/textarea with a value by targetId. When ok:true is returned, do not re-snapshot to verify.",
    {
      targetId: external_exports.string().describe("Target ID"),
      value: external_exports.string().describe("Value to fill"),
      ...optionalTabId
    },
    async (args) => toMcpToolResult(await handleToolCall("agrune_fill", args))
  );
  mcp.tool(
    "agrune_drag",
    "Drag one target to another. When ok:true is returned, do not re-snapshot to verify.",
    {
      sourceTargetId: external_exports.string().describe("Source target ID"),
      destinationTargetId: external_exports.string().describe("Destination target ID"),
      placement: external_exports.enum(["before", "inside", "after"]).optional().describe("Drop placement"),
      ...optionalTabId
    },
    async (args) => toMcpToolResult(await handleToolCall("agrune_drag", args))
  );
  mcp.tool(
    "agrune_wait",
    "Wait for target state change.",
    {
      targetId: external_exports.string().describe("Target ID"),
      state: external_exports.enum(["visible", "hidden", "enabled", "disabled"]).describe("Desired state"),
      timeoutMs: external_exports.number().optional().describe("Timeout ms (default: 10000)"),
      ...optionalTabId
    },
    async (args) => toMcpToolResult(await handleToolCall("agrune_wait", args))
  );
  mcp.tool(
    "agrune_guide",
    "Highlight a target visually.",
    {
      targetId: external_exports.string().describe("Target ID"),
      ...optionalTabId
    },
    async (args) => toMcpToolResult(await handleToolCall("agrune_guide", args))
  );
  mcp.tool(
    "agrune_config",
    "Update visual config. Only call when user explicitly requests.",
    {
      pointerAnimation: external_exports.boolean().optional(),
      auroraGlow: external_exports.boolean().optional(),
      auroraTheme: external_exports.enum(["dark", "light"]).optional(),
      clickDelayMs: external_exports.number().optional(),
      pointerDurationMs: external_exports.number().optional(),
      autoScroll: external_exports.boolean().optional(),
      agentActive: external_exports.boolean().optional().describe("Toggle agent visual presence")
    },
    async (args) => toMcpToolResult(await handleToolCall("agrune_config", args))
  );
}

export {
  toMcpToolResult,
  registerAgagruneTools
};
//# sourceMappingURL=chunk-LLKRLI7Z.js.map