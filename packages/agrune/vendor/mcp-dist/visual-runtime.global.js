"use strict";
var __agrune_visual__ = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/visual-runtime.ts
  var visual_runtime_exports = {};
  __export(visual_runtime_exports, {
    animatePointer: () => animatePointer,
    applyConfig: () => applyConfig,
    getConfig: () => getConfig
  });

  // ../core/dist/index.js
  var DEFAULT_RUNTIME_CONFIG = {
    clickDelayMs: 300,
    pointerDurationMs: 600,
    pointerAnimation: true,
    autoScroll: true,
    cursorName: "default",
    auroraGlow: true,
    auroraTheme: "light",
    surfaceScreenMessages: true,
    detectUnmapped: true
  };
  function mergeRuntimeConfig(base, patch) {
    if (!patch) {
      return { ...base };
    }
    return normalizeRuntimeConfig({
      clickDelayMs: patch.clickDelayMs ?? base.clickDelayMs,
      pointerDurationMs: patch.pointerDurationMs ?? base.pointerDurationMs,
      pointerAnimation: patch.pointerAnimation ?? base.pointerAnimation,
      autoScroll: patch.autoScroll ?? base.autoScroll,
      cursorName: patch.cursorName ?? base.cursorName,
      auroraGlow: patch.auroraGlow ?? base.auroraGlow,
      auroraTheme: patch.auroraTheme ?? base.auroraTheme,
      surfaceScreenMessages: patch.surfaceScreenMessages ?? base.surfaceScreenMessages,
      detectUnmapped: patch.detectUnmapped ?? base.detectUnmapped
    });
  }
  function normalizeRuntimeConfig(input) {
    const clickDelayMs = Number(input?.clickDelayMs ?? DEFAULT_RUNTIME_CONFIG.clickDelayMs);
    const pointerDurationMs = Number(input?.pointerDurationMs ?? DEFAULT_RUNTIME_CONFIG.pointerDurationMs);
    return {
      clickDelayMs: Number.isFinite(clickDelayMs) && clickDelayMs >= 0 ? Math.floor(clickDelayMs) : DEFAULT_RUNTIME_CONFIG.clickDelayMs,
      pointerDurationMs: Number.isFinite(pointerDurationMs) && pointerDurationMs >= 0 ? Math.floor(pointerDurationMs) : DEFAULT_RUNTIME_CONFIG.pointerDurationMs,
      pointerAnimation: typeof input?.pointerAnimation === "boolean" ? input.pointerAnimation : DEFAULT_RUNTIME_CONFIG.pointerAnimation,
      autoScroll: typeof input?.autoScroll === "boolean" ? input.autoScroll : DEFAULT_RUNTIME_CONFIG.autoScroll,
      cursorName: typeof input?.cursorName === "string" && input.cursorName.trim() ? input.cursorName.trim() : DEFAULT_RUNTIME_CONFIG.cursorName,
      auroraGlow: typeof input?.auroraGlow === "boolean" ? input.auroraGlow : DEFAULT_RUNTIME_CONFIG.auroraGlow,
      auroraTheme: input?.auroraTheme === "light" || input?.auroraTheme === "dark" ? input.auroraTheme : DEFAULT_RUNTIME_CONFIG.auroraTheme,
      surfaceScreenMessages: typeof input?.surfaceScreenMessages === "boolean" ? input.surfaceScreenMessages : DEFAULT_RUNTIME_CONFIG.surfaceScreenMessages,
      detectUnmapped: typeof input?.detectUnmapped === "boolean" ? input.detectUnmapped : DEFAULT_RUNTIME_CONFIG.detectUnmapped
    };
  }

  // src/runtime/cursors/index.ts
  var CURSOR_ORB_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none">
  <g filter="url(#agrune-orb-glow)">
    <circle cx="24" cy="24" r="14" fill="url(#agrune-orb-bg)" fill-opacity="0.2"/>
    <circle cx="24" cy="24" r="14" stroke="url(#agrune-orb-stroke)" stroke-width="2" stroke-dasharray="6 4" stroke-linecap="round">
      <animateTransform attributeName="transform" type="rotate" from="0 24 24" to="360 24 24" dur="4s" repeatCount="indefinite"/>
    </circle>
    <circle cx="24" cy="24" r="6" fill="url(#agrune-orb-stroke)">
      <animate attributeName="r" values="5;7;5" dur="2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="24" cy="24" r="2" fill="#ffffff"/>
  </g>
  <defs>
    <linearGradient id="agrune-orb-bg" x1="10" y1="10" x2="38" y2="38" gradientUnits="userSpaceOnUse">
      <stop stop-color="#a855f7"/>
      <stop offset="1" stop-color="#06b6d4"/>
    </linearGradient>
    <linearGradient id="agrune-orb-stroke" x1="10" y1="10" x2="38" y2="38" gradientUnits="userSpaceOnUse">
      <stop stop-color="#d946ef"/>
      <stop offset="1" stop-color="#0ea5e9"/>
    </linearGradient>
    <filter id="agrune-orb-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2.5" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
</svg>`;
  var POINTER_FILL_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cg%3E%3Cpath d='M 15 42 L 15 36.99 Q 15 31.99 23.7 31.99 L 28.05 31.99 Q 32.41 31.99 32.41 21.99 L 32.41 17 Q 32.41 12 41.09 16.95 L 76.31 37.05 Q 85 42 76.31 46.95 L 41.09 67.05 Q 32.41 72 32.41 62.01 L 32.41 57.01 Q 32.41 52.01 23.7 52.01 L 19.35 52.01 Q 15 52.01 15 47.01 Z' fill='%23ffffff' stroke='none'/%3E%3C/g%3E%3C/svg%3E";
  var POINTER_BORDER_MASK_SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' fill='none'%3E%3Cg%3E%3Cpath d='M 15 42 L 15 36.99 Q 15 31.99 23.7 31.99 L 28.05 31.99 Q 32.41 31.99 32.41 21.99 L 32.41 17 Q 32.41 12 41.09 16.95 L 76.31 37.05 Q 85 42 76.31 46.95 L 41.09 67.05 Q 32.41 72 32.41 62.01 L 32.41 57.01 Q 32.41 52.01 23.7 52.01 L 19.35 52.01 Q 15 52.01 15 47.01 Z' fill='none' stroke='%23000000' stroke-width='6' stroke-miterlimit='10'/%3E%3C/g%3E%3C/svg%3E";
  var CURSOR_REGISTRY = {
    default: { kind: "css-layers", width: 75, height: 75, hotspotX: 0, hotspotY: 0 },
    orb: { kind: "svg-inline", width: 48, height: 48, hotspotX: 24, hotspotY: 24, svg: CURSOR_ORB_SVG }
  };
  var CURSOR_NAMES = Object.keys(CURSOR_REGISTRY);
  var DEFAULT_CURSOR_NAME = "default";
  function getCursorMeta(name) {
    return CURSOR_REGISTRY[name] ?? CURSOR_REGISTRY[DEFAULT_CURSOR_NAME];
  }

  // ../../node_modules/.pnpm/ai-motion@0.4.8/node_modules/ai-motion/build/Motion.js
  function computeBorderGeometry(pixelWidth, pixelHeight, borderWidth, glowWidth) {
    const shortSide = Math.max(1, Math.min(pixelWidth, pixelHeight));
    const borderWidthPx = Math.min(borderWidth, 20);
    const glowWidthPx = glowWidth;
    const totalThick = Math.min(borderWidthPx + glowWidthPx, shortSide);
    const insetX = Math.min(totalThick, Math.floor(pixelWidth / 2));
    const insetY = Math.min(totalThick, Math.floor(pixelHeight / 2));
    const toClipX = (x) => x / pixelWidth * 2 - 1;
    const toClipY = (y) => y / pixelHeight * 2 - 1;
    const x0 = 0;
    const x1 = pixelWidth;
    const y0 = 0;
    const y1 = pixelHeight;
    const xi0 = insetX;
    const xi1 = pixelWidth - insetX;
    const yi0 = insetY;
    const yi1 = pixelHeight - insetY;
    const X0 = toClipX(x0);
    const X1 = toClipX(x1);
    const Y0 = toClipY(y0);
    const Y1 = toClipY(y1);
    const Xi0 = toClipX(xi0);
    const Xi1 = toClipX(xi1);
    const Yi0 = toClipY(yi0);
    const Yi1 = toClipY(yi1);
    const u0 = 0;
    const v0 = 0;
    const u1 = 1;
    const v1 = 1;
    const ui0 = insetX / pixelWidth;
    const ui1 = 1 - insetX / pixelWidth;
    const vi0 = insetY / pixelHeight;
    const vi1 = 1 - insetY / pixelHeight;
    const positions = new Float32Array([
      // Top strip
      X0,
      Y0,
      X1,
      Y0,
      X0,
      Yi0,
      X0,
      Yi0,
      X1,
      Y0,
      X1,
      Yi0,
      // Bottom strip
      X0,
      Yi1,
      X1,
      Yi1,
      X0,
      Y1,
      X0,
      Y1,
      X1,
      Yi1,
      X1,
      Y1,
      // Left strip
      X0,
      Yi0,
      Xi0,
      Yi0,
      X0,
      Yi1,
      X0,
      Yi1,
      Xi0,
      Yi0,
      Xi0,
      Yi1,
      // Right strip
      Xi1,
      Yi0,
      X1,
      Yi0,
      Xi1,
      Yi1,
      Xi1,
      Yi1,
      X1,
      Yi0,
      X1,
      Yi1
    ]);
    const uvs = new Float32Array([
      // Top strip
      u0,
      v0,
      u1,
      v0,
      u0,
      vi0,
      u0,
      vi0,
      u1,
      v0,
      u1,
      vi0,
      // Bottom strip
      u0,
      vi1,
      u1,
      vi1,
      u0,
      v1,
      u0,
      v1,
      u1,
      vi1,
      u1,
      v1,
      // Left strip
      u0,
      vi0,
      ui0,
      vi0,
      u0,
      vi1,
      u0,
      vi1,
      ui0,
      vi0,
      ui0,
      vi1,
      // Right strip
      ui1,
      vi0,
      u1,
      vi0,
      ui1,
      vi1,
      ui1,
      vi1,
      u1,
      vi0,
      u1,
      vi1
    ]);
    return { positions, uvs };
  }
  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Failed to create shader");
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader) || "Unknown shader error";
      gl.deleteShader(shader);
      throw new Error(info);
    }
    return shader;
  }
  function createProgram(gl, vertexSource, fragmentSource) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) throw new Error("Failed to create program");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program) || "Unknown link error";
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      throw new Error(info);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return program;
  }
  var fragmentShaderSource = `#version 300 es
precision lowp float;
in vec2 vUV;
out vec4 outColor;
uniform vec2 uResolution;
uniform float uTime;
uniform float uBorderWidth;
uniform float uGlowWidth;
uniform float uBorderRadius;
uniform vec3 uColors[4];
uniform float uGlowExponent;
uniform float uGlowFactor;
const float PI = 3.14159265359;
const float TWO_PI = 2.0 * PI;
const float HALF_PI = 0.5 * PI;
const vec4 startPositions = vec4(0.0, PI, HALF_PI, 1.5 * PI);
const vec4 speeds = vec4(-1.9, -1.9, -1.5, 2.1);
const vec4 innerRadius = vec4(PI * 0.8, PI * 0.7, PI * 0.3, PI * 0.1);
const vec4 outerRadius = vec4(PI * 1.2, PI * 0.9, PI * 0.6, PI * 0.4);
float random(vec2 st) {
return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}
vec2 random2(vec2 st) {
return vec2(random(st), random(st + 1.0));
}
float aaStep(float edge, float d) {
float width = fwidth(d);
return smoothstep(edge - width * 0.5, edge + width * 0.5, d);
}
float aaFract(float x) {
float f = fract(x);
float w = fwidth(x);
float smooth_f = f * (1.0 - smoothstep(1.0 - w, 1.0, f));
return smooth_f;
}
float sdRoundedBox(in vec2 p, in vec2 b, in float r) {
vec2 q = abs(p) - b + r;
return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}
float getInnerGlow(vec2 p, vec2 b, float radius) {
float dist_x = b.x - abs(p.x);
float dist_y = b.y - abs(p.y);
float glow_x = smoothstep(radius, 0.0, dist_x);
float glow_y = smoothstep(radius, 0.0, dist_y);
return 1.0 - (1.0 - glow_x) * (1.0 - glow_y);
}
float getVignette(vec2 uv) {
vec2 vignetteUv = uv;
vignetteUv = vignetteUv * (1.0 - vignetteUv);
float vignette = vignetteUv.x * vignetteUv.y * 25.0;
vignette = pow(vignette, 0.16);
vignette = 1.0 - vignette;
return vignette;
}
float uvToAngle(vec2 uv) {
vec2 center = vec2(0.5);
vec2 dir = uv - center;
return atan(dir.y, dir.x) + PI;
}
void main() {
vec2 uv = vUV;
vec2 pos = uv * uResolution;
vec2 centeredPos = pos - uResolution * 0.5;
vec2 size = uResolution - uBorderWidth;
vec2 halfSize = size * 0.5;
float dBorderBox = sdRoundedBox(centeredPos, halfSize, uBorderRadius);
float border = aaStep(0.0, dBorderBox);
float glow = getInnerGlow(centeredPos, halfSize, uGlowWidth);
float vignette = getVignette(uv);
glow *= vignette;
float posAngle = uvToAngle(uv);
vec4 lightCenter = mod(startPositions + speeds * uTime, TWO_PI);
vec4 angleDist = abs(posAngle - lightCenter);
vec4 disToLight = min(angleDist, TWO_PI - angleDist) / TWO_PI;
float intensityBorder[4];
intensityBorder[0] = 1.0;
intensityBorder[1] = smoothstep(0.4, 0.0, disToLight.y);
intensityBorder[2] = smoothstep(0.4, 0.0, disToLight.z);
intensityBorder[3] = smoothstep(0.2, 0.0, disToLight.w) * 0.5;
vec3 borderColor = vec3(0.0);
for(int i = 0; i < 4; i++) {
borderColor = mix(borderColor, uColors[i], intensityBorder[i]);
}
borderColor *= 1.1;
borderColor = clamp(borderColor, 0.0, 1.0);
float intensityGlow[4];
intensityGlow[0] = smoothstep(0.9, 0.0, disToLight.x);
intensityGlow[1] = smoothstep(0.7, 0.0, disToLight.y);
intensityGlow[2] = smoothstep(0.4, 0.0, disToLight.z);
intensityGlow[3] = smoothstep(0.1, 0.0, disToLight.w) * 0.7;
vec4 breath = smoothstep(0.0, 1.0, sin(uTime * 1.0 + startPositions * PI) * 0.2 + 0.8);
vec3 glowColor = vec3(0.0);
glowColor += uColors[0] * intensityGlow[0] * breath.x;
glowColor += uColors[1] * intensityGlow[1] * breath.y;
glowColor += uColors[2] * intensityGlow[2] * breath.z;
glowColor += uColors[3] * intensityGlow[3] * breath.w * glow;
glow = pow(glow, uGlowExponent);
glow *= random(pos + uTime) * 0.1 + 1.0;
glowColor *= glow * uGlowFactor;
glowColor = clamp(glowColor, 0.0, 1.0);
vec3 color = mix(glowColor, borderColor + glowColor * 0.2, border);
float alpha = mix(glow, 1.0, border);
outColor = vec4(color, alpha);
}`;
  var vertexShaderSource = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
void main() {
vUV = aUV;
gl_Position = vec4(aPosition, 0.0, 1.0);
}`;
  var DEFAULT_COLORS = [
    "rgb(57, 182, 255)",
    "rgb(189, 69, 251)",
    "rgb(255, 87, 51)",
    "rgb(255, 214, 0)"
  ];
  function parseColor(colorStr) {
    const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!match) {
      throw new Error(`Invalid color format: ${colorStr}`);
    }
    const [, r, g, b] = match;
    return [parseInt(r) / 255, parseInt(g) / 255, parseInt(b) / 255];
  }
  var Motion = class {
    element;
    canvas;
    options;
    running = false;
    disposed = false;
    startTime = 0;
    lastTime = 0;
    rafId = null;
    glr;
    observer;
    constructor(options = {}) {
      this.options = {
        width: options.width ?? 600,
        height: options.height ?? 600,
        ratio: options.ratio ?? window.devicePixelRatio ?? 1,
        borderWidth: options.borderWidth ?? 8,
        glowWidth: options.glowWidth ?? 200,
        borderRadius: options.borderRadius ?? 8,
        mode: options.mode ?? "light",
        ...options
      };
      this.canvas = document.createElement("canvas");
      if (this.options.classNames) {
        this.canvas.className = this.options.classNames;
      }
      if (this.options.styles) {
        Object.assign(this.canvas.style, this.options.styles);
      }
      this.canvas.style.display = "block";
      this.canvas.style.transformOrigin = "center";
      this.canvas.style.pointerEvents = "none";
      this.element = this.canvas;
      this.setupGL();
      if (!this.options.skipGreeting) this.greet();
    }
    start() {
      if (this.disposed) throw new Error("Motion instance has been disposed.");
      if (this.running) return;
      if (!this.glr) {
        console.error("WebGL resources are not initialized.");
        return;
      }
      this.running = true;
      this.startTime = performance.now();
      this.resize(this.options.width ?? 600, this.options.height ?? 600, this.options.ratio);
      this.glr.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.glr.gl.useProgram(this.glr.program);
      this.glr.gl.uniform2f(this.glr.uResolution, this.canvas.width, this.canvas.height);
      this.checkGLError(this.glr.gl, "start: after initial setup");
      const loop = () => {
        if (!this.running || !this.glr) return;
        this.rafId = requestAnimationFrame(loop);
        const now = performance.now();
        const delta = now - this.lastTime;
        if (delta < 1e3 / 32) return;
        this.lastTime = now;
        const t = (now - this.startTime) * 1e-3;
        this.render(t);
      };
      this.rafId = requestAnimationFrame(loop);
    }
    pause() {
      if (this.disposed) throw new Error("Motion instance has been disposed.");
      this.running = false;
      if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    }
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      this.running = false;
      if (this.rafId !== null) cancelAnimationFrame(this.rafId);
      const { gl, vao, positionBuffer, uvBuffer, program } = this.glr;
      if (vao) gl.deleteVertexArray(vao);
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      if (uvBuffer) gl.deleteBuffer(uvBuffer);
      gl.deleteProgram(program);
      if (this.observer) this.observer.disconnect();
      this.canvas.remove();
    }
    resize(width, height, ratio) {
      if (this.disposed) throw new Error("Motion instance has been disposed.");
      this.options.width = width;
      this.options.height = height;
      if (ratio) this.options.ratio = ratio;
      if (!this.running) return;
      const { gl, program, vao, positionBuffer, uvBuffer, uResolution } = this.glr;
      const dpr = ratio ?? this.options.ratio ?? window.devicePixelRatio ?? 1;
      const desiredWidth = Math.max(1, Math.floor(width * dpr));
      const desiredHeight = Math.max(1, Math.floor(height * dpr));
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
      if (this.canvas.width !== desiredWidth || this.canvas.height !== desiredHeight) {
        this.canvas.width = desiredWidth;
        this.canvas.height = desiredHeight;
      }
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.checkGLError(gl, "resize: after viewport setup");
      const { positions, uvs } = computeBorderGeometry(
        this.canvas.width,
        this.canvas.height,
        this.options.borderWidth * dpr,
        this.options.glowWidth * dpr
      );
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      const aPosition = gl.getAttribLocation(program, "aPosition");
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
      this.checkGLError(gl, "resize: after position buffer update");
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
      const aUV = gl.getAttribLocation(program, "aUV");
      gl.enableVertexAttribArray(aUV);
      gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
      this.checkGLError(gl, "resize: after UV buffer update");
      gl.useProgram(program);
      gl.uniform2f(uResolution, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.glr.uBorderWidth, this.options.borderWidth * dpr);
      gl.uniform1f(this.glr.uGlowWidth, this.options.glowWidth * dpr);
      gl.uniform1f(this.glr.uBorderRadius, this.options.borderRadius * dpr);
      this.checkGLError(gl, "resize: after uniform updates");
      const now = performance.now();
      this.lastTime = now;
      const t = (now - this.startTime) * 1e-3;
      this.render(t);
    }
    /**
     * Automatically resizes the canvas to match the dimensions of the given element.
     * @note using ResizeObserver
     */
    autoResize(sourceElement) {
      if (this.observer) {
        this.observer.disconnect();
      }
      this.observer = new ResizeObserver(() => {
        const rect = sourceElement.getBoundingClientRect();
        this.resize(rect.width, rect.height);
      });
      this.observer.observe(sourceElement);
    }
    fadeIn() {
      if (this.disposed) throw new Error("Motion instance has been disposed.");
      return new Promise((resolve, reject) => {
        const animation = this.canvas.animate(
          [
            { opacity: 0, transform: "scale(1.2)" },
            { opacity: 1, transform: "scale(1)" }
          ],
          { duration: 300, easing: "ease-out", fill: "forwards" }
        );
        animation.onfinish = () => resolve();
        animation.oncancel = () => reject("canceled");
      });
    }
    fadeOut() {
      if (this.disposed) throw new Error("Motion instance has been disposed.");
      return new Promise((resolve, reject) => {
        const animation = this.canvas.animate(
          [
            { opacity: 1, transform: "scale(1)" },
            { opacity: 0, transform: "scale(1.2)" }
          ],
          { duration: 300, easing: "ease-in", fill: "forwards" }
        );
        animation.onfinish = () => resolve();
        animation.oncancel = () => reject("canceled");
      });
    }
    checkGLError(gl, context) {
      let error = gl.getError();
      if (error !== gl.NO_ERROR) {
        console.group(`\u{1F534} WebGL Error in ${context}`);
        while (error !== gl.NO_ERROR) {
          const errorName = this.getGLErrorName(gl, error);
          console.error(`${errorName} (0x${error.toString(16)})`);
          error = gl.getError();
        }
        console.groupEnd();
      }
    }
    getGLErrorName(gl, error) {
      switch (error) {
        case gl.INVALID_ENUM:
          return "INVALID_ENUM";
        case gl.INVALID_VALUE:
          return "INVALID_VALUE";
        case gl.INVALID_OPERATION:
          return "INVALID_OPERATION";
        case gl.INVALID_FRAMEBUFFER_OPERATION:
          return "INVALID_FRAMEBUFFER_OPERATION";
        case gl.OUT_OF_MEMORY:
          return "OUT_OF_MEMORY";
        case gl.CONTEXT_LOST_WEBGL:
          return "CONTEXT_LOST_WEBGL";
        default:
          return "UNKNOWN_ERROR";
      }
    }
    setupGL() {
      const gl = this.canvas.getContext("webgl2", { antialias: false, alpha: true });
      if (!gl) {
        throw new Error("WebGL2 is required but not available.");
      }
      const program = createProgram(gl, vertexShaderSource, fragmentShaderSource);
      this.checkGLError(gl, "setupGL: after createProgram");
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      this.checkGLError(gl, "setupGL: after VAO creation");
      const pw = this.canvas.width || 2;
      const ph = this.canvas.height || 2;
      const { positions, uvs } = computeBorderGeometry(
        pw,
        ph,
        this.options.borderWidth,
        this.options.glowWidth
      );
      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
      const aPosition = gl.getAttribLocation(program, "aPosition");
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
      this.checkGLError(gl, "setupGL: after position buffer setup");
      const uvBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
      const aUV = gl.getAttribLocation(program, "aUV");
      gl.enableVertexAttribArray(aUV);
      gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, 0, 0);
      this.checkGLError(gl, "setupGL: after UV buffer setup");
      const uResolution = gl.getUniformLocation(program, "uResolution");
      const uTime = gl.getUniformLocation(program, "uTime");
      const uBorderWidth = gl.getUniformLocation(program, "uBorderWidth");
      const uGlowWidth = gl.getUniformLocation(program, "uGlowWidth");
      const uBorderRadius = gl.getUniformLocation(program, "uBorderRadius");
      const uColors = gl.getUniformLocation(program, "uColors");
      const uGlowExponent = gl.getUniformLocation(program, "uGlowExponent");
      const uGlowFactor = gl.getUniformLocation(program, "uGlowFactor");
      gl.useProgram(program);
      gl.uniform1f(uBorderWidth, this.options.borderWidth);
      gl.uniform1f(uGlowWidth, this.options.glowWidth);
      gl.uniform1f(uBorderRadius, this.options.borderRadius);
      if (this.options.mode === "dark") {
        gl.uniform1f(uGlowExponent, 2);
        gl.uniform1f(uGlowFactor, 1.8);
      } else {
        gl.uniform1f(uGlowExponent, 1);
        gl.uniform1f(uGlowFactor, 1);
      }
      const colorVecs = (this.options.colors || DEFAULT_COLORS).map(parseColor);
      for (let i = 0; i < colorVecs.length; i++) {
        gl.uniform3f(gl.getUniformLocation(program, `uColors[${i}]`), ...colorVecs[i]);
      }
      this.checkGLError(gl, "setupGL: after uniform setup");
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      this.glr = {
        gl,
        program,
        vao,
        positionBuffer,
        uvBuffer,
        uResolution,
        uTime,
        uBorderWidth,
        uGlowWidth,
        uBorderRadius,
        uColors
      };
    }
    render(t) {
      if (!this.glr) return;
      const { gl, program, vao, uTime } = this.glr;
      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform1f(uTime, t);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 24);
      this.checkGLError(gl, "render: after draw call");
      gl.bindVertexArray(null);
    }
    greet() {
      console.log(
        `%c\u{1F308} ai-motion ${"0.4.8"} \u{1F308}`,
        "background: linear-gradient(90deg, #39b6ff, #bd45fb, #ff5733, #ffd600); color: white; text-shadow: 0 0 2px rgba(0, 0, 0, 0.2); font-weight: bold; font-size: 1em; padding: 2px 12px; border-radius: 6px;"
      );
    }
  };

  // src/runtime/cursor-animator.ts
  var CURSOR_STYLE_ID = "agrune-cursor-style";
  var CURSOR_CLICK_PRESS_MS = 100;
  var IDLE_TIMEOUT_MS = 5e3;
  var DEFAULT_POINTER_DURATION_MS = 600;
  function resolvePointerDurationMs(durationMs) {
    return Number.isFinite(durationMs) && durationMs != null && durationMs >= 0 ? durationMs : DEFAULT_POINTER_DURATION_MS;
  }
  var cursorState = null;
  function ensureCursorStyles() {
    if (document.getElementById(CURSOR_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = CURSOR_STYLE_ID;
    style.textContent = `
.agrune-cursor{position:fixed;top:0;left:0;width:75px;height:75px;pointer-events:none;z-index:2147483647;will-change:transform;display:none}
.agrune-cursor-filling{position:absolute;width:100%;height:100%;background-image:url("${POINTER_FILL_SVG}");background-size:100% 100%;background-repeat:no-repeat;filter:drop-shadow(3px 4px 4px rgba(0,0,0,0.4));transform-origin:center;transform:rotate(-135deg) scale(1.2);margin-left:-10px;margin-top:-18px}
.agrune-cursor-border{position:absolute;width:100%;height:100%;background:linear-gradient(45deg,rgb(57,182,255),rgb(189,69,251));-webkit-mask-image:url("${POINTER_BORDER_MASK_SVG}");mask-image:url("${POINTER_BORDER_MASK_SVG}");-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;transform-origin:center;transform:rotate(-135deg) scale(1.2);margin-left:-10px;margin-top:-18px}
.agrune-cursor-ripple{position:absolute;width:100%;height:100%;pointer-events:none;margin-left:-50%;margin-top:-50%}
.agrune-cursor-ripple::after{content:"";opacity:0;position:absolute;inset:0;border:4px solid rgba(57,182,255,1);border-radius:50%}
.agrune-cursor.clicking .agrune-cursor-ripple::after{animation:agrune-ripple 300ms ease-out forwards}
@keyframes agrune-ripple{0%{transform:scale(0);opacity:1}100%{transform:scale(2);opacity:0}}
`;
    document.head.appendChild(style);
  }
  function createPointerCursorElement() {
    ensureCursorStyles();
    const el = document.createElement("div");
    el.className = "agrune-cursor";
    el.setAttribute("data-agrune-pointer", "true");
    const ripple = document.createElement("div");
    ripple.className = "agrune-cursor-ripple";
    const filling = document.createElement("div");
    filling.className = "agrune-cursor-filling";
    const border = document.createElement("div");
    border.className = "agrune-cursor-border";
    el.appendChild(ripple);
    el.appendChild(filling);
    el.appendChild(border);
    return el;
  }
  function createSvgCursorElement(meta) {
    const el = document.createElement("div");
    el.setAttribute("data-agrune-pointer", "true");
    el.innerHTML = meta.svg ?? "";
    Object.assign(el.style, {
      position: "fixed",
      top: "0px",
      left: "0px",
      width: `${meta.width}px`,
      height: `${meta.height}px`,
      pointerEvents: "none",
      zIndex: "2147483647",
      willChange: "transform",
      display: "none"
    });
    return el;
  }
  function getOrCreateCursorElement(cursorName) {
    const meta = getCursorMeta(cursorName);
    if (cursorState) {
      if (!cursorState.element.parentElement) {
        document.body.appendChild(cursorState.element);
      }
      if (cursorState.cursorName !== cursorName) {
        cursorState.element.remove();
        const el2 = meta.kind === "css-layers" ? createPointerCursorElement() : createSvgCursorElement(meta);
        document.body.appendChild(el2);
        cursorState.element = el2;
        cursorState.cursorName = cursorName;
      }
      return cursorState;
    }
    const el = meta.kind === "css-layers" ? createPointerCursorElement() : createSvgCursorElement(meta);
    document.body.appendChild(el);
    cursorState = { element: el, cursorName, lastX: null, lastY: null };
    return cursorState;
  }
  function getCursorStartPosition(state) {
    if (state.lastX !== null && state.lastY !== null) {
      return {
        x: state.lastX,
        y: state.lastY
      };
    }
    return {
      x: window.innerWidth + 20,
      y: window.innerHeight / 2
    };
  }
  function getCursorTranslatePosition(coords, meta) {
    return {
      x: coords.clientX - meta.hotspotX,
      y: coords.clientY - meta.hotspotY
    };
  }
  function setCursorTransform(el, x, y, scale = 1) {
    el.style.transform = scale === 1 ? `translate(${x}px, ${y}px)` : `translate(${x}px, ${y}px) scale(${scale})`;
  }
  async function waitForCursorTransition(el) {
    await new Promise((r) => {
      const done = () => {
        el.removeEventListener("transitionend", done);
        r();
      };
      el.addEventListener("transitionend", done, { once: true });
      setTimeout(done, CURSOR_CLICK_PRESS_MS + 50);
    });
  }
  function triggerCursorClick(el) {
    el.classList.remove("clicking");
    void el.offsetHeight;
    el.classList.add("clicking");
  }
  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  function animateWithRAF(durationMs, onFrame) {
    return new Promise((resolve) => {
      const startTime = performance.now();
      function tick(now) {
        const elapsed = now - startTime;
        const raw = Math.min(elapsed / durationMs, 1);
        onFrame(raw);
        if (raw < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(tick);
    });
  }
  function hidePointerOverlay() {
    if (!cursorState) return;
    cursorState.element.style.display = "none";
    cursorState.element.style.transition = "";
    cursorState.element.classList.remove("clicking");
  }
  function getIdleCursorPosition(meta) {
    return {
      x: window.innerWidth - meta.hotspotX - 32,
      y: 32 - meta.hotspotY
    };
  }
  function showIdlePointerOverlay(cursorName) {
    const meta = getCursorMeta(cursorName);
    const state = getOrCreateCursorElement(cursorName);
    const el = state.element;
    const position = state.lastX != null && state.lastY != null ? { x: state.lastX, y: state.lastY } : getIdleCursorPosition(meta);
    el.style.display = "block";
    el.style.transition = "";
    el.classList.remove("clicking");
    setCursorTransform(el, position.x, position.y);
    state.lastX = position.x;
    state.lastY = position.y;
  }
  var motionInstance = null;
  var motionWrapper = null;
  var currentAuroraTheme = "dark";
  function showAuroraGlow(theme) {
    if (motionInstance && motionWrapper?.isConnected && currentAuroraTheme === theme) return;
    if (motionInstance && !motionWrapper?.isConnected) {
      motionInstance = null;
      motionWrapper = null;
    }
    if (motionWrapper && currentAuroraTheme !== theme) {
      const staleWrapper = motionWrapper;
      try {
        motionInstance?.fadeOut();
      } catch {
      }
      staleWrapper.remove();
      motionInstance = null;
      motionWrapper = null;
    }
    try {
      if (!document.body) return;
      const wrapper = document.createElement("div");
      wrapper.setAttribute("data-agrune-aurora", "true");
      Object.assign(wrapper.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483646",
        overflow: "hidden",
        pointerEvents: "none"
      });
      document.body.appendChild(wrapper);
      const motion = new Motion({
        mode: theme,
        borderWidth: 2,
        glowWidth: 800,
        borderRadius: 0,
        styles: { position: "absolute", inset: "0" }
      });
      wrapper.appendChild(motion.element);
      motion.autoResize(wrapper);
      motion.start();
      motion.fadeIn();
      motionInstance = motion;
      motionWrapper = wrapper;
      currentAuroraTheme = theme;
    } catch {
    }
  }
  function hideAuroraGlow() {
    if (!motionInstance || !motionWrapper) return;
    try {
      motionInstance.fadeOut();
    } catch {
    }
    const wrapper = motionWrapper;
    motionInstance = null;
    motionWrapper = null;
    setTimeout(() => wrapper.remove(), 500);
  }

  // src/visual-runtime.ts
  var config = normalizeRuntimeConfig(void 0);
  var idleTimer = null;
  function clearIdleTimer() {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }
  function scheduleIdleHide() {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      idleTimer = null;
      hideVisuals();
    }, IDLE_TIMEOUT_MS);
  }
  function showVisuals() {
    if (config.auroraGlow) {
      try {
        showAuroraGlow(config.auroraTheme);
      } catch {
      }
    } else {
      hideAuroraGlow();
    }
    if (config.pointerAnimation) {
      showIdlePointerOverlay(config.cursorName ?? DEFAULT_CURSOR_NAME);
    } else {
      hidePointerOverlay();
    }
  }
  function hideVisuals() {
    hideAuroraGlow();
    hidePointerOverlay();
  }
  function applyConfig(patch) {
    config = mergeRuntimeConfig(config, patch ?? {});
    if (config.pointerAnimation || config.auroraGlow) {
      showVisuals();
      scheduleIdleHide();
    } else {
      clearIdleTimer();
      hideVisuals();
    }
    return { ...config };
  }
  function getConfig() {
    return { ...config };
  }
  async function animatePointer(x, y, options = {}) {
    if (!config.pointerAnimation) return;
    clearIdleTimer();
    showVisuals();
    const cursorName = config.cursorName ?? DEFAULT_CURSOR_NAME;
    const meta = getCursorMeta(cursorName);
    const state = getOrCreateCursorElement(cursorName);
    const el = state.element;
    const { x: endX, y: endY } = getCursorTranslatePosition({ clientX: x, clientY: y }, meta);
    const { x: startX, y: startY } = getCursorStartPosition(state);
    const durationMs = resolvePointerDurationMs(options.durationMs ?? config.pointerDurationMs);
    el.style.display = "block";
    setCursorTransform(el, startX, startY);
    await animateWithRAF(durationMs, (raw) => {
      const t = easeOutCubic(raw);
      setCursorTransform(el, startX + (endX - startX) * t, startY + (endY - startY) * t);
    });
    if (options.press !== false) {
      el.style.transition = `transform ${CURSOR_CLICK_PRESS_MS}ms ease-in`;
      setCursorTransform(el, endX, endY, 0.85);
      await waitForCursorTransition(el);
      triggerCursorClick(el);
      setCursorTransform(el, endX, endY, 1);
      await waitForCursorTransition(el);
      el.style.transition = "";
    }
    state.lastX = endX;
    state.lastY = endY;
    scheduleIdleHide();
  }
  return __toCommonJS(visual_runtime_exports);
})();
/*! Bundled license information:

ai-motion/build/Motion.js:
  (**
   * AI Motion - WebGL2 animated border with AI-style glow effects
   *
   * @author Simon<gaomeng1900@gmail.com>
   * @license MIT
   * @repository https://github.com/gaomeng1900/ai-motion
   *)
*/
//# sourceMappingURL=visual-runtime.global.js.map