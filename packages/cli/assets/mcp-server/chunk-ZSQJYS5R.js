import { createRequire } from 'module'; const require = createRequire(import.meta.url);

// src/native-messaging.ts
function encodeMessage(msg) {
  const json = JSON.stringify(msg);
  const payload = Buffer.from(json, "utf-8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}
function decodeMessages(buffer) {
  const messages = [];
  let offset = 0;
  while (offset + 4 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    if (offset + 4 + length > buffer.length) {
      break;
    }
    const json = buffer.subarray(offset + 4, offset + 4 + length).toString("utf-8");
    messages.push(JSON.parse(json));
    offset += 4 + length;
  }
  return {
    messages,
    remaining: buffer.subarray(offset)
  };
}
function createNativeMessagingTransport(input, output) {
  const listeners = [];
  let buffer = Buffer.alloc(0);
  input.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const { messages, remaining } = decodeMessages(buffer);
    buffer = remaining;
    for (const msg of messages) {
      for (const listener of listeners) {
        listener(msg);
      }
    }
  });
  return {
    send(msg) {
      output.write(encodeMessage(msg));
    },
    onMessage(listener) {
      listeners.push(listener);
    }
  };
}

export {
  encodeMessage,
  decodeMessages,
  createNativeMessagingTransport
};
//# sourceMappingURL=chunk-ZSQJYS5R.js.map