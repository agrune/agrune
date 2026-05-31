#!/usr/bin/env node
import { createRequire as __agruneCreateRequire } from "node:module";
const require = __agruneCreateRequire(import.meta.url);
import {
  JSONRPCMessageSchema,
  __commonJS,
  __require,
  __toESM,
  createCommandError,
  createMcpServer
} from "../chunk-5OUHTLCZ.js";

// ../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/constants.js"(exports, module) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: /* @__PURE__ */ Symbol("kIsForOnEventAttribute"),
      kListener: /* @__PURE__ */ Symbol("kListener"),
      kStatusCode: /* @__PURE__ */ Symbol("status-code"),
      kWebSocket: /* @__PURE__ */ Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// ../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/buffer-util.js"(exports, module) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = __require("bufferutil");
        module.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// ../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/limiter.js"(exports, module) {
    "use strict";
    var kDone = /* @__PURE__ */ Symbol("kDone");
    var kRun = /* @__PURE__ */ Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module.exports = Limiter;
  }
});

// ../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/permessage-deflate.js"(exports, module) {
    "use strict";
    var zlib = __require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = /* @__PURE__ */ Symbol("permessage-deflate");
    var kTotalLength = /* @__PURE__ */ Symbol("total-length");
    var kCallback = /* @__PURE__ */ Symbol("callback");
    var kBuffers = /* @__PURE__ */ Symbol("buffers");
    var kError = /* @__PURE__ */ Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// ../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/validation.js"(exports, module) {
    "use strict";
    var { isUtf8 } = __require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = __require("utf-8-validate");
        module.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// ../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/receiver.js"(exports, module) {
    "use strict";
    var { Writable } = __require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module.exports = Receiver2;
  }
});

// ../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/sender.js"(exports, module) {
    "use strict";
    var { Duplex } = __require("stream");
    var { randomFillSync } = __require("crypto");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = /* @__PURE__ */ Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else {
            buf.set(data, 2);
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// ../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/event-target.js"(exports, module) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = /* @__PURE__ */ Symbol("kCode");
    var kData = /* @__PURE__ */ Symbol("kData");
    var kError = /* @__PURE__ */ Symbol("kError");
    var kMessage = /* @__PURE__ */ Symbol("kMessage");
    var kReason = /* @__PURE__ */ Symbol("kReason");
    var kTarget = /* @__PURE__ */ Symbol("kTarget");
    var kType = /* @__PURE__ */ Symbol("kType");
    var kWasClean = /* @__PURE__ */ Symbol("kWasClean");
    var Event2 = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event2.prototype, "target", { enumerable: true });
    Object.defineProperty(Event2.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event2 {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event2 {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event2 {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event2("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module.exports = {
      CloseEvent,
      ErrorEvent,
      Event: Event2,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// ../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/extension.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module.exports = { format, parse };
  }
});

// ../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/websocket.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var https = __require("https");
    var http = __require("http");
    var net = __require("net");
    var tls = __require("tls");
    var { randomBytes, createHash } = __require("crypto");
    var { Duplex, Readable } = __require("stream");
    var { URL: URL2 } = __require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = /* @__PURE__ */ Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// ../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/stream.js"(exports, module) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = __require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module.exports = createWebSocketStream2;
  }
});

// ../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/subprotocol.js"(exports, module) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module.exports = { parse };
  }
});

// ../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/lib/websocket-server.js"(exports, module) {
    "use strict";
    var EventEmitter = __require("events");
    var http = __require("http");
    var { Duplex } = __require("stream");
    var { createHash } = __require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server2 = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server2.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module.exports = WebSocketServer2;
    function addListeners(server2, map) {
      for (const event of Object.keys(map)) server2.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server2.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server2) {
      server2._state = CLOSED;
      server2.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server2, req, socket, code, message, headers) {
      if (server2.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server2.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// ../../node_modules/.pnpm/@modelcontextprotocol+sdk@1.27.1_zod@4.3.6/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js
import process2 from "process";

// ../../node_modules/.pnpm/@modelcontextprotocol+sdk@1.27.1_zod@4.3.6/node_modules/@modelcontextprotocol/sdk/dist/esm/shared/stdio.js
var ReadBuffer = class {
  append(chunk) {
    this._buffer = this._buffer ? Buffer.concat([this._buffer, chunk]) : chunk;
  }
  readMessage() {
    if (!this._buffer) {
      return null;
    }
    const index = this._buffer.indexOf("\n");
    if (index === -1) {
      return null;
    }
    const line = this._buffer.toString("utf8", 0, index).replace(/\r$/, "");
    this._buffer = this._buffer.subarray(index + 1);
    return deserializeMessage(line);
  }
  clear() {
    this._buffer = void 0;
  }
};
function deserializeMessage(line) {
  return JSONRPCMessageSchema.parse(JSON.parse(line));
}
function serializeMessage(message) {
  return JSON.stringify(message) + "\n";
}

// ../../node_modules/.pnpm/@modelcontextprotocol+sdk@1.27.1_zod@4.3.6/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js
var StdioServerTransport = class {
  constructor(_stdin = process2.stdin, _stdout = process2.stdout) {
    this._stdin = _stdin;
    this._stdout = _stdout;
    this._readBuffer = new ReadBuffer();
    this._started = false;
    this._ondata = (chunk) => {
      this._readBuffer.append(chunk);
      this.processReadBuffer();
    };
    this._onerror = (error) => {
      this.onerror?.(error);
    };
  }
  /**
   * Starts listening for messages on stdin.
   */
  async start() {
    if (this._started) {
      throw new Error("StdioServerTransport already started! If using Server class, note that connect() calls start() automatically.");
    }
    this._started = true;
    this._stdin.on("data", this._ondata);
    this._stdin.on("error", this._onerror);
  }
  processReadBuffer() {
    while (true) {
      try {
        const message = this._readBuffer.readMessage();
        if (message === null) {
          break;
        }
        this.onmessage?.(message);
      } catch (error) {
        this.onerror?.(error);
      }
    }
  }
  async close() {
    this._stdin.off("data", this._ondata);
    this._stdin.off("error", this._onerror);
    const remainingDataListeners = this._stdin.listenerCount("data");
    if (remainingDataListeners === 0) {
      this._stdin.pause();
    }
    this._readBuffer.clear();
    this.onclose?.();
  }
  send(message) {
    return new Promise((resolve2) => {
      const json = serializeMessage(message);
      if (this._stdout.write(json)) {
        resolve2();
      } else {
        this._stdout.once("drain", resolve2);
      }
    });
  }
};

// ../browser/dist/index.js
import { mkdir, readFile, writeFile } from "fs/promises";
import { basename, dirname as dirname2, extname, resolve } from "path";
import { spawn } from "child_process";
import { existsSync } from "fs";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// ../../node_modules/.pnpm/ws@8.20.0/node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_extension = __toESM(require_extension(), 1);
var import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_subprotocol = __toESM(require_subprotocol(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);
var wrapper_default = import_websocket.default;

// ../browser/dist/index.js
import { existsSync as existsSync2, readFileSync } from "fs";
import { createRequire as createNodeRequire } from "module";
import { dirname, join as join2 } from "path";
import { fileURLToPath } from "url";
var ActivityBlockStack = class {
  constructor(onActiveChange) {
    this.onActiveChange = onActiveChange;
  }
  blocks = [];
  counter = 0;
  expiryTimer = null;
  active = false;
  pushGuard(kind) {
    const id = this.nextId(kind);
    this.blocks.push({ id, kind, expiresAt: null });
    this.sync();
    return id;
  }
  pushTimed(kind, ttlMs) {
    const id = this.nextId(kind);
    this.blocks.push({ id, kind, expiresAt: Date.now() + ttlMs });
    this.sync();
    return id;
  }
  release(id) {
    const next = this.blocks.filter((block) => block.id !== id);
    if (next.length === this.blocks.length) {
      return;
    }
    this.blocks = next;
    this.sync();
  }
  hasActiveBlocks() {
    this.pagruneExpired();
    return this.blocks.length > 0;
  }
  getBlocks() {
    this.pagruneExpired();
    return [...this.blocks];
  }
  nextId(kind) {
    this.counter += 1;
    return `${kind}-${this.counter}`;
  }
  pagruneExpired() {
    const now = Date.now();
    const next = this.blocks.filter((block) => block.expiresAt == null || block.expiresAt > now);
    if (next.length !== this.blocks.length) {
      this.blocks = next;
    }
  }
  sync() {
    this.pagruneExpired();
    this.scheduleNextExpiry();
    const nextActive = this.blocks.length > 0;
    if (nextActive !== this.active) {
      this.active = nextActive;
      this.onActiveChange(nextActive);
    }
  }
  scheduleNextExpiry() {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
    const nextExpiry = this.blocks.map((block) => block.expiresAt).filter((expiresAt) => expiresAt != null).sort((left, right) => left - right)[0];
    if (nextExpiry == null) {
      return;
    }
    const delay = Math.max(0, nextExpiry - Date.now());
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = null;
      this.sync();
    }, delay);
  }
};
var SessionManager = class {
  sessions = /* @__PURE__ */ new Map();
  snapshotWaiters = [];
  activeSessionId = null;
  openSession(tabId, url, title) {
    const existing = this.sessions.get(tabId);
    this.sessions.set(tabId, {
      tabId,
      url,
      title,
      snapshot: existing?.url === url ? existing.snapshot : null,
      openedAt: existing?.openedAt ?? Date.now(),
      lastInteractionAt: existing?.lastInteractionAt
    });
  }
  closeSession(tabId) {
    this.sessions.delete(tabId);
    if (this.activeSessionId === tabId) {
      this.activeSessionId = null;
    }
  }
  clear() {
    this.sessions.clear();
    this.activeSessionId = null;
  }
  getSession(tabId) {
    return this.sessions.get(tabId) ?? null;
  }
  getSessions() {
    return [...this.sessions.values()];
  }
  getActiveSessionId() {
    if (this.activeSessionId !== null && !this.sessions.has(this.activeSessionId)) {
      this.activeSessionId = null;
    }
    return this.activeSessionId;
  }
  setActiveSession(tabId) {
    if (!this.sessions.has(tabId)) {
      return false;
    }
    this.activeSessionId = tabId;
    return true;
  }
  touchSession(tabId) {
    const session = this.sessions.get(tabId);
    if (!session) return false;
    session.lastInteractionAt = Date.now();
    this.activeSessionId = tabId;
    return true;
  }
  updateSnapshot(tabId, snapshot) {
    const session = this.sessions.get(tabId);
    if (session) {
      session.snapshot = snapshot;
      this.notifyWaiters();
    }
  }
  getSnapshot(tabId) {
    return this.sessions.get(tabId)?.snapshot ?? null;
  }
  hasReadySession() {
    for (const session of this.sessions.values()) {
      if (session.snapshot !== null) return true;
    }
    return false;
  }
  waitForSnapshot(timeoutMs) {
    if (this.hasReadySession()) return Promise.resolve(true);
    return new Promise((resolve2) => {
      const onReady = () => {
        clearTimeout(timer);
        resolve2(true);
      };
      const timer = setTimeout(() => {
        const idx = this.snapshotWaiters.indexOf(onReady);
        if (idx !== -1) this.snapshotWaiters.splice(idx, 1);
        resolve2(false);
      }, timeoutMs);
      this.snapshotWaiters.push(onReady);
    });
  }
  waitForSessionSnapshot(tabId, timeoutMs) {
    if (this.sessions.get(tabId)?.snapshot !== null && this.sessions.has(tabId)) {
      return Promise.resolve(true);
    }
    return new Promise((resolve2) => {
      const onReady = () => {
        const session = this.sessions.get(tabId);
        if (!session?.snapshot) return;
        clearTimeout(timer);
        const idx = this.snapshotWaiters.indexOf(onReady);
        if (idx !== -1) this.snapshotWaiters.splice(idx, 1);
        resolve2(true);
      };
      const timer = setTimeout(() => {
        const idx = this.snapshotWaiters.indexOf(onReady);
        if (idx !== -1) this.snapshotWaiters.splice(idx, 1);
        resolve2(false);
      }, timeoutMs);
      this.snapshotWaiters.push(onReady);
    });
  }
  notifyWaiters() {
    if (!this.hasReadySession()) return;
    const waiters = this.snapshotWaiters.splice(0);
    for (const waiter of waiters) waiter();
  }
};
var ChromeLauncher = class _ChromeLauncher {
  child = null;
  userDataDir = null;
  createdUserDataDir = false;
  exitListeners = /* @__PURE__ */ new Set();
  expectedExit = false;
  static findChromePath() {
    const envPath = process.env.AGRUNE_CHROME_PATH;
    if (envPath && existsSync(envPath)) {
      return envPath;
    }
    const candidates = process.platform === "darwin" ? [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
    ] : process.platform === "win32" ? [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
    ] : [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser"
    ];
    return candidates.find((candidate) => existsSync(candidate)) ?? null;
  }
  async launch(options = {}) {
    if (this.child) {
      throw new Error("ChromeLauncher already has a running Chrome process.");
    }
    const chromePath = options.chromePath ?? _ChromeLauncher.findChromePath();
    if (!chromePath) {
      throw new Error("Could not find Chrome. Set AGRUNE_CHROME_PATH to override the executable path.");
    }
    const userDataDir2 = options.userDataDir ?? await mkdtemp(join(tmpdir(), "agrune-quick-"));
    this.userDataDir = userDataDir2;
    this.createdUserDataDir = options.userDataDir == null;
    const args2 = [
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir2}`,
      "--no-first-run",
      "--no-default-browser-check",
      ...options.headless ? ["--headless=new"] : [],
      ...options.args ?? [],
      options.startUrl ?? "about:blank"
    ];
    const spawner = options.spawnImpl ?? spawn;
    const child = spawner(chromePath, args2, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    this.child = child;
    child.once("exit", (code, signal) => {
      if (this.child !== child) return;
      this.child = null;
      if (this.expectedExit) {
        this.expectedExit = false;
        return;
      }
      const listeners = [...this.exitListeners];
      for (const listener of listeners) {
        try {
          listener({ code, signal });
        } catch {
        }
      }
    });
    try {
      const wsEndpoint = await this.waitForWsEndpoint(child);
      return { wsEndpoint, process: child, userDataDir: userDataDir2 };
    } catch (error) {
      await this.kill();
      throw error;
    }
  }
  async kill() {
    const child = this.child;
    this.expectedExit = child !== null;
    this.child = null;
    if (child) {
      await new Promise((resolve2) => {
        if (child.exitCode !== null || child.killed) {
          resolve2();
          return;
        }
        child.once("exit", () => resolve2());
        child.kill("SIGTERM");
        setTimeout(() => {
          if (child.exitCode === null && !child.killed) {
            child.kill("SIGKILL");
          }
        }, 2e3);
      });
    }
    const userDataDir2 = this.userDataDir;
    const shouldRemove = this.createdUserDataDir;
    this.userDataDir = null;
    this.createdUserDataDir = false;
    if (userDataDir2 && shouldRemove) {
      await rm(userDataDir2, { recursive: true, force: true });
    }
  }
  onUnexpectedExit(callback) {
    this.exitListeners.add(callback);
    return () => {
      this.exitListeners.delete(callback);
    };
  }
  hasChild() {
    return this.child !== null;
  }
  async waitForWsEndpoint(child) {
    return new Promise((resolve2, reject) => {
      let stderr = "";
      let stdout = "";
      let settled = false;
      const cleanup2 = () => {
        child.stdout?.off("data", handleStdout);
        child.stderr?.off("data", handleStderr);
        child.off("exit", handleExit);
        child.off("error", handleError);
      };
      const maybeResolve = (chunk) => {
        const match = chunk.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (!match || settled) return;
        settled = true;
        cleanup2();
        resolve2(match[1]);
      };
      const handleStdout = (chunk) => {
        stdout += chunk.toString();
        maybeResolve(stdout);
      };
      const handleStderr = (chunk) => {
        stderr += chunk.toString();
        maybeResolve(stderr);
      };
      const handleExit = (code) => {
        if (settled) return;
        settled = true;
        cleanup2();
        reject(new Error(`Chrome exited before exposing a DevTools endpoint (code: ${code ?? "unknown"}).`));
      };
      const handleError = (error) => {
        if (settled) return;
        settled = true;
        cleanup2();
        reject(error);
      };
      child.stdout?.on("data", handleStdout);
      child.stderr?.on("data", handleStderr);
      child.once("exit", handleExit);
      child.once("error", handleError);
    });
  }
};
var CdpConnection = class {
  socket = null;
  nextId = 0;
  pending = /* @__PURE__ */ new Map();
  listeners = /* @__PURE__ */ new Map();
  disconnectListeners = /* @__PURE__ */ new Set();
  disconnectSuppressed = false;
  async connect(wsEndpoint) {
    if (this.socket && this.socket.readyState === wrapper_default.OPEN) return;
    await new Promise((resolve2, reject) => {
      const socket = new wrapper_default(wsEndpoint);
      let settled = false;
      const cleanup2 = () => {
        socket.off("open", handleOpen);
        socket.off("error", handleError);
        socket.off("close", handleClose);
      };
      const handleOpen = () => {
        settled = true;
        cleanup2();
        this.socket = socket;
        socket.on(
          "message",
          (data) => this.handleMessage(data.toString())
        );
        socket.on("close", () => this.handleDisconnect(new Error("CDP socket closed.")));
        socket.on(
          "error",
          (error) => this.handleDisconnect(error instanceof Error ? error : new Error(String(error)))
        );
        resolve2();
      };
      const handleError = (error) => {
        if (settled) return;
        settled = true;
        cleanup2();
        reject(error);
      };
      const handleClose = () => {
        if (settled) return;
        settled = true;
        cleanup2();
        reject(new Error("CDP connection closed before it was established."));
      };
      socket.once("open", handleOpen);
      socket.once("error", handleError);
      socket.once("close", handleClose);
    });
  }
  async disconnect() {
    if (!this.socket) return;
    this.disconnectSuppressed = true;
    const socket = this.socket;
    this.socket = null;
    await new Promise((resolve2) => {
      if (socket.readyState === wrapper_default.CLOSING || socket.readyState === wrapper_default.CLOSED) {
        resolve2();
        return;
      }
      socket.once("close", () => resolve2());
      socket.close();
    });
    this.handleDisconnect();
    this.disconnectSuppressed = false;
  }
  isConnected() {
    return this.socket?.readyState === wrapper_default.OPEN;
  }
  async send(method, params = {}, sessionId) {
    if (!this.socket || this.socket.readyState !== wrapper_default.OPEN) {
      throw new Error("CDP connection is not open.");
    }
    const id = ++this.nextId;
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
    return new Promise((resolve2, reject) => {
      this.pending.set(id, { resolve: resolve2, reject });
      this.socket?.send(JSON.stringify(payload), (error) => {
        if (!error) return;
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }
  on(event, callback) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.add(callback);
      return;
    }
    this.listeners.set(event, /* @__PURE__ */ new Set([callback]));
  }
  off(event, callback) {
    const listeners = this.listeners.get(event);
    if (!listeners) return;
    listeners.delete(callback);
    if (listeners.size === 0) {
      this.listeners.delete(event);
    }
  }
  onDisconnect(callback) {
    this.disconnectListeners.add(callback);
    return () => {
      this.disconnectListeners.delete(callback);
    };
  }
  handleMessage(raw) {
    const message = JSON.parse(raw);
    if (typeof message.id === "number") {
      const entry = this.pending.get(message.id);
      if (!entry) return;
      this.pending.delete(message.id);
      if (message.error) {
        entry.reject(new Error(message.error.message ?? `CDP request failed: ${message.id}`));
        return;
      }
      entry.resolve(message.result ?? {});
      return;
    }
    if (!message.method) return;
    const listeners = this.listeners.get(message.method);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(message.params ?? {}, message.sessionId);
    }
  }
  handleDisconnect(reason) {
    const pending = [...this.pending.values()];
    this.pending.clear();
    const err = reason ?? new Error("CDP connection disconnected.");
    for (const entry of pending) {
      entry.reject(err);
    }
    if (this.socket) {
      this.socket = null;
    }
    if (this.disconnectSuppressed) return;
    const listeners = [...this.disconnectListeners];
    for (const listener of listeners) {
      try {
        listener(err);
      } catch {
      }
    }
  }
};
var CdpTargetManager = class {
  connection = null;
  targets = /* @__PURE__ */ new Map();
  nextTabId = 1;
  targetCreatedCbs = [];
  targetDestroyedCbs = [];
  targetInfoChangedCbs = [];
  listeners = [];
  async start(connection) {
    this.stop();
    this.connection = connection;
    this.listen("Target.targetCreated", (params) => {
      const info = this.toRawTargetInfo(params.targetInfo);
      if (!info || info.type !== "page") return;
      const { target, created } = this.upsertTarget(info);
      if (created) {
        this.targetCreatedCbs.forEach((cb) => cb({ ...target }));
      }
      void this.attachTarget(info.targetId);
    });
    this.listen("Target.targetInfoChanged", (params) => {
      const info = this.toRawTargetInfo(params.targetInfo);
      if (!info || info.type !== "page") return;
      const { target, created } = this.upsertTarget(info);
      if (created) {
        this.targetCreatedCbs.forEach((cb) => cb({ ...target }));
        void this.attachTarget(info.targetId);
        return;
      }
      this.targetInfoChangedCbs.forEach((cb) => cb({ ...target }));
    });
    this.listen("Target.targetDestroyed", (params) => {
      const targetId = typeof params.targetId === "string" ? params.targetId : null;
      if (!targetId) return;
      const existing = this.targets.get(targetId);
      if (!existing) return;
      this.targets.delete(targetId);
      this.targetDestroyedCbs.forEach((cb) => cb({ ...existing }));
    });
    this.listen("Target.attachedToTarget", (params) => {
      const info = this.toRawTargetInfo(params.targetInfo);
      const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;
      if (!info || info.type !== "page" || !sessionId) return;
      const { target } = this.upsertTarget(info);
      target.sessionId = sessionId;
      this.targetInfoChangedCbs.forEach((cb) => cb({ ...target }));
    });
    this.listen("Target.detachedFromTarget", (params) => {
      const sessionId = typeof params.sessionId === "string" ? params.sessionId : null;
      if (!sessionId) return;
      const target = this.getTargetBySessionId(sessionId);
      if (!target) return;
      target.sessionId = null;
      this.targetInfoChangedCbs.forEach((cb) => cb({ ...target }));
    });
    await connection.send("Target.setDiscoverTargets", { discover: true });
    await connection.send("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true
    });
    const result = await connection.send("Target.getTargets");
    const targetInfos = Array.isArray(result.targetInfos) ? result.targetInfos : [];
    for (const raw of targetInfos) {
      const info = this.toRawTargetInfo(raw);
      if (!info || info.type !== "page") continue;
      const { target, created } = this.upsertTarget(info);
      if (created) {
        this.targetCreatedCbs.forEach((cb) => cb({ ...target }));
      }
      await this.attachTarget(info.targetId);
    }
  }
  stop() {
    if (this.connection) {
      for (const [event, callback] of this.listeners) {
        this.connection.off(event, callback);
      }
    }
    this.listeners = [];
    this.connection = null;
    this.targets.clear();
    this.nextTabId = 1;
  }
  getTargets() {
    return [...this.targets.values()].sort((a, b) => a.tabId - b.tabId);
  }
  getTarget(tabId) {
    return this.getTargets().find((target) => target.tabId === tabId) ?? null;
  }
  getTargetBySessionId(sessionId) {
    return this.getTargets().find((target) => target.sessionId === sessionId) ?? null;
  }
  onTargetCreated(cb) {
    this.targetCreatedCbs.push(cb);
  }
  onTargetDestroyed(cb) {
    this.targetDestroyedCbs.push(cb);
  }
  onTargetInfoChanged(cb) {
    this.targetInfoChangedCbs.push(cb);
  }
  listen(event, callback) {
    this.connection?.on(event, callback);
    this.listeners.push([event, callback]);
  }
  async attachTarget(targetId) {
    if (!this.connection) return;
    try {
      await this.connection.send("Target.attachToTarget", {
        targetId,
        flatten: true
      });
    } catch {
    }
  }
  upsertTarget(info) {
    const existing = this.targets.get(info.targetId);
    if (existing) {
      existing.title = info.title ?? existing.title;
      existing.url = info.url ?? existing.url;
      existing.type = info.type ?? existing.type;
      return { target: existing, created: false };
    }
    const target = {
      tabId: this.nextTabId++,
      targetId: info.targetId,
      sessionId: null,
      title: info.title ?? "",
      url: info.url ?? "",
      type: info.type ?? "page"
    };
    this.targets.set(info.targetId, target);
    return { target, created: true };
  }
  toRawTargetInfo(value) {
    if (!value || typeof value !== "object") return null;
    const targetInfo = value;
    if (typeof targetInfo.targetId !== "string") return null;
    return {
      targetId: targetInfo.targetId,
      type: typeof targetInfo.type === "string" ? targetInfo.type : void 0,
      title: typeof targetInfo.title === "string" ? targetInfo.title : void 0,
      url: typeof targetInfo.url === "string" ? targetInfo.url : void 0
    };
  }
};
var QUICK_MODE_RUNTIME_KEY = "__agrune_quick_mode__";
function safeJsonEmbed(json) {
  return json.replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}
function buildPreloadManifestSource(manifest) {
  const jsonLiteral = JSON.stringify(JSON.stringify(manifest));
  return `;(function(){try{window.__agrune_preload_manifest__ = JSON.parse(${safeJsonEmbed(jsonLiteral)});}catch(e){}})();`;
}
function getInjectedSourceWithPreload(manifest) {
  const runtimeSource = readFileSync(resolvePageRuntimePath(), "utf8");
  const preloadSource = buildPreloadManifestSource(manifest);
  return `${runtimeSource}
${preloadSource}
${buildBootstrapSource()}`;
}
var cachedInjectedSource = null;
function resolvePageRuntimePath() {
  const bundledCandidate = fileURLToPath(
    new URL("./page-runtime.global.js", import.meta.url)
  );
  if (existsSync2(bundledCandidate)) {
    return bundledCandidate;
  }
  const require2 = createNodeRequire(import.meta.url);
  try {
    return require2.resolve("@agrune/runtime/page-runtime");
  } catch {
    const runtimeEntry = require2.resolve("@agrune/runtime");
    const candidate = join2(dirname(runtimeEntry), "page-runtime.global.js");
    if (existsSync2(candidate)) {
      return candidate;
    }
    throw new Error(
      `Could not locate @agrune/runtime page-runtime bundle. Expected ${candidate} to exist.`
    );
  }
}
function buildBootstrapSource() {
  return `
;(() => {
  const runtimeApi = globalThis.__agrune_runtime__;
  const apiKey = ${JSON.stringify(QUICK_MODE_RUNTIME_KEY)};
  const bindingName = 'agrune_send';
  const debounceMs = 50;
  const snapshotIntervalMs = 800;

  if (
    !runtimeApi ||
    typeof runtimeApi.installPageAgentRuntime !== 'function' ||
    typeof runtimeApi.buildEmptyManifest !== 'function'
  ) {
    throw new Error('Agrune runtime exports are not available in CDP quick mode.');
  }

  const post = (type, data) => {
    const binding = window[bindingName];
    if (typeof binding === 'function') {
      binding(JSON.stringify({ type, data }));
    }
  };

  const getRuntime = () => window.agruneDom ?? null;

  const isRuntimeBusy = () => {
    const runtime = getRuntime();
    if (!runtime) return false;
    if (typeof runtime.isBusy === 'function') return runtime.isBusy();
    if (typeof runtime.isActive === 'function') return runtime.isActive();
    return false;
  };

  let installTimer = null;
  let snapshotTimer = null;
  let pendingInstall = false;
  let currentConfig = {};
  let reloadTimer = null;

  const dispatchSnapshot = () => {
    if (window.agruneDom && typeof window.agruneDom.getSnapshot === 'function') {
      post('snapshot_update', window.agruneDom.getSnapshot());
    }
  };

  const resolveManifest = () => {
    // Priority: owned-app injected > CDP preload > empty (idle)
    if (window.__agrune_manifest__) return { manifest: window.__agrune_manifest__, hasManifest: true, source: 'window' };
    if (window.__agrune_preload_manifest__) return { manifest: window.__agrune_preload_manifest__, hasManifest: true, source: 'preload' };
    return { manifest: runtimeApi.buildEmptyManifest(), hasManifest: false, source: 'idle' };
  };

  const installRuntime = () => {
    const resolved = resolveManifest();
    runtimeApi.installPageAgentRuntime(resolved.manifest, {
      cdpPostMessage: (type, data) => post(type, data),
    });

    if (window.agruneDom && typeof window.agruneDom.applyConfig === 'function') {
      window.agruneDom.applyConfig(currentConfig);
    }

    post('runtime_ready', { hasManifest: resolved.hasManifest, source: resolved.source });

    // Expose runtime state for test visibility (Playwright page.evaluate).
    // tamper-proof: writable:false. configurable:true allows reload to redefine.
    try {
      Object.defineProperty(window, '__agrune_runtime_state__', {
        value: { hasManifest: resolved.hasManifest, source: resolved.source },
        writable: false,
        configurable: true,
        enumerable: true,
      });
    } catch (e) { /* defensive: don't crash bootstrap on sealed globals */ }

    if (resolved.hasManifest) dispatchSnapshot();
  };

  const flushInstall = () => {
    if (!pendingInstall) return;
    if (isRuntimeBusy()) {
      scheduleInstall();
      return;
    }
    pendingInstall = false;
    installRuntime();
  };

  const scheduleInstall = () => {
    if (installTimer !== null) clearTimeout(installTimer);
    pendingInstall = true;
    installTimer = setTimeout(() => {
      installTimer = null;
      flushInstall();
    }, debounceMs);
  };

  const scheduleSnapshot = () => {
    if (snapshotTimer !== null) clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      snapshotTimer = null;
      dispatchSnapshot();
    }, debounceMs);
  };

  for (const type of [
    'mousedown', 'mousemove', 'mouseup',
    'pointerdown', 'pointermove', 'pointerup',
    'wheel', 'contextmenu', 'dblclick',
  ]) {
    document.addEventListener(type, (event) => {
      if (event.view === null) {
        Object.defineProperty(event, 'view', { value: window, configurable: true });
      }
    }, { capture: true });
  }

  // General snapshot observer \u2014 fires on ANY DOM change. The runtime boots
  // once on DOMContentLoaded; manifest changes arrive via
  // window.__agrune_manifest__ reassignment (Phase 12+) and trigger
  // reloadRuntime() explicitly.
  const snapshotObserver = new MutationObserver(() => {
    if (getRuntime()) scheduleSnapshot();
  });
  snapshotObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });

  setInterval(() => {
    if (getRuntime()) dispatchSnapshot();
  }, snapshotIntervalMs);

  const wrapHistoryMethod = (name) => {
    const original = history[name];
    if (typeof original !== 'function') return;
    history[name] = function(...args) {
      const result = original.apply(this, args);
      scheduleSnapshot();
      return result;
    };
  };

  wrapHistoryMethod('pushState');
  wrapHistoryMethod('replaceState');

  window.addEventListener('popstate', scheduleSnapshot);
  window.addEventListener('hashchange', scheduleSnapshot);

  window[apiKey] = {
    handleCommand: async (kind, input) => {
      const runtime = window.agruneDom;
      if (!runtime) {
        throw new Error('Agrune runtime is not installed on this page.');
      }
      const fn = runtime[kind];
      if (typeof fn !== 'function') {
        throw new Error('Unknown command: ' + kind);
      }
      const result = await fn.call(runtime, input ?? {});
      scheduleSnapshot();
      return result;
    },
    getSnapshot: () => {
      return window.agruneDom ? window.agruneDom.getSnapshot() : null;
    },
    applyConfig: (config) => {
      currentConfig = { ...currentConfig, ...(config ?? {}) };
      if (window.agruneDom && typeof window.agruneDom.applyConfig === 'function') {
        window.agruneDom.applyConfig(currentConfig);
      }
    },
    setAgentActivity: (active) => {
      if (!window.agruneDom) return;
      if (active) {
        window.agruneDom.beginAgentActivity?.();
      } else {
        window.agruneDom.endAgentActivity?.();
      }
    },
    dispatchCdpMessage: (detail) => {
      window.dispatchEvent(new CustomEvent('agrune:cdp', { detail }));
    },
    // Expose reload hook for Phase 12 manifest injection.
    // Calling reloadRuntime() after setting window.__agrune_manifest__ will
    // re-resolve the manifest and reinstall the runtime.
    // Debounce 50ms: rapid-fire \uD638\uCD9C \uC2DC installRuntime \uC911\uBCF5 \uC2E4\uD589 \uBC29\uC9C0 (T-12-06).
    reloadRuntime: () => {
      if (reloadTimer !== null) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        reloadTimer = null;
        installRuntime();
      }, 50);
    },
    getManifestSource: () => {
      return resolveManifest().source;
    },
  };

  // Bootstrap \u2014 always, regardless of manifest presence (RESOLVE-04)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installRuntime, { once: true });
  } else {
    installRuntime();
  }
})();
`;
}
function getInjectedSource() {
  if (cachedInjectedSource !== null) {
    return cachedInjectedSource;
  }
  const runtimeSource = readFileSync(resolvePageRuntimePath(), "utf8");
  cachedInjectedSource = `${runtimeSource}
${buildBootstrapSource()}`;
  return cachedInjectedSource;
}
var CdpRuntimeInjector = class {
  constructor(connection) {
    this.connection = connection;
  }
  async prepareSession(sessionId, options) {
    const source = options?.preloadManifest ? getInjectedSourceWithPreload(options.preloadManifest) : getInjectedSource();
    await this.connection.send("Page.enable", {}, sessionId).catch(() => {
    });
    await this.connection.send("Runtime.enable", {}, sessionId);
    await this.connection.send("Network.enable", {}, sessionId).catch(() => {
    });
    await this.connection.send("Runtime.addBinding", { name: "agrune_send" }, sessionId);
    await this.connection.send(
      "Page.addScriptToEvaluateOnNewDocument",
      { source },
      sessionId
    );
    await this.connection.send(
      "Runtime.evaluate",
      {
        expression: source
      },
      sessionId
    );
  }
};
var RecoverySupervisor = class {
  constructor(strategy, options = {}) {
    this.strategy = strategy;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.baseDelayMs = options.baseDelayMs ?? 250;
    this.maxDelayMs = options.maxDelayMs ?? 4e3;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }
  maxAttempts;
  baseDelayMs;
  maxDelayMs;
  sleep;
  listeners = /* @__PURE__ */ new Set();
  inflight = null;
  lastFailure = null;
  onEvent(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  getLastFailure() {
    return this.lastFailure ? { ...this.lastFailure } : null;
  }
  isRecovering() {
    return this.inflight !== null;
  }
  waitForRecovery() {
    return this.inflight ?? Promise.resolve();
  }
  trigger(cause, reason) {
    if (this.inflight) return this.inflight;
    if (cause === "chrome_crashed" && !this.strategy.canRelaunch) {
      const failure = new Error(
        `Chrome process crashed and relaunch is not available in attach mode: ${reason.message}`
      );
      this.lastFailure = { cause, error: failure, attempts: 0 };
      this.emit({ kind: "failed", cause, attempts: 0, error: failure.message });
      return Promise.reject(failure);
    }
    const task = this.runLoop(cause).finally(() => {
      this.inflight = null;
    });
    this.inflight = task;
    return task;
  }
  async runLoop(cause) {
    let attempt = 0;
    let lastError = null;
    while (attempt < this.maxAttempts) {
      attempt += 1;
      this.emit({ kind: "started", cause, attempt });
      try {
        if (cause === "chrome_crashed") {
          await this.strategy.relaunchAndReconnect();
        } else {
          await this.strategy.reconnect();
        }
        this.lastFailure = null;
        this.emit({ kind: "succeeded", cause, attempts: attempt });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.emit({ kind: "attempt_failed", attempt, error: lastError.message });
        if (attempt < this.maxAttempts) {
          const delay = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** (attempt - 1));
          await this.sleep(delay);
        }
      }
    }
    const finalError = lastError ?? new Error("Recovery failed for unknown reasons.");
    this.lastFailure = { cause, error: finalError, attempts: attempt };
    this.emit({ kind: "failed", cause, attempts: attempt, error: finalError.message });
    throw finalError;
  }
  emit(event) {
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch {
      }
    }
  }
};
var ENSURE_READY_TIMEOUT_MS = 1e4;
var ACTIVITY_TAIL_BLOCK_MS = 5e3;
var OPEN_TAB_READY_TIMEOUT_MS = 1e4;
var CLOSE_TAB_TIMEOUT_MS = 5e3;
var NAVIGATION_TIMEOUT_MS = 1e4;
var FILE_CHOOSER_WAIT_TIMEOUT_MS = 2e3;
var CDP_ALT_MODIFIER = 1;
var CDP_CONTROL_MODIFIER = 2;
var CDP_META_MODIFIER = 4;
var CDP_SHIFT_MODIFIER = 8;
var SPECIAL_KEY_INFO = {
  Backspace: { key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 },
  Tab: { key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 },
  Enter: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
  Return: { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 },
  Shift: { key: "Shift", code: "ShiftLeft", windowsVirtualKeyCode: 16 },
  Control: { key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17 },
  Ctrl: { key: "Control", code: "ControlLeft", windowsVirtualKeyCode: 17 },
  Alt: { key: "Alt", code: "AltLeft", windowsVirtualKeyCode: 18 },
  Meta: { key: "Meta", code: "MetaLeft", windowsVirtualKeyCode: 91 },
  Escape: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  Esc: { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 },
  Space: { key: " ", code: "Space", text: " ", windowsVirtualKeyCode: 32 },
  " ": { key: " ", code: "Space", text: " ", windowsVirtualKeyCode: 32 },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
  Left: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
  Up: { key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 },
  Right: { key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
  Down: { key: "ArrowDown", code: "ArrowDown", windowsVirtualKeyCode: 40 },
  Insert: { key: "Insert", code: "Insert", windowsVirtualKeyCode: 45 },
  Delete: { key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 },
  Home: { key: "Home", code: "Home", windowsVirtualKeyCode: 36 },
  End: { key: "End", code: "End", windowsVirtualKeyCode: 35 },
  PageUp: { key: "PageUp", code: "PageUp", windowsVirtualKeyCode: 33 },
  PageDown: { key: "PageDown", code: "PageDown", windowsVirtualKeyCode: 34 }
};
var CdpDriver = class {
  sessions = new SessionManager();
  onActivity = null;
  connection = new CdpConnection();
  targetManager = new CdpTargetManager();
  activityBlocks;
  options;
  launcher = new ChromeLauncher();
  preparedSessions = /* @__PURE__ */ new Set();
  desiredConfig = {};
  sessionOpenCbs = [];
  sessionCloseCbs = [];
  snapshotUpdateCbs = [];
  consoleMessagesByTab = /* @__PURE__ */ new Map();
  navigationIndexByTab = /* @__PURE__ */ new Map();
  networkRequestsByTab = /* @__PURE__ */ new Map();
  networkByRequestId = /* @__PURE__ */ new Map();
  dialogs = [];
  dialogWaiters = [];
  nextDialogId = 1;
  fileChoosers = [];
  nextFileChooserId = 1;
  connectPromise = null;
  commandCounter = 0;
  bindingsRegistered = false;
  handleBindingCalled;
  handleDragIntercepted;
  handleConsoleAPICalled;
  handleExceptionThrown;
  handleFrameNavigated;
  handleNetworkRequestWillBeSent;
  handleNetworkRequestWillBeSentExtraInfo;
  handleNetworkResponseReceived;
  handleNetworkResponseReceivedExtraInfo;
  handleNetworkLoadingFailed;
  handleJavascriptDialogOpening;
  handleJavascriptDialogClosed;
  handleFileChooserOpened;
  recovery = null;
  resolvedWsEndpoint = null;
  unsubscribeDisconnect = null;
  unsubscribeExit = null;
  recoveryListeners = [];
  recoveredFlag = false;
  constructor(options) {
    this.options = options;
    this.activityBlocks = new ActivityBlockStack((active) => {
      for (const target of this.targetManager.getTargets()) {
        if (!target.sessionId) continue;
        this.runBackgroundTask(this.setAgentActivity(target.sessionId, active));
      }
    });
    this.handleBindingCalled = (params, sessionId) => {
      void this.runBackgroundTask(this.onBindingCalled(params, sessionId));
    };
    this.handleDragIntercepted = (params, sessionId) => {
      void this.runBackgroundTask(this.onDragIntercepted(params, sessionId));
    };
    this.handleConsoleAPICalled = (params, sessionId) => {
      this.recordConsoleMessage(params, sessionId);
    };
    this.handleExceptionThrown = (params, sessionId) => {
      this.recordExceptionThrown(params, sessionId);
    };
    this.handleFrameNavigated = (params, sessionId) => {
      this.recordFrameNavigated(params, sessionId);
    };
    this.handleNetworkRequestWillBeSent = (params, sessionId) => {
      this.recordNetworkRequestWillBeSent(params, sessionId);
    };
    this.handleNetworkRequestWillBeSentExtraInfo = (params, sessionId) => {
      this.recordNetworkRequestExtraInfo(params, sessionId);
    };
    this.handleNetworkResponseReceived = (params, sessionId) => {
      this.recordNetworkResponseReceived(params, sessionId);
    };
    this.handleNetworkResponseReceivedExtraInfo = (params, sessionId) => {
      this.recordNetworkResponseExtraInfo(params, sessionId);
    };
    this.handleNetworkLoadingFailed = (params, sessionId) => {
      this.recordNetworkLoadingFailed(params, sessionId);
    };
    this.handleJavascriptDialogOpening = (params, sessionId) => {
      this.recordJavascriptDialogOpening(params, sessionId);
    };
    this.handleJavascriptDialogClosed = (params, sessionId) => {
      this.recordJavascriptDialogClosed(params, sessionId);
    };
    this.handleFileChooserOpened = (params, sessionId) => {
      this.recordFileChooserOpened(params, sessionId);
    };
    this.targetManager.onTargetCreated((target) => {
      this.sessions.openSession(target.tabId, target.url, target.title);
      this.ensureConsoleState(target.tabId);
      this.ensureNetworkState(target.tabId);
      this.sessionOpenCbs.forEach((cb) => cb(this.toSession(target.tabId)));
      this.runBackgroundTask(this.prepareTarget(target));
    });
    this.targetManager.onTargetInfoChanged((target) => {
      this.sessions.openSession(target.tabId, target.url, target.title);
      this.ensureConsoleState(target.tabId);
      this.ensureNetworkState(target.tabId);
      this.runBackgroundTask(this.prepareTarget(target));
    });
    this.targetManager.onTargetDestroyed((target) => {
      this.sessions.closeSession(target.tabId);
      this.consoleMessagesByTab.delete(target.tabId);
      this.navigationIndexByTab.delete(target.tabId);
      const records = this.networkRequestsByTab.get(target.tabId) ?? [];
      for (const record of records) this.networkByRequestId.delete(networkRequestKey(record.sessionId, record.requestId));
      this.networkRequestsByTab.delete(target.tabId);
      removeDialogsForTab(this.dialogs, target.tabId);
      removeFileChoosersForTab(this.fileChoosers, target.tabId);
      this.sessionCloseCbs.forEach((cb) => cb(target.tabId));
    });
  }
  async connect() {
    if (this.connection.isConnected()) return;
    if (this.connectPromise) {
      await this.connectPromise;
      return;
    }
    this.connectPromise = this.doConnect().finally(() => {
      this.connectPromise = null;
    });
    await this.connectPromise;
  }
  async disconnect() {
    this.unsubscribeDisconnect?.();
    this.unsubscribeDisconnect = null;
    this.unsubscribeExit?.();
    this.unsubscribeExit = null;
    this.targetManager.stop();
    this.preparedSessions.clear();
    this.unregisterBindings();
    this.sessions.clear();
    this.dialogs.splice(0, this.dialogs.length);
    this.dialogWaiters.splice(0, this.dialogWaiters.length);
    this.nextDialogId = 1;
    this.fileChoosers.splice(0, this.fileChoosers.length);
    this.nextFileChooserId = 1;
    await this.connection.disconnect();
    if (this.options.mode === "launch") {
      await this.launcher.kill();
    }
  }
  isConnected() {
    return this.connection.isConnected();
  }
  listSessions() {
    const activeId = this.sessions.getActiveSessionId();
    return this.sessions.getSessions().map((session) => ({
      tabId: session.tabId,
      url: session.url,
      title: session.title,
      hasSnapshot: session.snapshot !== null,
      snapshotVersion: session.snapshot?.version ?? null,
      active: session.tabId === activeId,
      lastInteractionAt: session.lastInteractionAt ?? null
    }));
  }
  getSnapshot(tabId) {
    return this.sessions.getSnapshot(tabId);
  }
  consoleMessages(tabId, query = {}) {
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) return [];
    const currentNavigationIndex = this.navigationIndexByTab.get(resolvedTabId) ?? 0;
    const minSeverity = severityForConsoleLevel(query.level ?? "info");
    return (this.consoleMessagesByTab.get(resolvedTabId) ?? []).filter((message) => {
      if (!query.all && message.navigationIndex !== currentNavigationIndex) return false;
      return severityForConsoleLevel(message.level) >= minSeverity;
    });
  }
  networkRequests(tabId, query = {}) {
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) return [];
    const currentNavigationIndex = this.navigationIndexByTab.get(resolvedTabId) ?? 0;
    return (this.networkRequestsByTab.get(resolvedTabId) ?? []).filter((record) => networkRequestMatches(record, query, currentNavigationIndex)).map(toNetworkRequestSummary);
  }
  async networkRequestDetail(tabId, index, part) {
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) {
      throw createCommandError("TAB_NOT_FOUND", "No browser tab is available for network request lookup.");
    }
    const record = (this.networkRequestsByTab.get(resolvedTabId) ?? []).find((request) => request.index === index);
    if (!record) {
      throw createCommandError("NETWORK_REQUEST_NOT_FOUND", `Network request not found: ${index}`, { index });
    }
    const summary = toNetworkRequestSummary(record);
    if (part) {
      return {
        request: summary,
        part,
        value: await this.networkRequestPartValue(record, part)
      };
    }
    return {
      request: summary,
      requestHeaders: record.requestHeaders,
      requestBody: record.requestBody,
      responseHeaders: record.responseHeaders,
      responseBody: await this.networkResponseBody(record)
    };
  }
  onSessionOpen(cb) {
    this.sessionOpenCbs.push(cb);
  }
  onSessionClose(cb) {
    this.sessionCloseCbs.push(cb);
  }
  onSnapshotUpdate(cb) {
    this.snapshotUpdateCbs.push(cb);
  }
  onRecoveryEvent(cb) {
    this.recoveryListeners.push(cb);
  }
  isRecovering() {
    return this.recovery?.isRecovering() ?? false;
  }
  getLastRecoveryFailure() {
    return this.recovery?.getLastFailure() ?? null;
  }
  async execute(tabId, command) {
    return this.withActivityBlocks(command.kind, async () => {
      const target = this.targetManager.getTarget(tabId);
      const commandId = typeof command.commandId === "string" ? command.commandId : `cmd-${++this.commandCounter}-${Date.now()}`;
      if (!target?.sessionId) {
        return {
          commandId,
          ok: false,
          error: createCommandError(
            "SESSION_NOT_ACTIVE",
            `No active CDP session is attached for tab ${tabId}.`
          )
        };
      }
      const payload = {
        ...command,
        commandId
      };
      try {
        if (this.recovery?.isRecovering()) {
          await this.recovery.waitForRecovery();
        }
        await this.setAgentActivity(target.sessionId, true);
        const dialogAfterId = this.dialogs.length;
        const dialogWaiter = this.waitForNextDialog(tabId, dialogAfterId);
        const actionPromise = this.evaluateInSession(
          target.sessionId,
          `window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}].handleCommand(${JSON.stringify(command.kind)}, ${JSON.stringify(payload)})`
        );
        const winner = await Promise.race([
          actionPromise.then((result2) => ({ kind: "result", result: result2 })),
          dialogWaiter.promise.then((dialog) => ({ kind: "dialog", dialog }))
        ]);
        dialogWaiter.cancel();
        if (winner.kind === "dialog") {
          winner.dialog.actionPromise = actionPromise.catch((error) => ({
            commandId,
            ok: false,
            error: createCommandError(
              "INVALID_COMMAND",
              error instanceof Error ? error.message : String(error)
            )
          }));
          this.sessions.touchSession(tabId);
          return {
            commandId,
            ok: true,
            result: {
              actionKind: command.action ?? command.kind,
              ...typeof command.targetId === "string" ? { targetId: command.targetId } : {},
              dialog: toPublicDialog(winner.dialog)
            }
          };
        }
        const result = winner.result;
        if (result.ok) {
          this.sessions.touchSession(tabId);
        }
        if (this.recoveredFlag) {
          if (result.ok) {
            this.recoveredFlag = false;
            const merged = { ...result.result ?? {}, recovered: true };
            return { ...result, result: merged };
          }
        }
        return result;
      } catch (error) {
        const failure = this.recovery?.getLastFailure() ?? null;
        if (failure) {
          const code = failure.cause === "chrome_crashed" ? "CHROME_CRASHED" : "RECOVERY_FAILED";
          return {
            commandId,
            ok: false,
            error: createCommandError(
              code,
              `Automatic recovery failed after ${failure.attempts} attempts: ${failure.error.message}`,
              {
                cause: failure.cause,
                attempts: failure.attempts,
                guidance: this.options.mode === "launch" ? "Close the quick-mode browser window and rerun the command to start a fresh session." : "Restart the attached Chrome instance or verify the wsEndpoint, then retry."
              }
            )
          };
        }
        if (this.recovery?.isRecovering()) {
          return {
            commandId,
            ok: false,
            error: createCommandError(
              "CONNECTION_LOST",
              error instanceof Error ? error.message : String(error),
              { guidance: "Automatic recovery is in progress. Retry shortly." }
            )
          };
        }
        return {
          commandId,
          ok: false,
          error: createCommandError(
            "INVALID_COMMAND",
            error instanceof Error ? error.message : String(error)
          )
        };
      }
    });
  }
  updateConfig(config) {
    Object.assign(this.desiredConfig, config);
    for (const target of this.targetManager.getTargets()) {
      if (!target.sessionId) continue;
      void this.evaluateInSession(
        target.sessionId,
        `window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}]?.applyConfig(${JSON.stringify(config)})`
      ).catch(() => {
      });
    }
  }
  async ensureReady() {
    await this.connect();
    if (this.sessions.hasReadySession()) return null;
    const ready = await this.sessions.waitForSnapshot(ENSURE_READY_TIMEOUT_MS);
    if (ready) return null;
    if (this.sessions.getSessions().length === 0) {
      return "No browser pages are attached in CDP quick mode.";
    }
    return "No browser sessions available. Open a page with agrune annotations in the quick mode browser.";
  }
  resolveTabId(tabId) {
    if (typeof tabId === "number") return tabId;
    const activeId = this.sessions.getActiveSessionId();
    if (activeId !== null && this.sessions.getSession(activeId) !== null) {
      return activeId;
    }
    const sessions = this.sessions.getSessions();
    const ready = sessions.find((session) => session.snapshot !== null);
    return ready?.tabId ?? sessions[0]?.tabId ?? null;
  }
  async focusSession(tabId) {
    const session = this.sessions.getSession(tabId);
    if (!session) {
      throw createCommandError(
        "TAB_NOT_FOUND",
        `No session exists for tabId ${tabId}.`,
        { tabId }
      );
    }
    const wasActive = this.sessions.getActiveSessionId() === tabId;
    this.sessions.setActiveSession(tabId);
    let cdpFocusError;
    const target = this.targetManager.getTarget(tabId);
    if (target) {
      try {
        await this.connection.send("Target.activateTarget", { targetId: target.targetId });
      } catch (error) {
        cdpFocusError = error instanceof Error ? error.message : String(error);
      }
      if (target.sessionId) {
        try {
          await this.connection.send("Page.bringToFront", {}, target.sessionId);
        } catch (error) {
          if (!cdpFocusError) {
            cdpFocusError = error instanceof Error ? error.message : String(error);
          }
        }
      }
    }
    return {
      tabId,
      wasActive,
      becameActive: true,
      ...cdpFocusError ? { cdpFocusError } : {}
    };
  }
  async openTab(url) {
    await this.connect();
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw createCommandError("INVALID_COMMAND", `Invalid URL for new tab: ${url}`, { url });
    }
    const response = await this.connection.send("Target.createTarget", { url: parsed.toString() });
    const targetId = typeof response.targetId === "string" ? response.targetId : null;
    if (!targetId) {
      throw createCommandError("INVALID_COMMAND", "CDP Target.createTarget did not return a targetId.", {
        response
      });
    }
    const target = await this.waitForTarget(targetId, 5e3);
    if (!target) {
      throw createCommandError("SESSION_NOT_ACTIVE", "New tab was created but no attached session became available.", {
        targetId,
        url: parsed.toString()
      });
    }
    await this.focusSession(target.tabId).catch(() => void 0);
    await this.refreshSnapshot(target.tabId).catch(() => void 0);
    await this.sessions.waitForSessionSnapshot(target.tabId, OPEN_TAB_READY_TIMEOUT_MS);
    const session = this.sessions.getSession(target.tabId);
    return {
      tabId: target.tabId,
      url: session?.url ?? target.url,
      title: session?.title ?? target.title
    };
  }
  async closeTab(tabId) {
    await this.connect();
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) {
      throw createCommandError("TAB_NOT_FOUND", "No browser tab is available to close.");
    }
    const session = this.sessions.getSession(resolvedTabId);
    if (!session) {
      throw createCommandError(
        "TAB_NOT_FOUND",
        `No session exists for tabId ${resolvedTabId}.`,
        { tabId: resolvedTabId }
      );
    }
    const target = this.targetManager.getTarget(resolvedTabId);
    if (!target) {
      throw createCommandError(
        "TAB_NOT_FOUND",
        `No browser target exists for tabId ${resolvedTabId}.`,
        { tabId: resolvedTabId }
      );
    }
    await this.connection.send("Target.closeTarget", { targetId: target.targetId });
    const closed = await this.waitForSessionClosed(resolvedTabId, CLOSE_TAB_TIMEOUT_MS);
    if (!closed) {
      throw createCommandError(
        "INVALID_COMMAND",
        `Timed out waiting for tabId ${resolvedTabId} to close.`,
        { tabId: resolvedTabId }
      );
    }
    return { tabId: resolvedTabId, closed: true };
  }
  async navigateTab(tabId, url) {
    await this.connect();
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) {
      throw createCommandError("TAB_NOT_FOUND", "No browser tab is available to navigate.");
    }
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw createCommandError("INVALID_COMMAND", `Invalid URL for navigation: ${url}`, { url });
    }
    const target = this.requireAttachedTarget(resolvedTabId);
    const nextUrl = parsed.toString();
    const response = await this.connection.send("Page.navigate", { url: nextUrl }, target.sessionId);
    if (typeof response.errorText === "string" && response.errorText.length > 0) {
      throw createCommandError("INVALID_COMMAND", response.errorText, { url: nextUrl });
    }
    this.sessions.openSession(resolvedTabId, nextUrl, this.sessions.getSession(resolvedTabId)?.title ?? target.title);
    await this.waitForNavigationSettled(resolvedTabId, nextUrl, NAVIGATION_TIMEOUT_MS);
    await this.refreshSnapshot(resolvedTabId).catch(() => void 0);
    return this.navigationResult(resolvedTabId, nextUrl);
  }
  async navigateBack(tabId) {
    await this.connect();
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) {
      throw createCommandError("TAB_NOT_FOUND", "No browser tab is available to navigate back.");
    }
    const target = this.requireAttachedTarget(resolvedTabId);
    const history = await this.connection.send("Page.getNavigationHistory", {}, target.sessionId);
    const currentIndex = typeof history.currentIndex === "number" ? history.currentIndex : -1;
    const entries = Array.isArray(history.entries) ? history.entries : [];
    const previous = currentIndex > 0 ? entries[currentIndex - 1] : null;
    const entryId = typeof previous?.id === "number" ? previous.id : null;
    const previousUrl = typeof previous?.url === "string" ? previous.url : null;
    if (entryId == null || !previousUrl) {
      throw createCommandError("INVALID_COMMAND", "No previous browser history entry is available.");
    }
    const previousTitle = typeof previous?.title === "string" ? previous.title : "";
    await this.connection.send("Page.navigateToHistoryEntry", { entryId }, target.sessionId);
    this.sessions.openSession(resolvedTabId, previousUrl, previousTitle);
    await this.waitForNavigationSettled(resolvedTabId, previousUrl, NAVIGATION_TIMEOUT_MS);
    await this.refreshSnapshot(resolvedTabId).catch(() => void 0);
    return this.navigationResult(resolvedTabId, previousUrl);
  }
  async resizeTab(tabId, width, height) {
    await this.connect();
    if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
      throw createCommandError("INVALID_COMMAND", "resize requires positive integer width and height.", {
        width,
        height
      });
    }
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) {
      throw createCommandError("TAB_NOT_FOUND", "No browser tab is available to resize.");
    }
    const target = this.requireAttachedTarget(resolvedTabId);
    await this.connection.send(
      "Emulation.setDeviceMetricsOverride",
      {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false
      },
      target.sessionId
    );
    const actual = await this.evaluateInSession(
      target.sessionId,
      `(() => ({ width: window.innerWidth, height: window.innerHeight }))()`
    ).catch(() => ({ width, height }));
    await this.refreshSnapshot(resolvedTabId).catch(() => void 0);
    return {
      tabId: resolvedTabId,
      width: Number.isFinite(actual.width) ? actual.width : width,
      height: Number.isFinite(actual.height) ? actual.height : height
    };
  }
  async screenshotTab(tabId, path, options = {}) {
    await this.connect();
    if (typeof path !== "string" || path.trim().length === 0) {
      throw createCommandError("INVALID_COMMAND", "screenshot requires a non-empty path.");
    }
    if (options.targetId && options.fullPage) {
      throw createCommandError("INVALID_COMMAND", "Element screenshots cannot use fullPage.");
    }
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) {
      throw createCommandError("TAB_NOT_FOUND", "No browser tab is available to screenshot.");
    }
    const target = this.requireAttachedTarget(resolvedTabId);
    const type = options.type ?? screenshotTypeFromPath(path) ?? "png";
    const params = {
      format: type,
      fromSurface: true
    };
    if (options.fullPage) {
      params.captureBeyondViewport = true;
      params.clip = await this.fullPageScreenshotClip(target.sessionId);
    } else if (options.targetId) {
      params.clip = await this.targetScreenshotClip(resolvedTabId, target.sessionId, options.targetId);
    }
    const response = await this.connection.send("Page.captureScreenshot", params, target.sessionId);
    if (typeof response.data !== "string" || response.data.length === 0) {
      throw createCommandError("INVALID_COMMAND", "CDP Page.captureScreenshot did not return image data.");
    }
    const absolutePath = resolve(path);
    await mkdir(dirname2(absolutePath), { recursive: true });
    await writeFile(absolutePath, Buffer.from(response.data, "base64"));
    return {
      tabId: resolvedTabId,
      path: absolutePath,
      type,
      fullPage: options.fullPage === true,
      ...options.targetId ? { targetId: options.targetId } : {}
    };
  }
  async evaluateTab(tabId, source, options = {}) {
    await this.connect();
    if (typeof source !== "string" || source.trim().length === 0) {
      throw createCommandError("INVALID_COMMAND", "evaluate requires a non-empty function.");
    }
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) {
      throw createCommandError("TAB_NOT_FOUND", "No browser tab is available to evaluate.");
    }
    const target = this.requireAttachedTarget(resolvedTabId);
    const result = options.targetId ? await this.evaluateInSession(
      target.sessionId,
      await this.targetEvaluationExpression(resolvedTabId, target.sessionId, options.targetId, source, options.arg)
    ) : await this.evaluateInSession(
      target.sessionId,
      buildPageEvaluationExpression(source, options.arg)
    );
    this.sessions.touchSession(resolvedTabId);
    return {
      tabId: resolvedTabId,
      result: result === void 0 ? null : result,
      ...result === void 0 ? { undefinedResult: true } : {},
      ...options.targetId ? { targetId: options.targetId } : {}
    };
  }
  async runCodeUnsafe(tabId, source) {
    await this.connect();
    if (typeof source !== "string" || source.trim().length === 0) {
      throw createCommandError("INVALID_COMMAND", "browser_run_code_unsafe requires non-empty code.");
    }
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) {
      throw createCommandError("TAB_NOT_FOUND", "No browser tab is available to run code.");
    }
    this.requireAttachedTarget(resolvedTabId);
    if (!this.resolvedWsEndpoint) {
      throw createCommandError("INVALID_COMMAND", "CDP endpoint is not available for Playwright connection.");
    }
    const { chromium } = await import("playwright");
    const browser = await chromium.connectOverCDP(this.resolvedWsEndpoint);
    try {
      const page = await this.playwrightPageForTab(browser, resolvedTabId);
      await page.bringToFront().catch(() => void 0);
      const fn = compileRunCodeUnsafeFunction(source);
      const result = await fn(page);
      this.sessions.touchSession(resolvedTabId);
      return {
        tabId: resolvedTabId,
        result: result === void 0 ? null : toJsonCompatible(result),
        ...result === void 0 ? { undefinedResult: true } : {}
      };
    } finally {
      await browser.close().catch(() => void 0);
    }
  }
  async pressKey(tabId, key) {
    await this.connect();
    if (typeof key !== "string" || key.length === 0) {
      throw createCommandError("INVALID_COMMAND", "pressKey requires a non-empty key.");
    }
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) {
      throw createCommandError("TAB_NOT_FOUND", "No browser tab is available for key press.");
    }
    const target = this.requireAttachedTarget(resolvedTabId);
    await this.dispatchKeyboardKey(target.sessionId, key);
    this.sessions.touchSession(resolvedTabId);
    await this.refreshSnapshot(resolvedTabId).catch(() => void 0);
    return { tabId: resolvedTabId, key };
  }
  async typeText(tabId, targetId, text, options = {}) {
    await this.connect();
    if (typeof targetId !== "string" || targetId.length === 0) {
      throw createCommandError("INVALID_TARGET", "typeText requires a targetId.");
    }
    if (typeof text !== "string") {
      throw createCommandError("INVALID_COMMAND", "typeText requires text (string).");
    }
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) {
      throw createCommandError("TAB_NOT_FOUND", "No browser tab is available for typing.");
    }
    const target = this.requireAttachedTarget(resolvedTabId);
    await this.focusTargetForTextInput(resolvedTabId, target.sessionId, targetId);
    if (options.slowly === true) {
      for (const ch of Array.from(text)) {
        await this.connection.send("Input.insertText", { text: ch }, target.sessionId);
      }
    } else if (text.length > 0) {
      await this.connection.send("Input.insertText", { text }, target.sessionId);
    }
    if (options.submit === true) {
      await this.dispatchKeyboardKey(target.sessionId, "Enter");
    }
    this.sessions.touchSession(resolvedTabId);
    await this.refreshSnapshot(resolvedTabId).catch(() => void 0);
    return {
      tabId: resolvedTabId,
      targetId,
      text,
      submitted: options.submit === true
    };
  }
  async selectOptions(tabId, targetId, values) {
    await this.connect();
    if (typeof targetId !== "string" || targetId.length === 0) {
      throw createCommandError("INVALID_TARGET", "selectOptions requires a targetId.");
    }
    if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== "string")) {
      throw createCommandError("INVALID_COMMAND", "selectOptions requires one or more string values.");
    }
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) {
      throw createCommandError("TAB_NOT_FOUND", "No browser tab is available for option selection.");
    }
    const target = this.requireAttachedTarget(resolvedTabId);
    const selected = await this.evaluateInSession(
      target.sessionId,
      buildSelectOptionsExpression(await this.targetEvaluationPoint(resolvedTabId, targetId), values)
    );
    this.sessions.touchSession(resolvedTabId);
    await this.refreshSnapshot(resolvedTabId).catch(() => void 0);
    return {
      tabId: resolvedTabId,
      targetId,
      values: selected
    };
  }
  async fillForm(tabId, fields) {
    await this.connect();
    if (!Array.isArray(fields) || fields.length === 0) {
      throw createCommandError("INVALID_COMMAND", "fillForm requires one or more fields.");
    }
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) {
      throw createCommandError("TAB_NOT_FOUND", "No browser tab is available for form filling.");
    }
    const target = this.requireAttachedTarget(resolvedTabId);
    const preparedFields = await Promise.all(fields.map(async (field, index) => {
      if (!isFillFormField(field)) {
        throw createCommandError("INVALID_COMMAND", `fillForm field ${index} is invalid.`, { index });
      }
      return {
        ...field,
        point: await this.targetEvaluationPoint(resolvedTabId, field.targetId)
      };
    }));
    await this.evaluateInSession(
      target.sessionId,
      buildFillFormExpression(preparedFields)
    );
    this.sessions.touchSession(resolvedTabId);
    await this.refreshSnapshot(resolvedTabId).catch(() => void 0);
    return {
      tabId: resolvedTabId,
      fields: fields.map((field) => ({
        ...field.name ? { name: field.name } : {},
        targetId: field.targetId,
        type: field.type
      }))
    };
  }
  async fileUpload(tabId, paths) {
    await this.connect();
    if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string")) {
      throw createCommandError("INVALID_COMMAND", "fileUpload paths must be an array of strings.");
    }
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) {
      throw createCommandError("TAB_NOT_FOUND", "No browser tab is available for file upload.");
    }
    const record = await this.waitForPendingFileChooser(resolvedTabId, FILE_CHOOSER_WAIT_TIMEOUT_MS);
    if (!record) {
      throw createCommandError("FILE_CHOOSER_NOT_FOUND", "No pending file chooser is available to upload to.");
    }
    if (typeof record.backendNodeId !== "number") {
      throw createCommandError("INVALID_COMMAND", "Pending file chooser does not expose a file input node.");
    }
    if (!record.multiple && paths.length > 1) {
      throw createCommandError("INVALID_COMMAND", "Cannot upload multiple files to a single-file chooser.");
    }
    const absolutePaths = paths.map((path) => resolve(path));
    try {
      await this.connection.send(
        "DOM.setFileInputFiles",
        {
          files: absolutePaths,
          backendNodeId: record.backendNodeId
        },
        record.sessionId
      );
      record.paths = absolutePaths;
      record.cancelled = absolutePaths.length === 0;
      record.handled = true;
      record.handledTimestamp = Date.now();
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
    this.sessions.touchSession(resolvedTabId);
    await this.refreshSnapshot(resolvedTabId).catch(() => void 0);
    return {
      tabId: resolvedTabId,
      paths: absolutePaths,
      cancelled: absolutePaths.length === 0,
      fileChooser: toPublicFileChooser(record)
    };
  }
  async drop(tabId, targetId, data, paths) {
    await this.connect();
    if (typeof targetId !== "string" || targetId.length === 0) {
      throw createCommandError("INVALID_TARGET", "drop requires a targetId.");
    }
    if (!isDropData(data)) {
      throw createCommandError("INVALID_COMMAND", "drop data must be an object with string values.");
    }
    if (!Array.isArray(paths) || paths.some((path) => typeof path !== "string")) {
      throw createCommandError("INVALID_COMMAND", "drop paths must be an array of strings.");
    }
    if (Object.keys(data).length === 0 && paths.length === 0) {
      throw createCommandError("INVALID_COMMAND", "drop requires at least one of: data, paths.");
    }
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) {
      throw createCommandError("TAB_NOT_FOUND", "No browser tab is available for drop.");
    }
    const target = this.requireAttachedTarget(resolvedTabId);
    const absolutePaths = paths.map((path) => resolve(path));
    const files = await Promise.all(absolutePaths.map((path) => filePayloadFromPath(path)));
    await this.evaluateInSession(
      target.sessionId,
      buildDropExpression(await this.targetEvaluationPoint(resolvedTabId, targetId), { data, files })
    );
    this.sessions.touchSession(resolvedTabId);
    await this.refreshSnapshot(resolvedTabId).catch(() => void 0);
    return {
      tabId: resolvedTabId,
      targetId,
      paths: absolutePaths,
      dataTypes: Object.keys(data)
    };
  }
  async handleDialog(tabId, options) {
    await this.connect();
    if (typeof options?.accept !== "boolean") {
      throw createCommandError("INVALID_COMMAND", "handleDialog requires accept (boolean).");
    }
    const resolvedTabId = this.resolveTabId(tabId);
    if (resolvedTabId == null) {
      throw createCommandError("TAB_NOT_FOUND", "No browser tab is available for dialog handling.");
    }
    const record = this.dialogs.find((dialog) => dialog.tabId === resolvedTabId && !dialog.handled);
    if (!record) {
      throw createCommandError("DIALOG_NOT_FOUND", "No pending dialog is available to handle.");
    }
    try {
      await this.connection.send(
        "Page.handleJavaScriptDialog",
        {
          accept: options.accept,
          ...typeof options.promptText === "string" ? { promptText: options.promptText } : {}
        },
        record.sessionId
      );
      record.accepted = options.accept;
      if (typeof options.promptText === "string") record.promptText = options.promptText;
      record.handled = true;
      record.handledTimestamp = Date.now();
      if (record.actionPromise) {
        await record.actionPromise.catch(() => void 0);
      }
    } catch (error) {
      record.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
    this.sessions.touchSession(resolvedTabId);
    await this.refreshSnapshot(resolvedTabId).catch(() => void 0);
    return {
      tabId: resolvedTabId,
      armed: false,
      dialog: toPublicDialog(record)
    };
  }
  async injectManifest(tabId, manifest) {
    const target = this.targetManager.getTarget(tabId);
    if (!target?.sessionId) {
      throw createCommandError(
        "TAB_NOT_FOUND",
        `No session for tabId ${tabId}.`,
        { tabId }
      );
    }
    const jsonLiteral = JSON.stringify(JSON.stringify(manifest));
    const escaped = jsonLiteral.replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    const expression = `window.__agrune_manifest__ = JSON.parse(${escaped});if (window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}] && typeof window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}].reloadRuntime === 'function') {  window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}].reloadRuntime();}`;
    await this.evaluateInSession(target.sessionId, expression);
    await this.refreshSnapshot(tabId);
  }
  async runMacro(tabId, macroId, params = {}) {
    const target = this.targetManager.getTarget(tabId);
    if (!target?.sessionId) {
      throw createCommandError("TAB_NOT_FOUND", `No session for tabId ${tabId}.`, { tabId });
    }
    const macroIdLiteral = JSON.stringify(macroId);
    const paramsJson = JSON.stringify(JSON.stringify(params)).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
    const expression = `(async () => {  const rt = window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}];  if (!rt || typeof rt.runMacro !== 'function') {    return { status: 'step-error', stepIndex: -1, error: 'runtime not ready', macroId: ${macroIdLiteral}, stepCount: 0 };  }  return await rt.runMacro({ macroId: ${macroIdLiteral}, params: JSON.parse(${paramsJson}) });})()`;
    const raw = await this.evaluateInSession(target.sessionId, expression);
    if (!raw || typeof raw !== "object" || typeof raw.status !== "string") {
      throw createCommandError("INVALID_COMMAND", "MacroRunner returned invalid result.", { raw });
    }
    return raw;
  }
  async doConnect() {
    const wsEndpoint = await this.resolveWsEndpoint();
    await this.connection.connect(wsEndpoint);
    this.resolvedWsEndpoint = wsEndpoint;
    this.ensureRecoverySupervisor();
    this.subscribeLifecycle();
    this.registerBindings();
    await this.targetManager.start(this.connection);
  }
  async waitForSessionClosed(tabId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.sessions.getSession(tabId)) return true;
      await new Promise((resolve2) => setTimeout(resolve2, 50));
    }
    return !this.sessions.getSession(tabId);
  }
  requireAttachedTarget(tabId) {
    const target = this.targetManager.getTarget(tabId);
    if (!target?.sessionId) {
      throw createCommandError(
        "TAB_NOT_FOUND",
        `No active browser target exists for tabId ${tabId}.`,
        { tabId }
      );
    }
    return target;
  }
  async playwrightPageForTab(browser, tabId) {
    const session = this.listSessions().find((candidate) => candidate.tabId === tabId);
    if (!session) {
      throw createCommandError("TAB_NOT_FOUND", `No browser tab exists for tabId ${tabId}.`, { tabId });
    }
    const pages = browser.contexts().flatMap((context) => context.pages()).filter((page) => !page.isClosed());
    if (pages.length === 0) {
      throw createCommandError("TAB_NOT_FOUND", "Playwright did not expose any pages for the CDP browser.");
    }
    const sameUrl = pages.filter((page) => page.url() === session.url);
    if (sameUrl.length === 1) return sameUrl[0];
    if (sameUrl.length > 1 && session.title) {
      for (const page of sameUrl) {
        const title = await page.title().catch(() => "");
        if (title === session.title) return page;
      }
    }
    const sessionIndex = this.listSessions().findIndex((candidate) => candidate.tabId === tabId);
    if (sessionIndex >= 0 && pages[sessionIndex]) return pages[sessionIndex];
    return sameUrl[0] ?? pages[0];
  }
  async waitForNavigationSettled(tabId, expectedUrl, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const target = this.targetManager.getTarget(tabId);
      if (!target?.sessionId) {
        throw createCommandError("TAB_NOT_FOUND", `No active browser target exists for tabId ${tabId}.`, { tabId });
      }
      try {
        const state = await this.evaluateInSession(
          target.sessionId,
          `(() => ({ url: location.href, title: document.title, readyState: document.readyState }))()`
        );
        if (state?.url === expectedUrl && (state.readyState === "interactive" || state.readyState === "complete")) {
          this.sessions.openSession(tabId, state.url, state.title);
          return;
        }
      } catch {
      }
      if (target.url === expectedUrl && target.title) {
        this.sessions.openSession(tabId, target.url, target.title);
      }
      await new Promise((resolve2) => setTimeout(resolve2, 100));
    }
    throw createCommandError(
      "TIMEOUT",
      `Timed out waiting for tabId ${tabId} to navigate to ${expectedUrl}.`,
      { tabId, url: expectedUrl }
    );
  }
  navigationResult(tabId, fallbackUrl) {
    const session = this.sessions.getSession(tabId);
    return {
      tabId,
      url: session?.url ?? fallbackUrl,
      title: session?.title ?? ""
    };
  }
  async fullPageScreenshotClip(sessionId) {
    const metrics = await this.connection.send("Page.getLayoutMetrics", {}, sessionId);
    const size = metrics.cssContentSize ?? metrics.contentSize;
    const width = typeof size?.width === "number" ? size.width : NaN;
    const height = typeof size?.height === "number" ? size.height : NaN;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw createCommandError("INVALID_COMMAND", "CDP Page.getLayoutMetrics did not return content size.");
    }
    return {
      x: 0,
      y: 0,
      width: Math.ceil(width),
      height: Math.ceil(height),
      scale: 1
    };
  }
  async targetScreenshotClip(tabId, sessionId, targetId) {
    const snapshotTarget = await this.findSnapshotTarget(tabId, targetId);
    if (!snapshotTarget) {
      return this.selectorScreenshotClip(sessionId, targetId);
    }
    if (!snapshotTarget.center || !snapshotTarget.size) {
      throw createCommandError("INVALID_TARGET", `target has no screenshot bounds: ${targetId}`, { targetId });
    }
    const width = Number(snapshotTarget.size.w);
    const height = Number(snapshotTarget.size.h);
    const centerX = Number(snapshotTarget.center.x);
    const centerY = Number(snapshotTarget.center.y);
    if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(centerX) || !Number.isFinite(centerY) || width <= 0 || height <= 0) {
      throw createCommandError("INVALID_TARGET", `target has invalid screenshot bounds: ${targetId}`, { targetId });
    }
    const scroll = await this.evaluateInSession(
      sessionId,
      `(() => ({ x: window.scrollX, y: window.scrollY }))()`
    ).catch(() => ({ x: 0, y: 0 }));
    return {
      x: Math.max(0, scroll.x + centerX - width / 2),
      y: Math.max(0, scroll.y + centerY - height / 2),
      width: Math.ceil(width),
      height: Math.ceil(height),
      scale: 1
    };
  }
  async selectorScreenshotClip(sessionId, selector) {
    const bounds = await this.resolveSelectorBounds(sessionId, selector);
    if (bounds.width <= 0 || bounds.height <= 0) {
      throw createCommandError("INVALID_TARGET", `selector has invalid screenshot bounds: ${selector}`, {
        targetId: selector
      });
    }
    return {
      x: Math.max(0, Math.floor(bounds.x)),
      y: Math.max(0, Math.floor(bounds.y)),
      width: Math.ceil(bounds.width),
      height: Math.ceil(bounds.height),
      scale: 1
    };
  }
  async targetEvaluationExpression(tabId, sessionId, targetId, source, arg) {
    const snapshotTarget = await this.findSnapshotTarget(tabId, targetId);
    if (!snapshotTarget) {
      await this.ensureUniqueSelectorTarget(sessionId, targetId);
      return buildSelectorEvaluationExpression(source, arg, targetId);
    }
    if (!snapshotTarget.center) {
      throw createCommandError("INVALID_TARGET", `target has no evaluation point: ${targetId}`, { targetId });
    }
    const x = Number(snapshotTarget.center.x);
    const y = Number(snapshotTarget.center.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw createCommandError("INVALID_TARGET", `target has invalid evaluation point: ${targetId}`, { targetId });
    }
    return buildTargetEvaluationExpression(source, arg, { x, y });
  }
  async targetEvaluationPoint(tabId, targetId) {
    const snapshotTarget = await this.findSnapshotTarget(tabId, targetId);
    if (!snapshotTarget) {
      throw createCommandError("TARGET_NOT_FOUND", `target not found: ${targetId}`, { targetId });
    }
    if (!snapshotTarget.center) {
      throw createCommandError("INVALID_TARGET", `target has no evaluation point: ${targetId}`, { targetId });
    }
    const x = Number(snapshotTarget.center.x);
    const y = Number(snapshotTarget.center.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw createCommandError("INVALID_TARGET", `target has invalid evaluation point: ${targetId}`, { targetId });
    }
    return { x, y };
  }
  async findSnapshotTarget(tabId, targetId) {
    const snapshot = this.sessions.getSnapshot(tabId) ?? await this.refreshSnapshot(tabId).catch(() => null);
    return snapshot?.targets.find((candidate) => candidate.targetId === targetId) ?? null;
  }
  async ensureUniqueSelectorTarget(sessionId, selector) {
    const probe = await this.evaluateInSession(
      sessionId,
      buildSelectorProbeExpression(selector)
    );
    assertUniqueSelectorProbe(selector, probe);
  }
  async resolveSelectorBounds(sessionId, selector) {
    const probe = await this.evaluateInSession(
      sessionId,
      buildSelectorBoundsProbeExpression(selector)
    );
    assertUniqueSelectorProbe(selector, probe);
    if (probe.status !== "ok" || !("bounds" in probe)) {
      throw createCommandError("TARGET_NOT_FOUND", `target not found: ${selector}`, { targetId: selector });
    }
    return probe.bounds;
  }
  async focusTargetForTextInput(tabId, sessionId, targetId) {
    await this.evaluateInSession(
      sessionId,
      buildTargetFocusExpression(await this.targetEvaluationPoint(tabId, targetId))
    );
  }
  async dispatchKeyboardKey(sessionId, key) {
    const keyInfo = keyboardKeyInfo(key);
    const base = {
      key: keyInfo.key,
      code: keyInfo.code,
      modifiers: keyInfo.modifiers,
      ...typeof keyInfo.windowsVirtualKeyCode === "number" ? {
        windowsVirtualKeyCode: keyInfo.windowsVirtualKeyCode,
        nativeVirtualKeyCode: keyInfo.windowsVirtualKeyCode
      } : {}
    };
    const textParams = keyInfo.text ? { text: keyInfo.text, unmodifiedText: keyInfo.text } : {};
    await this.connection.send("Input.dispatchKeyEvent", {
      type: keyInfo.text ? "keyDown" : "rawKeyDown",
      ...base,
      ...textParams
    }, sessionId);
    await this.connection.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      ...base
    }, sessionId);
  }
  async resolveWsEndpoint() {
    if (this.options.mode === "attach") {
      if (!this.options.wsEndpoint) {
        throw new Error("CDP attach mode requires a wsEndpoint.");
      }
      return resolveCdpWsEndpoint(this.options.wsEndpoint);
    }
    const launched = await this.launcher.launch({
      chromePath: this.options.chromePath,
      headless: this.options.headless,
      userDataDir: this.options.userDataDir,
      args: this.options.chromeArgs,
      startUrl: this.options.startUrl
    });
    return launched.wsEndpoint;
  }
  registerBindings() {
    if (this.bindingsRegistered) return;
    this.bindingsRegistered = true;
    this.connection.on("Runtime.bindingCalled", this.handleBindingCalled);
    this.connection.on("Input.dragIntercepted", this.handleDragIntercepted);
    this.connection.on("Runtime.consoleAPICalled", this.handleConsoleAPICalled);
    this.connection.on("Runtime.exceptionThrown", this.handleExceptionThrown);
    this.connection.on("Page.frameNavigated", this.handleFrameNavigated);
    this.connection.on("Network.requestWillBeSent", this.handleNetworkRequestWillBeSent);
    this.connection.on("Network.requestWillBeSentExtraInfo", this.handleNetworkRequestWillBeSentExtraInfo);
    this.connection.on("Network.responseReceived", this.handleNetworkResponseReceived);
    this.connection.on("Network.responseReceivedExtraInfo", this.handleNetworkResponseReceivedExtraInfo);
    this.connection.on("Network.loadingFailed", this.handleNetworkLoadingFailed);
    this.connection.on("Page.javascriptDialogOpening", this.handleJavascriptDialogOpening);
    this.connection.on("Page.javascriptDialogClosed", this.handleJavascriptDialogClosed);
    this.connection.on("Page.fileChooserOpened", this.handleFileChooserOpened);
  }
  unregisterBindings() {
    if (!this.bindingsRegistered) return;
    this.bindingsRegistered = false;
    this.connection.off("Runtime.bindingCalled", this.handleBindingCalled);
    this.connection.off("Input.dragIntercepted", this.handleDragIntercepted);
    this.connection.off("Runtime.consoleAPICalled", this.handleConsoleAPICalled);
    this.connection.off("Runtime.exceptionThrown", this.handleExceptionThrown);
    this.connection.off("Page.frameNavigated", this.handleFrameNavigated);
    this.connection.off("Network.requestWillBeSent", this.handleNetworkRequestWillBeSent);
    this.connection.off("Network.requestWillBeSentExtraInfo", this.handleNetworkRequestWillBeSentExtraInfo);
    this.connection.off("Network.responseReceived", this.handleNetworkResponseReceived);
    this.connection.off("Network.responseReceivedExtraInfo", this.handleNetworkResponseReceivedExtraInfo);
    this.connection.off("Network.loadingFailed", this.handleNetworkLoadingFailed);
    this.connection.off("Page.javascriptDialogOpening", this.handleJavascriptDialogOpening);
    this.connection.off("Page.javascriptDialogClosed", this.handleJavascriptDialogClosed);
    this.connection.off("Page.fileChooserOpened", this.handleFileChooserOpened);
  }
  async prepareTarget(target) {
    if (!target.sessionId || this.preparedSessions.has(target.sessionId)) return;
    this.preparedSessions.add(target.sessionId);
    const injector = new CdpRuntimeInjector(this.connection);
    try {
      await injector.prepareSession(target.sessionId);
      await this.connection.send(
        "Page.setInterceptFileChooserDialog",
        { enabled: true },
        target.sessionId
      );
      if (Object.keys(this.desiredConfig).length > 0) {
        await this.evaluateInSession(
          target.sessionId,
          `window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}]?.applyConfig(${JSON.stringify(this.desiredConfig)})`
        );
      }
      if (this.activityBlocks.hasActiveBlocks()) {
        await this.setAgentActivity(target.sessionId, true);
      }
      await this.refreshSnapshot(target.tabId);
    } catch (error) {
      this.preparedSessions.delete(target.sessionId);
      throw error;
    }
  }
  async refreshSnapshot(tabId) {
    const target = this.targetManager.getTarget(tabId);
    if (!target?.sessionId) return;
    const snapshot = await this.evaluateInSession(
      target.sessionId,
      `window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}]?.getSnapshot() ?? null`
    );
    if (!snapshot) return;
    this.sessions.updateSnapshot(tabId, snapshot);
    this.snapshotUpdateCbs.forEach((cb) => cb(tabId, snapshot));
  }
  async onBindingCalled(params, sessionId) {
    if (typeof sessionId !== "string") return;
    if (params.name !== "agrune_send") return;
    if (typeof params.payload !== "string") return;
    const target = this.targetManager.getTargetBySessionId(sessionId);
    if (!target) return;
    const message = JSON.parse(params.payload);
    switch (message.type) {
      case "runtime_ready":
        await this.refreshSnapshot(target.tabId);
        return;
      case "snapshot_update": {
        const snapshot = this.asSnapshot(message.data);
        if (!snapshot) return;
        this.sessions.updateSnapshot(target.tabId, snapshot);
        this.snapshotUpdateCbs.forEach((cb) => cb(target.tabId, snapshot));
        return;
      }
      case "cdp_request":
        await this.handleCdpRequest(target, message.data);
        return;
      default:
        return;
    }
  }
  async onDragIntercepted(params, sessionId) {
    if (typeof sessionId !== "string") return;
    await this.dispatchCdpMessage(sessionId, {
      type: "cdp_event",
      method: "Input.dragIntercepted",
      params
    });
  }
  async handleCdpRequest(target, data) {
    if (!target.sessionId) return;
    if (!data || typeof data !== "object") return;
    const request = data;
    if (typeof request.requestId !== "string" || typeof request.method !== "string" || !request.params || typeof request.params !== "object") {
      return;
    }
    try {
      const result = await this.connection.send(
        request.method,
        request.params,
        target.sessionId
      );
      await this.dispatchCdpMessage(target.sessionId, {
        type: "cdp_response",
        requestId: request.requestId,
        result
      });
    } catch (error) {
      await this.dispatchCdpMessage(target.sessionId, {
        type: "cdp_response",
        requestId: request.requestId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  async dispatchCdpMessage(sessionId, detail) {
    await this.evaluateInSession(
      sessionId,
      `window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}]?.dispatchCdpMessage(${JSON.stringify(detail)})`
    );
  }
  recordConsoleMessage(params, sessionId) {
    const tabId = this.tabIdForSession(sessionId);
    if (tabId == null) return;
    this.ensureConsoleState(tabId);
    const stackTrace = params.stackTrace;
    const callFrame = firstCallFrame(stackTrace);
    const args2 = Array.isArray(params.args) ? params.args : [];
    const type = typeof params.type === "string" ? params.type : "log";
    this.consoleMessagesByTab.get(tabId).push({
      tabId,
      level: normalizeConsoleLevel(type),
      type,
      text: consoleTextFromArgs(args2),
      timestamp: typeof params.timestamp === "number" ? params.timestamp : Date.now(),
      navigationIndex: this.navigationIndexByTab.get(tabId) ?? 0,
      location: {
        url: typeof callFrame?.url === "string" ? callFrame.url : this.sessions.getSession(tabId)?.url ?? "",
        lineNumber: typeof callFrame?.lineNumber === "number" ? callFrame.lineNumber : 0,
        columnNumber: typeof callFrame?.columnNumber === "number" ? callFrame.columnNumber : 0
      }
    });
  }
  recordExceptionThrown(params, sessionId) {
    const tabId = this.tabIdForSession(sessionId);
    if (tabId == null) return;
    this.ensureConsoleState(tabId);
    const details = params.exceptionDetails;
    const exception = details?.exception;
    const stackTrace = details?.stackTrace;
    const callFrame = firstCallFrame(stackTrace);
    this.consoleMessagesByTab.get(tabId).push({
      tabId,
      level: "error",
      type: "pageerror",
      text: exceptionText(details, exception),
      timestamp: typeof params.timestamp === "number" ? params.timestamp : Date.now(),
      navigationIndex: this.navigationIndexByTab.get(tabId) ?? 0,
      location: {
        url: typeof callFrame?.url === "string" ? callFrame.url : this.sessions.getSession(tabId)?.url ?? "",
        lineNumber: typeof details?.lineNumber === "number" ? details.lineNumber : typeof callFrame?.lineNumber === "number" ? callFrame.lineNumber : 0,
        columnNumber: typeof details?.columnNumber === "number" ? details.columnNumber : typeof callFrame?.columnNumber === "number" ? callFrame.columnNumber : 0
      }
    });
  }
  recordFrameNavigated(params, sessionId) {
    const tabId = this.tabIdForSession(sessionId);
    if (tabId == null) return;
    const frame = params.frame;
    if (!frame || typeof frame.parentId === "string") return;
    this.ensureConsoleState(tabId);
    this.navigationIndexByTab.set(tabId, (this.navigationIndexByTab.get(tabId) ?? 0) + 1);
  }
  recordJavascriptDialogOpening(params, sessionId) {
    const tabId = this.tabIdForSession(sessionId);
    if (tabId == null || !sessionId) return;
    const type = typeof params.type === "string" ? params.type : "alert";
    const record = {
      id: this.nextDialogId++,
      tabId,
      sessionId,
      type,
      message: typeof params.message === "string" ? params.message : "",
      ...typeof params.defaultPrompt === "string" ? { defaultValue: params.defaultPrompt } : {},
      timestamp: Date.now(),
      handled: false
    };
    this.dialogs.push(record);
    this.notifyDialogWaiters(record);
  }
  recordJavascriptDialogClosed(params, sessionId) {
    const tabId = this.tabIdForSession(sessionId);
    if (tabId == null) return;
    const pending = this.dialogs.find((dialog) => dialog.tabId === tabId && !dialog.handled);
    if (!pending) return;
    pending.handled = true;
    pending.accepted = params.result === true;
    if (typeof params.userInput === "string") pending.promptText = params.userInput;
    pending.handledTimestamp = Date.now();
  }
  waitForNextDialog(tabId, afterId) {
    const existing = this.dialogs.find((dialog) => dialog.tabId === tabId && dialog.id > afterId && !dialog.handled);
    if (existing) {
      return {
        promise: Promise.resolve(existing),
        cancel() {
        }
      };
    }
    let waiter = null;
    const promise = new Promise((resolve2) => {
      waiter = { tabId, afterId, resolve: resolve2 };
      this.dialogWaiters.push(waiter);
    });
    return {
      promise,
      cancel: () => {
        if (!waiter) return;
        const index = this.dialogWaiters.indexOf(waiter);
        if (index >= 0) this.dialogWaiters.splice(index, 1);
      }
    };
  }
  notifyDialogWaiters(dialog) {
    for (let index = this.dialogWaiters.length - 1; index >= 0; index -= 1) {
      const waiter = this.dialogWaiters[index];
      if (waiter.tabId !== dialog.tabId || dialog.id <= waiter.afterId) continue;
      this.dialogWaiters.splice(index, 1);
      waiter.resolve(dialog);
    }
  }
  recordFileChooserOpened(params, sessionId) {
    const tabId = this.tabIdForSession(sessionId);
    if (tabId == null || !sessionId) return;
    const mode = params.mode === "selectMultiple" ? "selectMultiple" : "selectSingle";
    const backendNodeId = typeof params.backendNodeId === "number" ? params.backendNodeId : void 0;
    this.fileChoosers.push({
      id: this.nextFileChooserId++,
      tabId,
      sessionId,
      timestamp: Date.now(),
      mode,
      multiple: mode === "selectMultiple",
      handled: false,
      ...typeof backendNodeId === "number" ? { backendNodeId } : {}
    });
  }
  async waitForPendingFileChooser(tabId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const pending = this.fileChoosers.find((fileChooser) => fileChooser.tabId === tabId && !fileChooser.handled);
      if (pending) return pending;
      await new Promise((resolve2) => setTimeout(resolve2, 50));
    }
    return this.fileChoosers.find((fileChooser) => fileChooser.tabId === tabId && !fileChooser.handled) ?? null;
  }
  ensureConsoleState(tabId) {
    if (!this.consoleMessagesByTab.has(tabId)) this.consoleMessagesByTab.set(tabId, []);
    if (!this.navigationIndexByTab.has(tabId)) this.navigationIndexByTab.set(tabId, 0);
  }
  recordNetworkRequestWillBeSent(params, sessionId) {
    const tabId = this.tabIdForSession(sessionId);
    if (tabId == null || !sessionId) return;
    const requestId = typeof params.requestId === "string" ? params.requestId : null;
    const request = params.request;
    if (!requestId || !request) return;
    this.ensureNetworkState(tabId);
    const records = this.networkRequestsByTab.get(tabId);
    const resourceType = normalizeResourceType(typeof params.type === "string" ? params.type : "other");
    const navigationIndex = resourceType === "document" ? (this.navigationIndexByTab.get(tabId) ?? 0) + 1 : this.navigationIndexByTab.get(tabId) ?? 0;
    const record = {
      index: records.length + 1,
      requestId,
      sessionId,
      tabId,
      method: typeof request.method === "string" ? request.method : "GET",
      url: typeof request.url === "string" ? request.url : "",
      resourceType,
      isNavigationRequest: resourceType === "document",
      timestamp: typeof params.wallTime === "number" ? Math.round(params.wallTime * 1e3) : Date.now(),
      navigationIndex,
      requestHeaders: headersFromUnknown(request.headers),
      requestBody: typeof request.postData === "string" ? request.postData : null,
      responseHeaders: {}
    };
    records.push(record);
    this.networkByRequestId.set(networkRequestKey(sessionId, requestId), record);
  }
  recordNetworkRequestExtraInfo(params, sessionId) {
    const record = this.networkRecordFor(params, sessionId);
    if (!record) return;
    record.requestHeaders = { ...record.requestHeaders, ...headersFromUnknown(params.headers) };
  }
  recordNetworkResponseReceived(params, sessionId) {
    const record = this.networkRecordFor(params, sessionId);
    if (!record) return;
    const response = params.response;
    if (!response) return;
    if (typeof response.status === "number") record.status = response.status;
    if (typeof response.statusText === "string") record.statusText = response.statusText;
    record.responseHeaders = { ...record.responseHeaders, ...headersFromUnknown(response.headers) };
  }
  recordNetworkResponseExtraInfo(params, sessionId) {
    const record = this.networkRecordFor(params, sessionId);
    if (!record) return;
    if (typeof params.statusCode === "number") record.status = params.statusCode;
    record.responseHeaders = { ...record.responseHeaders, ...headersFromUnknown(params.headers) };
  }
  recordNetworkLoadingFailed(params, sessionId) {
    const record = this.networkRecordFor(params, sessionId);
    if (!record) return;
    record.failureText = typeof params.errorText === "string" ? params.errorText : "Request failed";
  }
  networkRecordFor(params, sessionId) {
    if (!sessionId || typeof params.requestId !== "string") return null;
    return this.networkByRequestId.get(networkRequestKey(sessionId, params.requestId)) ?? null;
  }
  ensureNetworkState(tabId) {
    if (!this.networkRequestsByTab.has(tabId)) this.networkRequestsByTab.set(tabId, []);
  }
  async networkRequestPartValue(record, part) {
    if (part === "request-headers") return record.requestHeaders;
    if (part === "request-body") return record.requestBody;
    if (part === "response-headers") {
      if (!hasNetworkResponse(record)) {
        throw createCommandError("NETWORK_RESPONSE_NOT_FOUND", `No response is available for request ${record.index}.`, { index: record.index });
      }
      return record.responseHeaders;
    }
    if (!hasNetworkResponse(record)) {
      throw createCommandError("NETWORK_RESPONSE_NOT_FOUND", `No response is available for request ${record.index}.`, { index: record.index });
    }
    return this.networkResponseBody(record);
  }
  async networkResponseBody(record) {
    if (!hasNetworkResponse(record)) return null;
    if (record.responseBody !== void 0) return record.responseBody;
    try {
      const response = await this.connection.send("Network.getResponseBody", { requestId: record.requestId }, record.sessionId);
      const body = typeof response.body === "string" ? response.body : "";
      record.responseBody = response.base64Encoded === true ? Buffer.from(body, "base64").toString("utf8") : body;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw createCommandError("NETWORK_RESPONSE_NOT_FOUND", `Response body is unavailable: ${message}`, { index: record.index });
    }
    return record.responseBody;
  }
  tabIdForSession(sessionId) {
    if (!sessionId) return null;
    return this.targetManager.getTargets().find((target) => target.sessionId === sessionId)?.tabId ?? null;
  }
  async evaluateInSession(sessionId, expression) {
    const response = await this.connection.send(
      "Runtime.evaluate",
      {
        expression,
        awaitPromise: true,
        returnByValue: true
      },
      sessionId
    );
    if (response.exceptionDetails) {
      const details = response.exceptionDetails;
      const text = typeof details.text === "string" ? details.text : "Runtime evaluation failed.";
      throw new Error(text);
    }
    const remoteObject = response.result;
    return remoteObject?.value ?? void 0;
  }
  runBackgroundTask(task) {
    void task.catch((error) => {
      if (this.isIgnorableDisconnectError(error)) {
        return;
      }
      console.error("[agrune quick-mode] background task failed:", error);
    });
  }
  async setAgentActivity(sessionId, active) {
    await this.evaluateInSession(
      sessionId,
      `window[${JSON.stringify(QUICK_MODE_RUNTIME_KEY)}]?.setAgentActivity(${JSON.stringify(active)})`
    );
  }
  async withActivityBlocks(kind, effect) {
    const guardId = this.activityBlocks.pushGuard(`${kind}:guard`);
    try {
      return await effect();
    } finally {
      this.activityBlocks.pushTimed(`${kind}:tail`, ACTIVITY_TAIL_BLOCK_MS);
      this.activityBlocks.release(guardId);
    }
  }
  isIgnorableDisconnectError(error) {
    if (error instanceof Error) {
      return error.message === "CDP connection disconnected." || error.message === "CDP connection is not open." || error.message === "Session with given id not found.";
    }
    return false;
  }
  toSession(tabId) {
    const session = this.sessions.getSession(tabId);
    return {
      tabId,
      url: session?.url ?? "",
      title: session?.title ?? "",
      hasSnapshot: session?.snapshot != null,
      snapshotVersion: session?.snapshot?.version ?? null
    };
  }
  ensureRecoverySupervisor() {
    if (this.recovery) return;
    const strategy = {
      canRelaunch: this.options.mode === "launch",
      reconnect: () => this.performReconnect(),
      relaunchAndReconnect: () => this.performRelaunch()
    };
    const supervisor = new RecoverySupervisor(strategy);
    supervisor.onEvent((event) => {
      if (event.kind === "succeeded") this.recoveredFlag = true;
      for (const listener of this.recoveryListeners) {
        try {
          listener(event);
        } catch {
        }
      }
    });
    this.recovery = supervisor;
  }
  subscribeLifecycle() {
    this.unsubscribeDisconnect?.();
    this.unsubscribeExit?.();
    this.unsubscribeDisconnect = this.connection.onDisconnect((reason) => {
      void this.triggerRecovery("connection_lost", reason);
    });
    if (this.options.mode === "launch") {
      this.unsubscribeExit = this.launcher.onUnexpectedExit(({ code, signal }) => {
        const reason = new Error(
          `Chrome exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"}).`
        );
        void this.triggerRecovery("chrome_crashed", reason);
      });
    }
  }
  async triggerRecovery(cause, reason) {
    if (!this.recovery) this.ensureRecoverySupervisor();
    try {
      await this.recovery.trigger(cause, reason);
    } catch {
    }
  }
  async performReconnect() {
    this.preparedSessions.clear();
    this.unregisterBindings();
    this.targetManager.stop();
    if (!this.resolvedWsEndpoint) {
      throw new Error("Cannot reconnect: no cached ws endpoint.");
    }
    await this.connection.connect(this.resolvedWsEndpoint);
    this.registerBindings();
    await this.targetManager.start(this.connection);
    await this.reprepareAllTargets();
  }
  async performRelaunch() {
    this.preparedSessions.clear();
    this.unregisterBindings();
    this.targetManager.stop();
    await this.connection.disconnect().catch(() => {
    });
    if (this.launcher.hasChild()) {
      await this.launcher.kill().catch(() => {
      });
    }
    const launched = await this.launcher.launch({
      chromePath: this.options.chromePath,
      headless: this.options.headless,
      userDataDir: this.options.userDataDir,
      args: this.options.chromeArgs,
      startUrl: this.options.startUrl
    });
    this.resolvedWsEndpoint = launched.wsEndpoint;
    await this.connection.connect(launched.wsEndpoint);
    this.registerBindings();
    await this.targetManager.start(this.connection);
    await this.reprepareAllTargets();
  }
  async reprepareAllTargets() {
    const targets = this.targetManager.getTargets();
    for (const target of targets) {
      if (!target.sessionId) continue;
      this.preparedSessions.delete(target.sessionId);
      await this.prepareTarget(target).catch(() => {
      });
    }
  }
  async waitForTarget(targetId, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const target = this.targetManager.getTargets().find((candidate) => candidate.targetId === targetId);
      if (target?.sessionId) return target;
      await new Promise((resolve2) => setTimeout(resolve2, 50));
    }
    return null;
  }
  asSnapshot(value) {
    if (!value || typeof value !== "object") return null;
    const snapshot = value;
    if (typeof snapshot.version !== "number" || !Array.isArray(snapshot.groups) || !Array.isArray(snapshot.targets) || typeof snapshot.url !== "string" || typeof snapshot.title !== "string") {
      return null;
    }
    return value;
  }
};
function screenshotTypeFromPath(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "jpeg";
  if (ext === ".png") return "png";
  return null;
}
function keyboardKeyInfo(input) {
  const parts = input.includes("+") && input !== "+" ? input.split("+").filter((part) => part.length > 0) : [input];
  let modifiers = 0;
  let keyPart = parts[parts.length - 1] ?? input;
  for (const part of parts.slice(0, -1)) {
    const modifier = modifierBit(part);
    if (modifier === 0) {
      keyPart = input;
      modifiers = 0;
      break;
    }
    modifiers |= modifier;
  }
  const base = baseKeyboardKeyInfo(keyPart);
  if ((modifiers & (CDP_ALT_MODIFIER | CDP_CONTROL_MODIFIER | CDP_META_MODIFIER)) !== 0) {
    const rest = { ...base };
    delete rest.text;
    return { ...rest, modifiers };
  }
  return { ...base, modifiers };
}
function baseKeyboardKeyInfo(key) {
  const specialName = Object.keys(SPECIAL_KEY_INFO).find((name) => name.toLowerCase() === key.toLowerCase());
  const special = specialName ? SPECIAL_KEY_INFO[specialName] : void 0;
  if (special) return special;
  const functionKey = /^F([1-9]|1[0-2])$/.exec(key);
  if (functionKey) {
    const number = Number(functionKey[1]);
    return {
      key,
      code: key,
      windowsVirtualKeyCode: 111 + number
    };
  }
  if (key.length === 1 && /[a-zA-Z]/.test(key)) {
    return {
      key,
      code: `Key${key.toUpperCase()}`,
      text: key,
      windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0)
    };
  }
  if (key.length === 1 && /[0-9]/.test(key)) {
    return {
      key,
      code: `Digit${key}`,
      text: key,
      windowsVirtualKeyCode: key.charCodeAt(0)
    };
  }
  if (key.length === 1) {
    return {
      key,
      code: "",
      text: key,
      windowsVirtualKeyCode: key.charCodeAt(0)
    };
  }
  return { key, code: key };
}
function modifierBit(part) {
  switch (part.toLowerCase()) {
    case "alt":
    case "option":
      return CDP_ALT_MODIFIER;
    case "control":
    case "ctrl":
      return CDP_CONTROL_MODIFIER;
    case "meta":
    case "command":
    case "cmd":
      return CDP_META_MODIFIER;
    case "shift":
      return CDP_SHIFT_MODIFIER;
    default:
      return 0;
  }
}
function compileRunCodeUnsafeFunction(source) {
  let candidate;
  try {
    candidate = new Function(`return (${source});`)();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw createCommandError(
      "INVALID_COMMAND",
      `browser_run_code_unsafe code must be a JavaScript function: ${message}`
    );
  }
  if (typeof candidate !== "function") {
    throw createCommandError("INVALID_COMMAND", "browser_run_code_unsafe code must evaluate to a function.");
  }
  return candidate;
}
function toJsonCompatible(value) {
  const seen = /* @__PURE__ */ new WeakSet();
  const serialized = JSON.stringify(value, (_key, nested) => {
    if (typeof nested === "bigint") return nested.toString();
    if (typeof nested === "function") return `[Function ${nested.name || "anonymous"}]`;
    if (typeof nested === "symbol") return String(nested);
    if (nested && typeof nested === "object") {
      if (seen.has(nested)) return "[Circular]";
      seen.add(nested);
    }
    return nested;
  });
  if (serialized === void 0) return String(value);
  return JSON.parse(serialized);
}
function buildPageEvaluationExpression(source, arg) {
  return `(${evaluatePageInBrowser.toString()})(${JSON.stringify({ source, arg })})`;
}
function buildTargetEvaluationExpression(source, arg, point) {
  return `(() => {
    const payload = ${JSON.stringify({ source, arg })};
    const point = ${JSON.stringify(point)};
    const el = document.elementFromPoint(point.x, point.y);
    if (!el) throw new Error('No element exists at the target evaluation point.');
    return (${evaluateTargetInBrowser.toString()})(el, payload);
  })()`;
}
function buildSelectorEvaluationExpression(source, arg, selector) {
  return `(() => {
    const payload = ${JSON.stringify({ source, arg })};
    const selector = ${JSON.stringify(selector)};
    const elements = document.querySelectorAll(selector);
    if (elements.length === 0) throw new Error('No element matches selector: ' + selector);
    if (elements.length > 1) throw new Error('Selector is not unique: ' + selector);
    return (${evaluateTargetInBrowser.toString()})(elements[0], payload);
  })()`;
}
function buildSelectorProbeExpression(selector) {
  return `(() => {
    try {
      const elements = document.querySelectorAll(${JSON.stringify(selector)});
      if (elements.length === 0) return { status: 'not-found', count: 0 };
      if (elements.length > 1) return { status: 'not-unique', count: elements.length };
      return { status: 'ok', count: 1 };
    } catch (error) {
      return { status: 'invalid', message: error instanceof Error ? error.message : String(error) };
    }
  })()`;
}
function buildSelectorBoundsProbeExpression(selector) {
  return `(() => {
    try {
      const elements = document.querySelectorAll(${JSON.stringify(selector)});
      if (elements.length === 0) return { status: 'not-found', count: 0 };
      if (elements.length > 1) return { status: 'not-unique', count: elements.length };
      const rect = elements[0].getBoundingClientRect();
      return {
        status: 'ok',
        count: 1,
        bounds: {
          x: window.scrollX + rect.left,
          y: window.scrollY + rect.top,
          width: rect.width,
          height: rect.height,
        },
      };
    } catch (error) {
      return { status: 'invalid', message: error instanceof Error ? error.message : String(error) };
    }
  })()`;
}
function assertUniqueSelectorProbe(selector, probe) {
  if (!probe || typeof probe !== "object") {
    throw createCommandError("INVALID_TARGET", `invalid selector probe result: ${selector}`, { targetId: selector });
  }
  if (probe.status === "ok") return;
  if (probe.status === "not-found") {
    throw createCommandError("TARGET_NOT_FOUND", `target not found: ${selector}`, { targetId: selector });
  }
  if (probe.status === "not-unique") {
    throw createCommandError("INVALID_TARGET", `selector is not unique: ${selector}`, {
      targetId: selector,
      count: probe.count
    });
  }
  throw createCommandError("INVALID_TARGET", `invalid selector: ${selector}`, {
    targetId: selector,
    reason: probe.message
  });
}
function buildTargetFocusExpression(point) {
  return `(() => {
    const point = ${JSON.stringify(point)};
    const el = document.elementFromPoint(point.x, point.y);
    if (!el) throw new Error('No element exists at the target typing point.');
    const target = el.closest('input, textarea, [contenteditable], select') || el;
    if (typeof target.focus !== 'function') {
      throw new Error('Target element cannot be focused for typing.');
    }
    target.focus({ preventScroll: true });
    return true;
  })()`;
}
function buildSelectOptionsExpression(point, values) {
  return `(() => {
    const point = ${JSON.stringify(point)};
    const requested = ${JSON.stringify(values)};
    const el = document.elementFromPoint(point.x, point.y);
    if (!el) throw new Error('No element exists at the target selection point.');
    const select = el.closest('select');
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('Target element is not a select element.');
    }
    if (!select.multiple && requested.length > 1) {
      throw new Error('Cannot select multiple values in a single-select element.');
    }
    const options = Array.from(select.options);
    const missing = requested.filter(value => !options.some(option => option.value === value));
    if (missing.length > 0) {
      throw new Error('Select option value not found: ' + missing.join(', '));
    }
    const selected = new Set(requested);
    for (const option of options) {
      option.selected = selected.has(option.value);
    }
    select.dispatchEvent(new Event('input', { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return Array.from(select.selectedOptions).map(option => option.value);
  })()`;
}
function isFillFormField(field) {
  if (!field || typeof field !== "object" || Array.isArray(field)) return false;
  const candidate = field;
  return (candidate.name === void 0 || typeof candidate.name === "string") && typeof candidate.targetId === "string" && candidate.targetId.length > 0 && (candidate.type === "textbox" || candidate.type === "checkbox" || candidate.type === "radio" || candidate.type === "combobox" || candidate.type === "slider") && (typeof candidate.value === "string" || typeof candidate.value === "boolean" || typeof candidate.value === "number");
}
function buildFillFormExpression(fields) {
  return `(${fillFormInBrowser.toString()})(${JSON.stringify(fields)})`;
}
function buildDropExpression(point, payload) {
  return `(() => {
    const point = ${JSON.stringify(point)};
    const payload = ${JSON.stringify(payload)};
    const el = document.elementFromPoint(point.x, point.y);
    if (!el) throw new Error('No element exists at the target drop point.');
    return (${dispatchDropInBrowser.toString()})(el, payload);
  })()`;
}
async function filePayloadFromPath(path) {
  const buffer = await readFile(path);
  return {
    name: basename(path),
    type: mimeTypeForPath(path),
    base64: buffer.toString("base64")
  };
}
function mimeTypeForPath(path) {
  switch (extname(path).toLowerCase()) {
    case ".css":
      return "text/css";
    case ".csv":
      return "text/csv";
    case ".gif":
      return "image/gif";
    case ".htm":
    case ".html":
      return "text/html";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".js":
    case ".mjs":
      return "text/javascript";
    case ".json":
      return "application/json";
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".txt":
      return "text/plain";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
function isDropData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === "string");
}
async function dispatchDropInBrowser(el, payload) {
  const base64ToArrayBuffer = (base64) => {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  };
  const dataTransfer = new DataTransfer();
  for (const [type, value] of Object.entries(payload.data)) {
    dataTransfer.setData(type, value);
  }
  for (const file of payload.files) {
    dataTransfer.items.add(new File([base64ToArrayBuffer(file.base64)], file.name, { type: file.type }));
  }
  const options = {
    bubbles: true,
    cancelable: true,
    dataTransfer
  };
  el.dispatchEvent(new DragEvent("dragenter", options));
  el.dispatchEvent(new DragEvent("dragover", options));
  el.dispatchEvent(new DragEvent("drop", options));
}
function fillFormInBrowser(fields) {
  const completed = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const el = document.elementFromPoint(field.point.x, field.point.y);
    if (!el) {
      throw new Error(`No element exists at form field ${index} (${field.targetId}).`);
    }
    try {
      applyField(el, field);
      completed.push({
        ...field.name ? { name: field.name } : {},
        targetId: field.targetId,
        type: field.type
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fill form field ${field.name ?? field.targetId}: ${message}`);
    }
  }
  return completed;
  function applyField(el, field) {
    switch (field.type) {
      case "textbox": {
        const target = closestOrSelf(el, "input, textarea, [contenteditable]");
        if (target instanceof HTMLElement && target.isContentEditable) {
          target.focus({ preventScroll: true });
          target.textContent = String(field.value);
          target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: String(field.value) }));
          return;
        }
        if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLTextAreaElement)) {
          throw new Error("textbox field is not an input, textarea, or contenteditable element");
        }
        setNativeValue(target, String(field.value));
        dispatchInputAndChange(target);
        return;
      }
      case "checkbox":
      case "radio": {
        const target = closestOrSelf(el, `input[type="${field.type}"]`);
        if (!(target instanceof HTMLInputElement) || target.type !== field.type) {
          throw new Error(`${field.type} field is not an input[type="${field.type}"] element`);
        }
        target.checked = booleanFillFormValue(field.value);
        dispatchInputAndChange(target);
        return;
      }
      case "combobox": {
        const target = closestOrSelf(el, "select");
        if (!(target instanceof HTMLSelectElement)) {
          throw new Error("combobox field is not a select element");
        }
        const value = String(field.value);
        if (!Array.from(target.options).some((option) => option.value === value)) {
          throw new Error(`select option value not found: ${value}`);
        }
        setNativeValue(target, value);
        dispatchInputAndChange(target);
        return;
      }
      case "slider": {
        const target = closestOrSelf(el, 'input[type="range"]');
        if (!(target instanceof HTMLInputElement) || target.type !== "range") {
          throw new Error('slider field is not an input[type="range"] element');
        }
        setNativeValue(target, String(field.value));
        dispatchInputAndChange(target);
        return;
      }
    }
  }
  function closestOrSelf(el, selector) {
    return el.closest(selector) ?? el;
  }
  function setNativeValue(element, value) {
    const prototype = Object.getPrototypeOf(element);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  }
  function dispatchInputAndChange(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }
  function booleanFillFormValue(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on", "checked"].includes(normalized)) return true;
    if (["0", "false", "no", "off", "unchecked"].includes(normalized)) return false;
    throw new Error("checkbox/radio values must be boolean-like");
  }
}
function evaluatePageInBrowser(payload) {
  const source = payload.source.trim();
  try {
    const candidate = new Function(`return (${source})`)();
    if (typeof candidate === "function") {
      return candidate(payload.arg);
    }
  } catch {
  }
  return new Function("arg", `return (${payload.source})`)(payload.arg);
}
function evaluateTargetInBrowser(el, payload) {
  const source = payload.source.trim();
  try {
    const candidate = new Function(`return (${source})`)();
    if (typeof candidate === "function") {
      return candidate(el, payload.arg);
    }
  } catch {
  }
  return new Function("el", "arg", `return (${payload.source})`)(el, payload.arg);
}
function normalizeConsoleLevel(type) {
  if (type === "debug") return "debug";
  if (type === "warning") return "warning";
  if (type === "error" || type === "assert") return "error";
  return "info";
}
function severityForConsoleLevel(level) {
  switch (level) {
    case "debug":
      return 10;
    case "info":
      return 20;
    case "warning":
      return 30;
    case "error":
      return 40;
  }
}
function consoleTextFromArgs(args2) {
  return args2.map(remoteObjectText).join(" ");
}
function remoteObjectText(object) {
  if ("value" in object) {
    const value = object.value;
    if (typeof value === "string") return value;
    if (value === void 0) return "undefined";
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  if (typeof object.description === "string") return object.description;
  if (typeof object.type === "string") return object.type;
  return "";
}
function exceptionText(details, exception) {
  if (typeof exception?.description === "string") return exception.description;
  if ("value" in (exception ?? {})) return remoteObjectText(exception);
  if (typeof details?.text === "string") return details.text;
  return "Uncaught exception";
}
function firstCallFrame(stackTrace) {
  const callFrames = stackTrace?.callFrames;
  return Array.isArray(callFrames) && callFrames.length > 0 && typeof callFrames[0] === "object" ? callFrames[0] : null;
}
function toNetworkRequestSummary(record) {
  return {
    index: record.index,
    tabId: record.tabId,
    method: record.method,
    url: record.url,
    resourceType: record.resourceType,
    isNavigationRequest: record.isNavigationRequest,
    timestamp: record.timestamp,
    navigationIndex: record.navigationIndex,
    ...typeof record.status === "number" ? { status: record.status } : {},
    ...record.statusText ? { statusText: record.statusText } : {},
    ...record.failureText ? { failureText: record.failureText } : {}
  };
}
function networkRequestMatches(record, query, activeNavigationIndex) {
  if (!query.all && record.navigationIndex !== activeNavigationIndex) return false;
  if (!query.includeStatic && isSuccessfulStaticRequest(record)) return false;
  if (!query.filter) return true;
  try {
    return new RegExp(query.filter).test(record.url);
  } catch {
    return record.url.includes(query.filter);
  }
}
function isSuccessfulStaticRequest(record) {
  if (typeof record.status !== "number" || record.status < 200 || record.status >= 400) return false;
  return STATIC_RESOURCE_TYPES.has(record.resourceType);
}
function hasNetworkResponse(record) {
  return typeof record.status === "number" && !record.failureText;
}
function headersFromUnknown(value) {
  if (!value || typeof value !== "object") return {};
  const headers = {};
  for (const [key, headerValue] of Object.entries(value)) {
    headers[key.toLowerCase()] = typeof headerValue === "string" ? headerValue : String(headerValue);
  }
  return headers;
}
function normalizeResourceType(type) {
  return type.toLowerCase();
}
function networkRequestKey(sessionId, requestId) {
  return `${sessionId}:${requestId}`;
}
function toPublicDialog(record) {
  return {
    id: record.id,
    tabId: record.tabId,
    type: record.type,
    message: record.message,
    ...typeof record.defaultValue === "string" ? { defaultValue: record.defaultValue } : {},
    timestamp: record.timestamp,
    handled: record.handled,
    ...typeof record.accepted === "boolean" ? { accepted: record.accepted } : {},
    ...typeof record.promptText === "string" ? { promptText: record.promptText } : {},
    ...typeof record.handledTimestamp === "number" ? { handledTimestamp: record.handledTimestamp } : {},
    ...record.error ? { error: record.error } : {}
  };
}
function removeDialogsForTab(records, tabId) {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].tabId === tabId) records.splice(index, 1);
  }
}
function toPublicFileChooser(record) {
  return {
    id: record.id,
    tabId: record.tabId,
    timestamp: record.timestamp,
    multiple: record.multiple,
    handled: record.handled,
    ...record.paths ? { paths: [...record.paths] } : {},
    ...typeof record.cancelled === "boolean" ? { cancelled: record.cancelled } : {},
    ...typeof record.handledTimestamp === "number" ? { handledTimestamp: record.handledTimestamp } : {},
    ...record.error ? { error: record.error } : {}
  };
}
function removeFileChoosersForTab(records, tabId) {
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].tabId === tabId) records.splice(index, 1);
  }
}
var STATIC_RESOURCE_TYPES = /* @__PURE__ */ new Set(["font", "image", "media", "script", "stylesheet"]);
async function resolveCdpWsEndpoint(endpoint) {
  if (endpoint.startsWith("ws://") || endpoint.startsWith("wss://")) {
    return endpoint;
  }
  if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
    throw new Error(`Unsupported CDP attach endpoint: ${endpoint}`);
  }
  const versionUrl = new URL("/json/version", endpoint.endsWith("/") ? endpoint : `${endpoint}/`);
  const response = await fetch(versionUrl);
  if (!response.ok) {
    throw new Error(`Failed to resolve CDP websocket endpoint from ${versionUrl}: HTTP ${response.status}`);
  }
  const json = await response.json();
  if (typeof json.webSocketDebuggerUrl !== "string") {
    throw new Error(`CDP version response did not include webSocketDebuggerUrl: ${versionUrl}`);
  }
  return json.webSocketDebuggerUrl;
}

// bin/agrune-mcp.ts
import { mkdir as mkdir2 } from "fs/promises";
import { homedir } from "os";
import { join as join3 } from "path";

// src/version.ts
var MCP_SERVER_VERSION = true ? "0.4.1" : "0.0.0";

// bin/agrune-mcp.ts
var HELP_TEXT = `agrune \u2014 AI \uC5D0\uC774\uC804\uD2B8\uC6A9 \uBE0C\uB77C\uC6B0\uC800 \uC790\uB3D9\uD654 MCP \uC11C\uBC84

Usage:
  agrune [options]

Options:
  --headless              Chrome \uC744 headless \uBAA8\uB4DC\uB85C \uC2E4\uD589 (UI \uC5C6\uC74C)
  --attach <endpoint>     \uC774\uBBF8 \uC2E4\uD589 \uC911\uC778 Chrome \uC758 CDP endpoint \uC5D0 \uC5F0\uACB0
                          (\uC608: --attach http://127.0.0.1:9222
                               --attach ws://127.0.0.1:9222/devtools/browser/...)
  --url <url>             Chrome \uAE30\uB3D9 \uC2DC \uC5F4 \uCD08\uAE30 URL (default: about:blank)
  --user-data-dir <path>  Chrome user-data \uB514\uB809\uD130\uB9AC \uC9C0\uC815
                          (default: ~/.agrune/browser-profile)
  --isolated              \uC784\uC2DC Chrome profile \uC0AC\uC6A9. \uC885\uB8CC \uC2DC \uC0AD\uC81C\uB428
  -h, --help              \uC774 \uB3C4\uC6C0\uB9D0 \uCD9C\uB825 \uD6C4 \uC885\uB8CC
  -v, --version           \uBC84\uC804 \uCD9C\uB825 \uD6C4 \uC885\uB8CC

\uC608\uC2DC:
  agrune
  agrune --headless
  agrune --attach http://127.0.0.1:9222
  agrune --user-data-dir ~/.agrune/profile
  agrune --isolated

\uBB38\uC11C: https://github.com/agrune/agrune
`;
var args = process.argv.slice(2);
var argError = validateArgs(args);
if (argError) {
  process.stderr.write(`[agrune] ${argError}
`);
  process.stderr.write("Run `agrune --help` for supported MCP server options.\n");
  process.exit(1);
}
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(HELP_TEXT);
  process.exit(0);
}
if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write(`agrune v${MCP_SERVER_VERSION}
`);
  process.exit(0);
}
var attachEndpoint = getArgValue("--attach");
var headless = args.includes("--headless");
var startUrl = getArgValue("--url");
var isolated = args.includes("--isolated");
var userDataDirArg = getArgValue("--user-data-dir");
if (userDataDirArg && attachEndpoint) {
  process.stderr.write("[agrune] --user-data-dir is ignored when --attach is set\n");
}
if (isolated && userDataDirArg) {
  process.stderr.write("[agrune] --user-data-dir is ignored when --isolated is set\n");
}
var userDataDir = attachEndpoint || isolated ? void 0 : userDataDirArg ?? join3(homedir(), ".agrune", "browser-profile");
if (userDataDir) {
  await mkdir2(userDataDir, { recursive: true });
}
var driver = new CdpDriver({
  mode: attachEndpoint ? "attach" : "launch",
  ...attachEndpoint ? { wsEndpoint: attachEndpoint } : {},
  headless,
  startUrl,
  ...userDataDir && !attachEndpoint ? { userDataDir } : {}
});
var { server } = createMcpServer(driver);
var isMcpHost = !process.stdin.isTTY;
if (isMcpHost) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
if (!isMcpHost) {
  void driver.connect().catch((error) => {
    process.stderr.write(`[agrune] chrome launch error: ${error instanceof Error ? error.message : String(error)}
`);
  });
  setInterval(() => {
  }, 1 << 30);
}
var cleanup = async () => {
  await driver.disconnect().catch(() => {
  });
};
process.once("SIGINT", () => {
  void cleanup().finally(() => process.exit(0));
});
process.once("SIGTERM", () => {
  void cleanup().finally(() => process.exit(0));
});
function getArgValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return void 0;
  return args[index + 1];
}
function validateArgs(argv) {
  const valueFlags = /* @__PURE__ */ new Set(["--attach", "--url", "--user-data-dir"]);
  const booleanFlags = /* @__PURE__ */ new Set(["--headless", "--isolated", "--help", "-h", "--version", "-v"]);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (valueFlags.has(arg)) {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        return `${arg} requires a value.`;
      }
      i += 1;
      continue;
    }
    if (booleanFlags.has(arg)) {
      continue;
    }
    if (arg.startsWith("-")) {
      return `Unsupported option: ${arg}`;
    }
    return `Unsupported command: ${arg}. Agrune now runs the MCP server directly; remove the "${arg}" argument.`;
  }
  return null;
}
//# sourceMappingURL=agrune-mcp.js.map