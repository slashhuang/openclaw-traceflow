#!/usr/bin/env node
/**
 * Node preload：提高 AbortSignal 的 MaxListeners 上限，避免
 * "MaxListenersExceededWarning: Possible EventTarget memory leak detected"
 * （openclaw / fetch/undici 等会对同一 signal 注册多个 abort 监听器）
 * 用法：NODE_OPTIONS="-r ./scripts/preload-max-listeners.js" openclaw ...
 */
const { setMaxListeners } = require('events');

const limit = 64;
const NativeAbortController = global.AbortController;

if (typeof NativeAbortController === 'function') {
  global.AbortController = class AbortController extends NativeAbortController {
    constructor(...args) {
      super(...args);
      try {
        setMaxListeners(limit, this.signal);
      } catch (_) {}
    }
  };
}
