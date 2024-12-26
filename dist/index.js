"use strict";
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

// src/index.ts
var index_exports = {};
__export(index_exports, {
  BatchTraceSpanProcessor: () => BatchTraceSpanProcessor,
  MultiSpanExporter: () => MultiSpanExporter,
  MultiSpanExporterAsync: () => MultiSpanExporterAsync,
  OTLPExporter: () => OTLPExporter,
  SpanImpl: () => SpanImpl,
  __unwrappedFetch: () => __unwrappedFetch,
  createSampler: () => createSampler,
  instrument: () => instrument,
  instrumentDO: () => instrumentDO,
  instrumentPage: () => instrumentPage,
  isAlarm: () => isAlarm,
  isHeadSampled: () => isHeadSampled,
  isMessageBatch: () => isMessageBatch,
  isRequest: () => isRequest,
  isRootErrorSpan: () => isRootErrorSpan,
  multiTailSampler: () => multiTailSampler,
  waitUntilTrace: () => waitUntilTrace,
  withNextSpan: () => withNextSpan
});
module.exports = __toCommonJS(index_exports);

// src/buffer.ts
var import_node_buffer = require("buffer");
globalThis.Buffer = import_node_buffer.Buffer;

// src/sampling.ts
var import_api = require("@opentelemetry/api");
var import_sdk_trace_base = require("@opentelemetry/sdk-trace-base");
function multiTailSampler(samplers) {
  return (traceInfo) => {
    return samplers.reduce((result, sampler) => result || sampler(traceInfo), false);
  };
}
var isHeadSampled = (traceInfo) => {
  const localRootSpan = traceInfo.localRootSpan;
  return (localRootSpan.spanContext().traceFlags & import_api.TraceFlags.SAMPLED) === import_api.TraceFlags.SAMPLED;
};
var isRootErrorSpan = (traceInfo) => {
  const localRootSpan = traceInfo.localRootSpan;
  return localRootSpan.status.code === import_api.SpanStatusCode.ERROR;
};
function createSampler(conf) {
  const ratioSampler = new import_sdk_trace_base.TraceIdRatioBasedSampler(conf.ratio);
  if (typeof conf.acceptRemote === "boolean" && !conf.acceptRemote) {
    return new import_sdk_trace_base.ParentBasedSampler({
      root: ratioSampler,
      remoteParentSampled: ratioSampler,
      remoteParentNotSampled: ratioSampler
    });
  } else {
    return new import_sdk_trace_base.ParentBasedSampler({ root: ratioSampler });
  }
}

// src/sdk.ts
var import_api20 = require("@opentelemetry/api");
var import_resources = require("@opentelemetry/resources");

// src/config.ts
var import_api3 = require("@opentelemetry/api");

// src/types.ts
function isSpanProcessorConfig(config) {
  return !!config.spanProcessors;
}

// src/config.ts
var import_core3 = require("@opentelemetry/core");
var import_sdk_trace_base2 = require("@opentelemetry/sdk-trace-base");

// src/exporter.ts
var import_otlp_transformer = require("@opentelemetry/otlp-transformer");
var import_otlp_exporter_base = require("@opentelemetry/otlp-exporter-base");
var import_core = require("@opentelemetry/core");

// src/wrap.ts
var unwrapSymbol = Symbol("unwrap");
function isWrapped(item) {
  return item && !!item[unwrapSymbol];
}
function isProxyable(item) {
  return item !== null && typeof item === "object" || typeof item === "function";
}
function wrap(item, handler, autoPassthrough = true) {
  if (isWrapped(item) || !isProxyable(item)) {
    return item;
  }
  const proxyHandler = Object.assign({}, handler);
  proxyHandler.get = (target, prop, receiver) => {
    if (prop === unwrapSymbol) {
      return item;
    } else {
      if (handler.get) {
        return handler.get(target, prop, receiver);
      } else if (prop === "bind") {
        return () => receiver;
      } else if (autoPassthrough) {
        return passthroughGet(target, prop);
      }
    }
  };
  proxyHandler.apply = (target, thisArg, argArray) => {
    if (handler.apply) {
      return handler.apply(unwrap(target), unwrap(thisArg), argArray);
    }
  };
  return new Proxy(item, proxyHandler);
}
function unwrap(item) {
  if (item && isWrapped(item)) {
    return item[unwrapSymbol];
  } else {
    return item;
  }
}
function passthroughGet(target, prop, thisArg) {
  const unwrappedTarget = unwrap(target);
  const value = Reflect.get(unwrappedTarget, prop);
  if (typeof value === "function") {
    if (value.constructor.name === "RpcProperty") {
      return (...args) => unwrappedTarget[prop](...args);
    }
    thisArg = thisArg || unwrappedTarget;
    return value.bind(thisArg);
  } else {
    return value;
  }
}

// src/exporter.ts
var defaultHeaders = {
  accept: "application/json",
  "content-type": "application/json"
};
var OTLPExporter = class {
  headers;
  url;
  constructor(config) {
    this.url = config.url;
    this.headers = Object.assign({}, defaultHeaders, config.headers);
  }
  export(items, resultCallback) {
    this._export(items).then(() => {
      resultCallback({ code: import_core.ExportResultCode.SUCCESS });
    }).catch((error) => {
      resultCallback({ code: import_core.ExportResultCode.FAILED, error });
    });
  }
  _export(items) {
    return new Promise((resolve, reject) => {
      try {
        this.send(items, resolve, reject);
      } catch (e) {
        reject(e);
      }
    });
  }
  send(items, onSuccess, onError) {
    const exportMessage = (0, import_otlp_transformer.createExportTraceServiceRequest)(items, {
      useHex: true,
      useLongBits: false
    });
    const body = JSON.stringify(exportMessage);
    const params = {
      method: "POST",
      headers: this.headers,
      body
    };
    unwrap(fetch)(this.url, params).then((response) => {
      if (response.ok) {
        onSuccess();
      } else {
        onError(new import_otlp_exporter_base.OTLPExporterError(`Exporter received a statusCode: ${response.status}`));
      }
    }).catch((error) => {
      onError(new import_otlp_exporter_base.OTLPExporterError(`Exception during export: ${error.toString()}`, error.code, error.stack));
    });
  }
  async shutdown() {
  }
};

// src/spanprocessor.ts
var import_api2 = require("@opentelemetry/api");
var import_core2 = require("@opentelemetry/core");

// src/vendor/ts-checked-fsm/StateMachine.ts
var stateMachine = () => {
  const stateFunc = state();
  return {
    state: stateFunc
  };
};
var state = () => {
  return (_s) => {
    const transitionFunc = transition();
    const stateFunc = state();
    const builder = {
      state: stateFunc,
      transition: transitionFunc
    };
    return builder;
  };
};
var transition = () => {
  return (_curState, _next) => {
    const transitionFunction = transition();
    const actionFunc = action();
    return {
      transition: transitionFunction,
      action: actionFunc
    };
  };
};
var action = () => {
  return (_actionName) => {
    const actionFunc = action();
    const actionHandlerFunc = actionHandler({ handlers: {} });
    return {
      action: actionFunc,
      actionHandler: actionHandlerFunc
    };
  };
};
var actionHandler = (definition) => {
  return (state2, action2, handler) => {
    const untypedState = state2;
    const untypedAction = action2;
    const newDefinition = {
      ...definition,
      handlers: {
        ...definition.handlers,
        [untypedState]: {
          ...definition.handlers[untypedState] ? definition.handlers[untypedState] : {},
          [untypedAction]: handler
        }
      }
    };
    const doneFunc = done(newDefinition);
    const actionHandlerFunc = actionHandler(newDefinition);
    return {
      actionHandler: actionHandlerFunc,
      done: doneFunc
    };
  };
};
var done = (definition) => {
  const doneFunc = (_) => {
    const nextStateFunction = (curState, action2) => {
      const curStateAsState = curState;
      const actionAsAction = action2;
      if (definition.handlers[curStateAsState.stateName] == null) {
        return curState;
      }
      const handler = definition.handlers[curStateAsState.stateName];
      if (handler === void 0) {
        return curState;
      }
      const nextAction = handler[actionAsAction.actionName];
      return nextAction != null ? nextAction(curState, action2) : curState;
    };
    return {
      nextState: nextStateFunction
    };
  };
  return doneFunc;
};

// src/spanprocessor.ts
function newTrace(currentState, { span }) {
  const spanId = span.spanContext().spanId;
  return {
    ...currentState,
    stateName: "in_progress",
    traceId: span.spanContext().traceId,
    localRootSpan: span,
    completedSpans: [],
    inProgressSpanIds: /* @__PURE__ */ new Set([spanId])
  };
}
function newSpan(currentState, { span }) {
  const spanId = span.spanContext().spanId;
  currentState.inProgressSpanIds.add(spanId);
  return { ...currentState };
}
function endSpan(currentState, { span }) {
  currentState.completedSpans.push(span);
  currentState.inProgressSpanIds.delete(span.spanContext().spanId);
  if (currentState.inProgressSpanIds.size === 0) {
    return {
      stateName: "trace_complete",
      traceId: currentState.traceId,
      localRootSpan: currentState.localRootSpan,
      completedSpans: currentState.completedSpans
    };
  } else {
    return { ...currentState };
  }
}
function startExport(currentState, { args }) {
  const { exporter, tailSampler, postProcessor } = args;
  const { traceId, localRootSpan, completedSpans: spans } = currentState;
  const shouldExport = tailSampler({ traceId, localRootSpan, spans });
  if (shouldExport) {
    const exportSpans2 = postProcessor(spans);
    const promise = new Promise((resolve) => {
      exporter.export(exportSpans2, resolve);
    });
    return { stateName: "exporting", promise };
  } else {
    return { stateName: "done" };
  }
}
var { nextState } = stateMachine().state("not_started").state("in_progress").state("trace_complete").state("exporting").state("done").transition("not_started", "in_progress").transition("in_progress", "in_progress").transition("in_progress", "trace_complete").transition("trace_complete", "exporting").transition("trace_complete", "done").transition("exporting", "done").action("startSpan").action("endSpan").action("startExport").action("exportDone").actionHandler("not_started", "startSpan", newTrace).actionHandler("in_progress", "startSpan", newSpan).actionHandler("in_progress", "endSpan", endSpan).actionHandler("trace_complete", "startExport", startExport).actionHandler("exporting", "exportDone", (_c, _a) => {
  return { stateName: "done" };
}).done();
var BatchTraceSpanProcessor = class {
  constructor(exporter) {
    this.exporter = exporter;
  }
  traceLookup = /* @__PURE__ */ new Map();
  localRootSpanLookup = /* @__PURE__ */ new Map();
  inprogressExports = /* @__PURE__ */ new Map();
  action(localRootSpanId, action2) {
    const state2 = this.traceLookup.get(localRootSpanId) || { stateName: "not_started" };
    const newState = nextState(state2, action2);
    if (newState.stateName === "done") {
      this.traceLookup.delete(localRootSpanId);
    } else {
      this.traceLookup.set(localRootSpanId, newState);
    }
    return newState;
  }
  export(localRootSpanId) {
    const config = getActiveConfig();
    if (!config) throw new Error("Config is undefined. This is a bug in the instrumentation logic");
    const { sampling, postProcessor } = config;
    const exportArgs = { exporter: this.exporter, tailSampler: sampling.tailSampler, postProcessor };
    const newState = this.action(localRootSpanId, { actionName: "startExport", args: exportArgs });
    if (newState.stateName === "exporting") {
      const promise = newState.promise;
      this.inprogressExports.set(localRootSpanId, promise);
      promise.then((result) => {
        if (result.code === import_core2.ExportResultCode.FAILED) {
          console.log("Error sending spans to exporter:", result.error);
        }
        this.action(localRootSpanId, { actionName: "exportDone" });
        this.inprogressExports.delete(localRootSpanId);
      });
    }
  }
  onStart(span, parentContext) {
    const spanId = span.spanContext().spanId;
    const parentSpanId = import_api2.trace.getSpan(parentContext)?.spanContext()?.spanId;
    const parentRootSpanId = parentSpanId ? this.localRootSpanLookup.get(parentSpanId) : void 0;
    const localRootSpanId = parentRootSpanId || spanId;
    this.localRootSpanLookup.set(spanId, localRootSpanId);
    this.action(localRootSpanId, { actionName: "startSpan", span });
  }
  onEnd(span) {
    const spanId = span.spanContext().spanId;
    const localRootSpanId = this.localRootSpanLookup.get(spanId);
    if (localRootSpanId) {
      const state2 = this.action(localRootSpanId, { actionName: "endSpan", span });
      if (state2.stateName === "trace_complete") {
        state2.completedSpans.forEach((span2) => {
          this.localRootSpanLookup.delete(span2.spanContext().spanId);
        });
        this.export(localRootSpanId);
      }
    }
  }
  async forceFlush() {
    await Promise.allSettled(this.inprogressExports.values());
  }
  async shutdown() {
  }
};

// src/config.ts
var configSymbol = Symbol("Otel Workers Tracing Configuration");
function setConfig(config, ctx = import_api3.context.active()) {
  return ctx.setValue(configSymbol, config);
}
function getActiveConfig() {
  const config = import_api3.context.active().getValue(configSymbol);
  return config || void 0;
}
function isSpanExporter(exporterConfig) {
  return !!exporterConfig.export;
}
function isSampler(sampler) {
  return !!sampler.shouldSample;
}
function parseConfig(supplied) {
  if (isSpanProcessorConfig(supplied)) {
    const headSampleConf = supplied.sampling?.headSampler;
    const headSampler = headSampleConf ? isSampler(headSampleConf) ? headSampleConf : createSampler(headSampleConf) : new import_sdk_trace_base2.AlwaysOnSampler();
    const spanProcessors = Array.isArray(supplied.spanProcessors) ? supplied.spanProcessors : [supplied.spanProcessors];
    if (spanProcessors.length === 0) {
      console.log(
        "Warning! You must either specify an exporter or your own SpanProcessor(s)/Exporter combination in the open-telemetry configuration."
      );
    }
    return {
      fetch: {
        includeTraceContext: supplied.fetch?.includeTraceContext ?? true
      },
      handlers: {
        fetch: {
          acceptTraceContext: supplied.handlers?.fetch?.acceptTraceContext ?? true
        }
      },
      postProcessor: supplied.postProcessor || ((spans) => spans),
      sampling: {
        headSampler,
        tailSampler: supplied.sampling?.tailSampler || multiTailSampler([isHeadSampled, isRootErrorSpan])
      },
      service: supplied.service,
      spanProcessors,
      propagator: supplied.propagator || new import_core3.W3CTraceContextPropagator(),
      instrumentation: {
        instrumentGlobalCache: supplied.instrumentation?.instrumentGlobalCache ?? true,
        instrumentGlobalFetch: supplied.instrumentation?.instrumentGlobalFetch ?? true
      }
    };
  } else {
    const exporter = isSpanExporter(supplied.exporter) ? supplied.exporter : new OTLPExporter(supplied.exporter);
    const spanProcessors = [new BatchTraceSpanProcessor(exporter)];
    const newConfig = Object.assign(supplied, { exporter: void 0, spanProcessors });
    return parseConfig(newConfig);
  }
}

// src/provider.ts
var import_api7 = require("@opentelemetry/api");

// src/context.ts
var import_api4 = require("@opentelemetry/api");
var import_node_async_hooks = require("async_hooks");
var import_node_events = require("events");
var ADD_LISTENER_METHODS = [
  "addListener",
  "on",
  "once",
  "prependListener",
  "prependOnceListener"
];
var AbstractAsyncHooksContextManager = class {
  /**
   * Binds a the certain context or the active one to the target function and then returns the target
   * @param context A context (span) to be bind to target
   * @param target a function or event emitter. When target or one of its callbacks is called,
   *  the provided context will be used as the active context for the duration of the call.
   */
  bind(context3, target) {
    if (target instanceof import_node_events.EventEmitter) {
      return this._bindEventEmitter(context3, target);
    }
    if (typeof target === "function") {
      return this._bindFunction(context3, target);
    }
    return target;
  }
  _bindFunction(context3, target) {
    const manager = this;
    const contextWrapper = function(...args) {
      return manager.with(context3, () => target.apply(this, args));
    };
    Object.defineProperty(contextWrapper, "length", {
      enumerable: false,
      configurable: true,
      writable: false,
      value: target.length
    });
    return contextWrapper;
  }
  /**
   * By default, EventEmitter call their callback with their context, which we do
   * not want, instead we will bind a specific context to all callbacks that
   * go through it.
   * @param context the context we want to bind
   * @param ee EventEmitter an instance of EventEmitter to patch
   */
  _bindEventEmitter(context3, ee) {
    const map = this._getPatchMap(ee);
    if (map !== void 0) return ee;
    this._createPatchMap(ee);
    ADD_LISTENER_METHODS.forEach((methodName) => {
      if (ee[methodName] === void 0) return;
      ee[methodName] = this._patchAddListener(ee, ee[methodName], context3);
    });
    if (typeof ee.removeListener === "function") {
      ee.removeListener = this._patchRemoveListener(ee, ee.removeListener);
    }
    if (typeof ee.off === "function") {
      ee.off = this._patchRemoveListener(ee, ee.off);
    }
    if (typeof ee.removeAllListeners === "function") {
      ee.removeAllListeners = this._patchRemoveAllListeners(ee, ee.removeAllListeners);
    }
    return ee;
  }
  /**
   * Patch methods that remove a given listener so that we match the "patched"
   * version of that listener (the one that propagate context).
   * @param ee EventEmitter instance
   * @param original reference to the patched method
   */
  _patchRemoveListener(ee, original) {
    const contextManager = this;
    return function(event, listener) {
      const events = contextManager._getPatchMap(ee)?.[event];
      if (events === void 0) {
        return original.call(this, event, listener);
      }
      const patchedListener = events.get(listener);
      return original.call(this, event, patchedListener || listener);
    };
  }
  /**
   * Patch methods that remove all listeners so we remove our
   * internal references for a given event.
   * @param ee EventEmitter instance
   * @param original reference to the patched method
   */
  _patchRemoveAllListeners(ee, original) {
    const contextManager = this;
    return function(event) {
      const map = contextManager._getPatchMap(ee);
      if (map !== void 0) {
        if (arguments.length === 0) {
          contextManager._createPatchMap(ee);
        } else if (map[event] !== void 0) {
          delete map[event];
        }
      }
      return original.apply(this, arguments);
    };
  }
  /**
   * Patch methods on an event emitter instance that can add listeners so we
   * can force them to propagate a given context.
   * @param ee EventEmitter instance
   * @param original reference to the patched method
   * @param [context] context to propagate when calling listeners
   */
  _patchAddListener(ee, original, context3) {
    const contextManager = this;
    return function(event, listener) {
      if (contextManager._wrapped) {
        return original.call(this, event, listener);
      }
      let map = contextManager._getPatchMap(ee);
      if (map === void 0) {
        map = contextManager._createPatchMap(ee);
      }
      let listeners = map[event];
      if (listeners === void 0) {
        listeners = /* @__PURE__ */ new WeakMap();
        map[event] = listeners;
      }
      const patchedListener = contextManager.bind(context3, listener);
      listeners.set(listener, patchedListener);
      contextManager._wrapped = true;
      try {
        return original.call(this, event, patchedListener);
      } finally {
        contextManager._wrapped = false;
      }
    };
  }
  _createPatchMap(ee) {
    const map = /* @__PURE__ */ Object.create(null);
    ee[this._kOtListeners] = map;
    return map;
  }
  _getPatchMap(ee) {
    return ee[this._kOtListeners];
  }
  _kOtListeners = Symbol("OtListeners");
  _wrapped = false;
};
var AsyncLocalStorageContextManager = class extends AbstractAsyncHooksContextManager {
  _asyncLocalStorage;
  constructor() {
    super();
    this._asyncLocalStorage = new import_node_async_hooks.AsyncLocalStorage();
  }
  active() {
    return this._asyncLocalStorage.getStore() ?? import_api4.ROOT_CONTEXT;
  }
  with(context3, fn, thisArg, ...args) {
    const cb = thisArg == null ? fn : fn.bind(thisArg);
    return this._asyncLocalStorage.run(context3, cb, ...args);
  }
  enable() {
    return this;
  }
  disable() {
    this._asyncLocalStorage.disable();
    return this;
  }
};

// src/tracer.ts
var import_api6 = require("@opentelemetry/api");
var import_core5 = require("@opentelemetry/core");
var import_sdk_trace_base3 = require("@opentelemetry/sdk-trace-base");

// src/span.ts
var import_api5 = require("@opentelemetry/api");
var import_core4 = require("@opentelemetry/core");
var import_semantic_conventions = require("@opentelemetry/semantic-conventions");
function transformExceptionAttributes(exception) {
  const attributes = {};
  if (typeof exception === "string") {
    attributes[import_semantic_conventions.SemanticAttributes.EXCEPTION_MESSAGE] = exception;
  } else {
    if (exception.code) {
      attributes[import_semantic_conventions.SemanticAttributes.EXCEPTION_TYPE] = exception.code.toString();
    } else if (exception.name) {
      attributes[import_semantic_conventions.SemanticAttributes.EXCEPTION_TYPE] = exception.name;
    }
    if (exception.message) {
      attributes[import_semantic_conventions.SemanticAttributes.EXCEPTION_MESSAGE] = exception.message;
    }
    if (exception.stack) {
      attributes[import_semantic_conventions.SemanticAttributes.EXCEPTION_STACKTRACE] = exception.stack;
    }
  }
  return attributes;
}
function millisToHr(millis) {
  return [Math.trunc(millis / 1e3), millis % 1e3 * 1e6];
}
function getHrTime(input) {
  const now = Date.now();
  if (!input) {
    return millisToHr(now);
  } else if (input instanceof Date) {
    return millisToHr(input.getTime());
  } else if (typeof input === "number") {
    return millisToHr(input);
  } else if (Array.isArray(input)) {
    return input;
  }
  const v = input;
  throw new Error(`unreachable value: ${JSON.stringify(v)}`);
}
var SpanImpl = class {
  name;
  _spanContext;
  onEnd;
  parentSpanId;
  kind;
  attributes;
  status = {
    code: import_api5.SpanStatusCode.UNSET
  };
  endTime = [0, 0];
  _duration = [0, 0];
  startTime;
  events = [];
  links;
  resource;
  instrumentationLibrary = { name: "@microlabs/otel-cf-workers" };
  _ended = false;
  _droppedAttributesCount = 0;
  _droppedEventsCount = 0;
  _droppedLinksCount = 0;
  constructor(init2) {
    this.name = init2.name;
    this._spanContext = init2.spanContext;
    this.parentSpanId = init2.parentSpanId;
    this.kind = init2.spanKind || import_api5.SpanKind.INTERNAL;
    this.attributes = (0, import_core4.sanitizeAttributes)(init2.attributes);
    this.startTime = getHrTime(init2.startTime);
    this.links = init2.links || [];
    this.resource = init2.resource;
    this.onEnd = init2.onEnd;
  }
  addLink(link) {
    this.links.push(link);
    return this;
  }
  addLinks(links) {
    this.links.push(...links);
    return this;
  }
  spanContext() {
    return this._spanContext;
  }
  setAttribute(key, value) {
    if ((0, import_core4.isAttributeKey)(key) && (0, import_core4.isAttributeValue)(value)) {
      this.attributes[key] = value;
    }
    return this;
  }
  setAttributes(attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      this.setAttribute(key, value);
    }
    return this;
  }
  addEvent(name, attributesOrStartTime, startTime) {
    if ((0, import_core4.isTimeInput)(attributesOrStartTime)) {
      startTime = attributesOrStartTime;
      attributesOrStartTime = void 0;
    }
    const attributes = (0, import_core4.sanitizeAttributes)(attributesOrStartTime);
    const time = getHrTime(startTime);
    this.events.push({ name, attributes, time });
    return this;
  }
  setStatus(status) {
    this.status = status;
    return this;
  }
  updateName(name) {
    this.name = name;
    return this;
  }
  end(endTime) {
    if (this._ended) {
      return;
    }
    this._ended = true;
    this.endTime = getHrTime(endTime);
    this._duration = (0, import_core4.hrTimeDuration)(this.startTime, this.endTime);
    this.onEnd(this);
  }
  isRecording() {
    return !this._ended;
  }
  recordException(exception, time) {
    const attributes = transformExceptionAttributes(exception);
    this.addEvent("exception", attributes, time);
  }
  get duration() {
    return this._duration;
  }
  get ended() {
    return this._ended;
  }
  get droppedAttributesCount() {
    return this._droppedAttributesCount;
  }
  get droppedEventsCount() {
    return this._droppedEventsCount;
  }
  get droppedLinksCount() {
    return this._droppedLinksCount;
  }
};

// src/tracer.ts
var withNextSpanAttributes;
var WorkerTracer = class {
  _spanProcessors;
  resource;
  idGenerator = new import_sdk_trace_base3.RandomIdGenerator();
  constructor(spanProcessors, resource) {
    this._spanProcessors = spanProcessors;
    this.resource = resource;
  }
  get spanProcessors() {
    return this._spanProcessors;
  }
  addToResource(extra) {
    this.resource.merge(extra);
  }
  startSpan(name, options = {}, context3 = import_api6.context.active()) {
    if (options.root) {
      context3 = import_api6.trace.deleteSpan(context3);
    }
    const parentSpan = import_api6.trace.getSpan(context3);
    const parentSpanContext = parentSpan?.spanContext();
    const hasParentContext = parentSpanContext && import_api6.trace.isSpanContextValid(parentSpanContext);
    const traceId = hasParentContext ? parentSpanContext.traceId : this.idGenerator.generateTraceId();
    const spanKind = options.kind || import_api6.SpanKind.INTERNAL;
    const sanitisedAttrs = (0, import_core5.sanitizeAttributes)(options.attributes);
    const config = getActiveConfig();
    if (!config) throw new Error("Config is undefined. This is a bug in the instrumentation logic");
    const sampler = config.sampling.headSampler;
    const samplingDecision = sampler.shouldSample(context3, traceId, name, spanKind, sanitisedAttrs, []);
    const { decision, traceState, attributes: attrs } = samplingDecision;
    const attributes = Object.assign({}, sanitisedAttrs, attrs, withNextSpanAttributes);
    withNextSpanAttributes = {};
    const spanId = this.idGenerator.generateSpanId();
    const parentSpanId = hasParentContext ? parentSpanContext.spanId : void 0;
    const traceFlags = decision === import_sdk_trace_base3.SamplingDecision.RECORD_AND_SAMPLED ? import_api6.TraceFlags.SAMPLED : import_api6.TraceFlags.NONE;
    const spanContext = { traceId, spanId, traceFlags, traceState };
    const span = new SpanImpl({
      attributes,
      name,
      onEnd: (span2) => {
        this.spanProcessors.forEach((sp) => {
          sp.onEnd(span2);
        });
      },
      resource: this.resource,
      spanContext,
      parentSpanId,
      spanKind,
      startTime: options.startTime
    });
    this.spanProcessors.forEach((sp) => {
      sp.onStart(span, context3);
    });
    return span;
  }
  startActiveSpan(name, ...args) {
    const options = args.length > 1 ? args[0] : void 0;
    const parentContext = args.length > 2 ? args[1] : import_api6.context.active();
    const fn = args[args.length - 1];
    const span = this.startSpan(name, options, parentContext);
    const contextWithSpanSet = import_api6.trace.setSpan(parentContext, span);
    return import_api6.context.with(contextWithSpanSet, fn, void 0, span);
  }
};
function withNextSpan(attrs) {
  withNextSpanAttributes = Object.assign({}, withNextSpanAttributes, attrs);
}

// src/provider.ts
var WorkerTracerProvider = class {
  spanProcessors;
  resource;
  tracers = {};
  constructor(spanProcessors, resource) {
    this.spanProcessors = spanProcessors;
    this.resource = resource;
  }
  getTracer(name, version, options) {
    const key = `${name}@${version || ""}:${options?.schemaUrl || ""}`;
    if (!this.tracers[key]) {
      this.tracers[key] = new WorkerTracer(this.spanProcessors, this.resource);
    }
    return this.tracers[key];
  }
  register() {
    import_api7.trace.setGlobalTracerProvider(this);
    import_api7.context.setGlobalContextManager(new AsyncLocalStorageContextManager());
  }
};

// src/instrumentation/fetch.ts
var import_api15 = require("@opentelemetry/api");

// src/instrumentation/do.ts
var import_api10 = require("@opentelemetry/api");
var import_semantic_conventions3 = require("@opentelemetry/semantic-conventions");

// src/instrumentation/common.ts
var import_api8 = require("@opentelemetry/api");
var PromiseTracker = class {
  _outstandingPromises = [];
  get outstandingPromiseCount() {
    return this._outstandingPromises.length;
  }
  track(promise) {
    this._outstandingPromises.push(promise);
  }
  async wait() {
    await allSettledMutable(this._outstandingPromises);
  }
};
function createWaitUntil(fn, context3, tracker) {
  const handler = {
    apply(target, _thisArg, argArray) {
      tracker.track(argArray[0]);
      return Reflect.apply(target, context3, argArray);
    }
  };
  return wrap(fn, handler);
}
function proxyExecutionContext(context3) {
  const tracker = new PromiseTracker();
  const ctx = new Proxy(context3, {
    get(target, prop) {
      if (prop === "waitUntil") {
        const fn = Reflect.get(target, prop);
        return createWaitUntil(fn, context3, tracker);
      } else {
        return passthroughGet(target, prop);
      }
    }
  });
  return { ctx, tracker };
}
async function exportSpans(tracker) {
  const tracer2 = import_api8.trace.getTracer("export");
  if (tracer2 instanceof WorkerTracer) {
    if (tracker) {
      await tracker.wait();
    }
    const promises = tracer2.spanProcessors.map(async (spanProcessor) => {
      await spanProcessor.forceFlush();
    });
    await Promise.allSettled(promises);
  } else {
    console.error("The global tracer is not of type WorkerTracer and can not export spans");
  }
}
async function allSettledMutable(promises) {
  let values;
  do {
    values = await Promise.allSettled(promises);
  } while (values.length !== promises.length);
  return values;
}

// src/instrumentation/do-storage.ts
var import_api9 = require("@opentelemetry/api");
var import_semantic_conventions2 = require("@opentelemetry/semantic-conventions");
var dbSystem = "Cloudflare DO";
function isDurableObjectCommonOptions(options) {
  return typeof options === "object" && ("allowConcurrency" in options || "allowUnconfirmed" in options || "noCache" in options);
}
function applyOptionsAttributes(attrs, options) {
  if ("allowConcurrency" in options) {
    attrs["db.cf.do.allow_concurrency"] = options.allowConcurrency;
  }
  if ("allowUnconfirmed" in options) {
    attrs["db.cf.do.allow_unconfirmed"] = options.allowUnconfirmed;
  }
  if ("noCache" in options) {
    attrs["db.cf.do.no_cache"] = options.noCache;
  }
}
var StorageAttributes = {
  delete(argArray, result) {
    const args = argArray;
    let attrs = {};
    if (Array.isArray(args[0])) {
      const keys = args[0];
      attrs = {
        // todo: Maybe set db.cf.do.keys to the whole array here?
        "db.cf.do.key": keys[0],
        "db.cf.do.number_of_keys": keys.length,
        "db.cf.do.keys_deleted": result
      };
    } else {
      attrs = {
        "db.cf.do.key": args[0],
        "db.cf.do.success": result
      };
    }
    if (args[1]) {
      applyOptionsAttributes(attrs, args[1]);
    }
    return attrs;
  },
  deleteAll(argArray) {
    const args = argArray;
    let attrs = {};
    if (args[0]) {
      applyOptionsAttributes(attrs, args[0]);
    }
    return attrs;
  },
  get(argArray) {
    const args = argArray;
    let attrs = {};
    if (Array.isArray(args[0])) {
      const keys = args[0];
      attrs = {
        // todo: Maybe set db.cf.do.keys to the whole array here?
        "db.cf.do.key": keys[0],
        "db.cf.do.number_of_keys": keys.length
      };
    } else {
      attrs = {
        "db.cf.do.key": args[0]
      };
    }
    if (args[1]) {
      applyOptionsAttributes(attrs, args[1]);
    }
    return attrs;
  },
  list(argArray, result) {
    const args = argArray;
    const attrs = {
      "db.cf.do.number_of_results": result.size
    };
    if (args[0]) {
      const options = args[0];
      applyOptionsAttributes(attrs, options);
      if ("start" in options) {
        attrs["db.cf.do.start"] = options.start;
      }
      if ("startAfter" in options) {
        attrs["db.cf.do.start_after"] = options.startAfter;
      }
      if ("end" in options) {
        attrs["db.cf.do.end"] = options.end;
      }
      if ("prefix" in options) {
        attrs["db.cf.do.prefix"] = options.prefix;
      }
      if ("reverse" in options) {
        attrs["db.cf.do.reverse"] = options.reverse;
      }
      if ("limit" in options) {
        attrs["db.cf.do.limit"] = options.limit;
      }
    }
    return attrs;
  },
  put(argArray) {
    const args = argArray;
    const attrs = {};
    if (typeof args[0] === "string") {
      attrs["db.cf.do.key"] = args[0];
      if (args[2]) {
        applyOptionsAttributes(attrs, args[2]);
      }
    } else {
      const keys = Object.keys(args[0]);
      attrs["db.cf.do.key"] = keys[0];
      attrs["db.cf.do.number_of_keys"] = keys.length;
      if (isDurableObjectCommonOptions(args[1])) {
        applyOptionsAttributes(attrs, args[1]);
      }
    }
    return attrs;
  },
  getAlarm(argArray) {
    const args = argArray;
    const attrs = {};
    if (args[0]) {
      applyOptionsAttributes(attrs, args[0]);
    }
    return attrs;
  },
  setAlarm(argArray) {
    const args = argArray;
    const attrs = {};
    if (args[0] instanceof Date) {
      attrs["db.cf.do.alarm_time"] = args[0].getTime();
    } else {
      attrs["db.cf.do.alarm_time"] = args[0];
    }
    if (args[1]) {
      applyOptionsAttributes(attrs, args[1]);
    }
    return attrs;
  },
  deleteAlarm(argArray) {
    const args = argArray;
    const attrs = {};
    if (args[0]) {
      applyOptionsAttributes(attrs, args[0]);
    }
    return attrs;
  }
};
function instrumentStorageFn(fn, operation) {
  const tracer2 = import_api9.trace.getTracer("do_storage");
  const fnHandler = {
    apply: (target, thisArg, argArray) => {
      const attributes = {
        [import_semantic_conventions2.SemanticAttributes.DB_SYSTEM]: dbSystem,
        [import_semantic_conventions2.SemanticAttributes.DB_OPERATION]: operation,
        [import_semantic_conventions2.SemanticAttributes.DB_STATEMENT]: `${operation} ${argArray[0]}`
      };
      const options = {
        kind: import_api9.SpanKind.CLIENT,
        attributes: {
          ...attributes,
          operation
        }
      };
      return tracer2.startActiveSpan(`Durable Object Storage ${operation}`, options, async (span) => {
        const result = await Reflect.apply(target, thisArg, argArray);
        const extraAttrsFn = StorageAttributes[operation];
        const extraAttrs = extraAttrsFn ? extraAttrsFn(argArray, result) : {};
        span.setAttributes(extraAttrs);
        span.setAttribute("db.cf.do.has_result", !!result);
        span.end();
        return result;
      });
    }
  };
  return wrap(fn, fnHandler);
}
function instrumentStorage(storage) {
  const storageHandler = {
    get: (target, prop, receiver) => {
      const operation = String(prop);
      const fn = Reflect.get(target, prop, receiver);
      return instrumentStorageFn(fn, operation);
    }
  };
  return wrap(storage, storageHandler);
}

// src/instrumentation/do.ts
function instrumentBindingStub(stub, nsName) {
  const stubHandler = {
    get(target, prop) {
      if (prop === "fetch") {
        const fetcher = Reflect.get(target, prop);
        const attrs = {
          name: `Durable Object ${nsName}`,
          "do.namespace": nsName,
          "do.id": target.id.toString(),
          "do.id.name": target.id.name
        };
        return instrumentClientFetch(fetcher, () => ({ includeTraceContext: true }), attrs);
      } else {
        return passthroughGet(target, prop);
      }
    }
  };
  return wrap(stub, stubHandler);
}
function instrumentBindingGet(getFn, nsName) {
  const getHandler = {
    apply(target, thisArg, argArray) {
      const stub = Reflect.apply(target, thisArg, argArray);
      return instrumentBindingStub(stub, nsName);
    }
  };
  return wrap(getFn, getHandler);
}
function instrumentDOBinding(ns, nsName) {
  const nsHandler = {
    get(target, prop) {
      if (prop === "get") {
        const fn = Reflect.get(ns, prop);
        return instrumentBindingGet(fn, nsName);
      } else {
        return passthroughGet(target, prop);
      }
    }
  };
  return wrap(ns, nsHandler);
}
function instrumentState(state2) {
  const stateHandler = {
    get(target, prop, receiver) {
      const result = Reflect.get(target, prop, unwrap(receiver));
      if (prop === "storage") {
        return instrumentStorage(result);
      } else if (typeof result === "function") {
        return result.bind(target);
      } else {
        return result;
      }
    }
  };
  return wrap(state2, stateHandler);
}
var cold_start = true;
function executeDOFetch(fetchFn, request, id) {
  const spanContext = getParentContextFromHeaders(request.headers);
  const tracer2 = import_api10.trace.getTracer("DO fetchHandler");
  const attributes = {
    [import_semantic_conventions3.SemanticAttributes.FAAS_TRIGGER]: "http",
    [import_semantic_conventions3.SemanticAttributes.FAAS_COLDSTART]: cold_start
  };
  cold_start = false;
  Object.assign(attributes, gatherRequestAttributes(request));
  Object.assign(attributes, gatherIncomingCfAttributes(request));
  const options = {
    attributes,
    kind: import_api10.SpanKind.SERVER
  };
  const name = id.name || "";
  const promise = tracer2.startActiveSpan(`Durable Object Fetch ${name}`, options, spanContext, async (span) => {
    try {
      const response = await fetchFn(request);
      if (response.ok) {
        span.setStatus({ code: import_api10.SpanStatusCode.OK });
      }
      span.setAttributes(gatherResponseAttributes(response));
      span.end();
      return response;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: import_api10.SpanStatusCode.ERROR });
      span.end();
      throw error;
    }
  });
  return promise;
}
function executeDOAlarm(alarmFn, id) {
  const tracer2 = import_api10.trace.getTracer("DO alarmHandler");
  const name = id.name || "";
  const promise = tracer2.startActiveSpan(`Durable Object Alarm ${name}`, async (span) => {
    span.setAttribute(import_semantic_conventions3.SemanticAttributes.FAAS_COLDSTART, cold_start);
    cold_start = false;
    span.setAttribute("do.id", id.toString());
    if (id.name) span.setAttribute("do.name", id.name);
    try {
      await alarmFn();
      span.end();
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: import_api10.SpanStatusCode.ERROR });
      span.end();
      throw error;
    }
  });
  return promise;
}
function instrumentFetchFn(fetchFn, initialiser, env, id) {
  const fetchHandler = {
    async apply(target, thisArg, argArray) {
      const request = argArray[0];
      const config = initialiser(env, request);
      const context3 = setConfig(config);
      try {
        const bound = target.bind(unwrap(thisArg));
        return await import_api10.context.with(context3, executeDOFetch, void 0, bound, request, id);
      } catch (error) {
        throw error;
      } finally {
        exportSpans();
      }
    }
  };
  return wrap(fetchFn, fetchHandler);
}
function instrumentAlarmFn(alarmFn, initialiser, env, id) {
  if (!alarmFn) return void 0;
  const alarmHandler = {
    async apply(target, thisArg) {
      const config = initialiser(env, "do-alarm");
      const context3 = setConfig(config);
      try {
        const bound = target.bind(unwrap(thisArg));
        return await import_api10.context.with(context3, executeDOAlarm, void 0, bound, id);
      } catch (error) {
        throw error;
      } finally {
        exportSpans();
      }
    }
  };
  return wrap(alarmFn, alarmHandler);
}
function instrumentDurableObject(doObj, initialiser, env, state2) {
  const objHandler = {
    get(target, prop) {
      if (prop === "fetch") {
        const fetchFn = Reflect.get(target, prop);
        return instrumentFetchFn(fetchFn, initialiser, env, state2.id);
      } else if (prop === "alarm") {
        const alarmFn = Reflect.get(target, prop);
        return instrumentAlarmFn(alarmFn, initialiser, env, state2.id);
      } else {
        const result = Reflect.get(target, prop);
        if (typeof result === "function") {
          result.bind(doObj);
        }
        return result;
      }
    }
  };
  return wrap(doObj, objHandler);
}
function instrumentDOClass(doClass, initialiser) {
  const classHandler = {
    construct(target, [orig_state, orig_env]) {
      const trigger = {
        id: orig_state.id.toString(),
        name: orig_state.id.name
      };
      const constructorConfig = initialiser(orig_env, trigger);
      const context3 = setConfig(constructorConfig);
      const state2 = instrumentState(orig_state);
      const env = instrumentEnv(orig_env);
      const createDO = () => {
        return new target(state2, env);
      };
      const doObj = import_api10.context.with(context3, createDO);
      return instrumentDurableObject(doObj, initialiser, env, state2);
    }
  };
  return wrap(doClass, classHandler);
}

// src/instrumentation/kv.ts
var import_api11 = require("@opentelemetry/api");
var import_semantic_conventions4 = require("@opentelemetry/semantic-conventions");
var dbSystem2 = "Cloudflare KV";
var KVAttributes = {
  delete(_argArray) {
    return {};
  },
  get(argArray) {
    const attrs = {};
    const opts = argArray[1];
    if (typeof opts === "string") {
      attrs["db.cf.kv.type"] = opts;
    } else if (typeof opts === "object") {
      attrs["db.cf.kv.type"] = opts.type;
      attrs["db.cf.kv.cache_ttl"] = opts.cacheTtl;
    }
    return attrs;
  },
  getWithMetadata(argArray, result) {
    const attrs = {};
    const opts = argArray[1];
    if (typeof opts === "string") {
      attrs["db.cf.kv.type"] = opts;
    } else if (typeof opts === "object") {
      attrs["db.cf.kv.type"] = opts.type;
      attrs["db.cf.kv.cache_ttl"] = opts.cacheTtl;
    }
    attrs["db.cf.kv.metadata"] = true;
    const { cacheStatus } = result;
    if (typeof cacheStatus === "string") {
      attrs["db.cf.kv.cache_status"] = cacheStatus;
    }
    return attrs;
  },
  list(argArray, result) {
    const attrs = {};
    const opts = argArray[0] || {};
    const { cursor, limit } = opts;
    attrs["db.cf.kv.list_request_cursor"] = cursor || void 0;
    attrs["db.cf.kv.list_limit"] = limit || void 0;
    const { list_complete, cacheStatus } = result;
    attrs["db.cf.kv.list_complete"] = list_complete || void 0;
    if (!list_complete) {
      attrs["db.cf.kv.list_response_cursor"] = cursor || void 0;
    }
    if (typeof cacheStatus === "string") {
      attrs["db.cf.kv.cache_status"] = cacheStatus;
    }
    return attrs;
  },
  put(argArray) {
    const attrs = {};
    if (argArray.length > 2 && argArray[2]) {
      const { expiration, expirationTtl, metadata } = argArray[2];
      attrs["db.cf.kv.expiration"] = expiration;
      attrs["db.cf.kv.expiration_ttl"] = expirationTtl;
      attrs["db.cf.kv.metadata"] = !!metadata;
    }
    return attrs;
  }
};
function instrumentKVFn(fn, name, operation) {
  const tracer2 = import_api11.trace.getTracer("KV");
  const fnHandler = {
    apply: (target, thisArg, argArray) => {
      const attributes = {
        binding_type: "KV",
        [import_semantic_conventions4.SemanticAttributes.DB_NAME]: name,
        [import_semantic_conventions4.SemanticAttributes.DB_SYSTEM]: dbSystem2,
        [import_semantic_conventions4.SemanticAttributes.DB_OPERATION]: operation
      };
      const options = {
        kind: import_api11.SpanKind.CLIENT,
        attributes
      };
      return tracer2.startActiveSpan(`KV ${name} ${operation}`, options, async (span) => {
        const result = await Reflect.apply(target, thisArg, argArray);
        const extraAttrsFn = KVAttributes[operation];
        const extraAttrs = extraAttrsFn ? extraAttrsFn(argArray, result) : {};
        span.setAttributes(extraAttrs);
        if (operation === "list") {
          const opts = argArray[0] || {};
          const { prefix } = opts;
          span.setAttribute(import_semantic_conventions4.SemanticAttributes.DB_STATEMENT, `${operation} ${prefix || void 0}`);
        } else {
          span.setAttribute(import_semantic_conventions4.SemanticAttributes.DB_STATEMENT, `${operation} ${argArray[0]}`);
          span.setAttribute("db.cf.kv.key", argArray[0]);
        }
        if (operation === "getWithMetadata") {
          const hasResults = !!result && !!result.value;
          span.setAttribute("db.cf.kv.has_result", hasResults);
        } else {
          span.setAttribute("db.cf.kv.has_result", !!result);
        }
        span.end();
        return result;
      });
    }
  };
  return wrap(fn, fnHandler);
}
function instrumentKV(kv, name) {
  const kvHandler = {
    get: (target, prop, receiver) => {
      const operation = String(prop);
      const fn = Reflect.get(target, prop, receiver);
      return instrumentKVFn(fn, name, operation);
    }
  };
  return wrap(kv, kvHandler);
}

// src/instrumentation/queue.ts
var import_api12 = require("@opentelemetry/api");
var import_semantic_conventions5 = require("@opentelemetry/semantic-conventions");

// src/instrumentation/version.ts
function versionAttributes(env) {
  const attributes = {};
  if (typeof env === "object" && env !== null) {
    for (const [binding, data] of Object.entries(env)) {
      if (isVersionMetadata(data)) {
        attributes["cf.workers_version_metadata.binding"] = binding;
        attributes["cf.workers_version_metadata.id"] = data.id;
        attributes["cf.workers_version_metadata.tag"] = data.tag;
        break;
      }
    }
  }
  return attributes;
}

// src/instrumentation/queue.ts
var traceIdSymbol = Symbol("traceId");
var MessageStatusCount = class {
  succeeded = 0;
  failed = 0;
  total;
  constructor(total) {
    this.total = total;
  }
  ack() {
    this.succeeded = this.succeeded + 1;
  }
  ackRemaining() {
    this.succeeded = this.total - this.failed;
  }
  retry() {
    this.failed = this.failed + 1;
  }
  retryRemaining() {
    this.failed = this.total - this.succeeded;
  }
  toAttributes() {
    return {
      "queue.messages_count": this.total,
      "queue.messages_success": this.succeeded,
      "queue.messages_failed": this.failed,
      "queue.batch_success": this.succeeded === this.total
    };
  }
};
var addEvent = (name, msg) => {
  const attrs = {};
  if (msg) {
    attrs["queue.message_id"] = msg.id;
    attrs["queue.message_timestamp"] = msg.timestamp.toISOString();
  }
  import_api12.trace.getActiveSpan()?.addEvent(name, attrs);
};
var proxyQueueMessage = (msg, count) => {
  const msgHandler = {
    get: (target, prop) => {
      if (prop === "ack") {
        const ackFn = Reflect.get(target, prop);
        return new Proxy(ackFn, {
          apply: (fnTarget) => {
            addEvent("messageAck", msg);
            count.ack();
            Reflect.apply(fnTarget, msg, []);
          }
        });
      } else if (prop === "retry") {
        const retryFn = Reflect.get(target, prop);
        return new Proxy(retryFn, {
          apply: (fnTarget) => {
            addEvent("messageRetry", msg);
            count.retry();
            const result = Reflect.apply(fnTarget, msg, []);
            return result;
          }
        });
      } else {
        return Reflect.get(target, prop, msg);
      }
    }
  };
  return wrap(msg, msgHandler);
};
var proxyMessageBatch = (batch, count) => {
  const batchHandler = {
    get: (target, prop) => {
      if (prop === "messages") {
        const messages = Reflect.get(target, prop);
        const messagesHandler = {
          get: (target2, prop2) => {
            if (typeof prop2 === "string" && !isNaN(parseInt(prop2))) {
              const message = Reflect.get(target2, prop2);
              return proxyQueueMessage(message, count);
            } else {
              return Reflect.get(target2, prop2);
            }
          }
        };
        return wrap(messages, messagesHandler);
      } else if (prop === "ackAll") {
        const ackFn = Reflect.get(target, prop);
        return new Proxy(ackFn, {
          apply: (fnTarget) => {
            addEvent("ackAll");
            count.ackRemaining();
            Reflect.apply(fnTarget, batch, []);
          }
        });
      } else if (prop === "retryAll") {
        const retryFn = Reflect.get(target, prop);
        return new Proxy(retryFn, {
          apply: (fnTarget) => {
            addEvent("retryAll");
            count.retryRemaining();
            Reflect.apply(fnTarget, batch, []);
          }
        });
      }
      return Reflect.get(target, prop);
    }
  };
  return wrap(batch, batchHandler);
};
function executeQueueHandler(queueFn, [batch, env, ctx]) {
  const count = new MessageStatusCount(batch.messages.length);
  batch = proxyMessageBatch(batch, count);
  const tracer2 = import_api12.trace.getTracer("queueHandler");
  const options = {
    attributes: {
      [import_semantic_conventions5.SemanticAttributes.FAAS_TRIGGER]: "pubsub",
      "queue.name": batch.queue
    },
    kind: import_api12.SpanKind.CONSUMER
  };
  Object.assign(options.attributes, versionAttributes(env));
  const promise = tracer2.startActiveSpan(`queueHandler ${batch.queue}`, options, async (span) => {
    const traceId = span.spanContext().traceId;
    import_api12.context.active().setValue(traceIdSymbol, traceId);
    try {
      const result = await queueFn(batch, env, ctx);
      span.setAttribute("queue.implicitly_acked", count.total - count.succeeded - count.failed);
      count.ackRemaining();
      span.setAttributes(count.toAttributes());
      span.end();
      return result;
    } catch (error) {
      span.recordException(error);
      span.setAttribute("queue.implicitly_retried", count.total - count.succeeded - count.failed);
      count.retryRemaining();
      span.end();
      throw error;
    }
  });
  return promise;
}
function createQueueHandler(queueFn, initialiser) {
  const queueHandler = {
    async apply(target, _thisArg, argArray) {
      const [batch, orig_env, orig_ctx] = argArray;
      const config = initialiser(orig_env, batch);
      const env = instrumentEnv(orig_env);
      const { ctx, tracker } = proxyExecutionContext(orig_ctx);
      const context3 = setConfig(config);
      try {
        const args = [batch, env, ctx];
        return await import_api12.context.with(context3, executeQueueHandler, void 0, target, args);
      } catch (error) {
        throw error;
      } finally {
        orig_ctx.waitUntil(exportSpans(tracker));
      }
    }
  };
  return wrap(queueFn, queueHandler);
}
function instrumentQueueSend(fn, name) {
  const tracer2 = import_api12.trace.getTracer("queueSender");
  const handler = {
    apply: (target, thisArg, argArray) => {
      return tracer2.startActiveSpan(`Queues ${name} send`, async (span) => {
        span.setAttribute("queue.operation", "send");
        await Reflect.apply(target, unwrap(thisArg), argArray);
        span.end();
      });
    }
  };
  return wrap(fn, handler);
}
function instrumentQueueSendBatch(fn, name) {
  const tracer2 = import_api12.trace.getTracer("queueSender");
  const handler = {
    apply: (target, thisArg, argArray) => {
      return tracer2.startActiveSpan(`Queues ${name} sendBatch`, async (span) => {
        span.setAttribute("queue.operation", "sendBatch");
        await Reflect.apply(target, unwrap(thisArg), argArray);
        span.end();
      });
    }
  };
  return wrap(fn, handler);
}
function instrumentQueueSender(queue, name) {
  const queueHandler = {
    get: (target, prop) => {
      if (prop === "send") {
        const sendFn = Reflect.get(target, prop);
        return instrumentQueueSend(sendFn, name);
      } else if (prop === "sendBatch") {
        const sendFn = Reflect.get(target, prop);
        return instrumentQueueSendBatch(sendFn, name);
      } else {
        return Reflect.get(target, prop);
      }
    }
  };
  return wrap(queue, queueHandler);
}

// src/instrumentation/service.ts
function instrumentServiceBinding(fetcher, envName) {
  const fetcherHandler = {
    get(target, prop) {
      if (prop === "fetch") {
        const fetcher2 = Reflect.get(target, prop);
        const attrs = {
          name: `Service Binding ${envName}`
        };
        return instrumentClientFetch(fetcher2, () => ({ includeTraceContext: true }), attrs);
      } else {
        return passthroughGet(target, prop);
      }
    }
  };
  return wrap(fetcher, fetcherHandler);
}

// src/instrumentation/d1.ts
var import_api13 = require("@opentelemetry/api");
var import_semantic_conventions6 = require("@opentelemetry/semantic-conventions");
var dbSystem3 = "Cloudflare D1";
function metaAttributes(meta) {
  return {
    "db.cf.d1.rows_read": meta.rows_read,
    "db.cf.d1.rows_written": meta.rows_written,
    "db.cf.d1.duration": meta.duration,
    "db.cf.d1.size_after": meta.size_after,
    "db.cf.d1.last_row_id": meta.last_row_id,
    "db.cf.d1.changed_db": meta.changed_db,
    "db.cf.d1.changes": meta.changes
  };
}
function spanOptions(dbName, operation, sql) {
  const attributes = {
    binding_type: "D1",
    [import_semantic_conventions6.SemanticAttributes.DB_NAME]: dbName,
    [import_semantic_conventions6.SemanticAttributes.DB_SYSTEM]: dbSystem3,
    [import_semantic_conventions6.SemanticAttributes.DB_OPERATION]: operation
  };
  if (sql) {
    attributes[import_semantic_conventions6.SemanticAttributes.DB_STATEMENT] = sql;
  }
  return {
    kind: import_api13.SpanKind.CLIENT,
    attributes
  };
}
function instrumentD1StatementFn(fn, dbName, operation, sql) {
  const tracer2 = import_api13.trace.getTracer("D1");
  const fnHandler = {
    apply: (target, thisArg, argArray) => {
      if (operation === "bind") {
        const newStmt = Reflect.apply(target, thisArg, argArray);
        return instrumentD1PreparedStatement(newStmt, dbName, sql);
      }
      const options = spanOptions(dbName, operation, sql);
      return tracer2.startActiveSpan(`${dbName} ${operation}`, options, async (span) => {
        try {
          const result = await Reflect.apply(target, thisArg, argArray);
          if (operation === "all" || operation === "run") {
            span.setAttributes(metaAttributes(result.meta));
          }
          span.setStatus({ code: import_api13.SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.recordException(error);
          span.setStatus({ code: import_api13.SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      });
    }
  };
  return wrap(fn, fnHandler);
}
function instrumentD1PreparedStatement(stmt, dbName, statement) {
  const statementHandler = {
    get: (target, prop, receiver) => {
      const operation = String(prop);
      const fn = Reflect.get(target, prop, receiver);
      if (typeof fn === "function") {
        return instrumentD1StatementFn(fn, dbName, operation, statement);
      }
      return fn;
    }
  };
  return wrap(stmt, statementHandler);
}
function instrumentD1Fn(fn, dbName, operation) {
  const tracer2 = import_api13.trace.getTracer("D1");
  const fnHandler = {
    apply: (target, thisArg, argArray) => {
      if (operation === "prepare") {
        const sql = argArray[0];
        const stmt = Reflect.apply(target, thisArg, argArray);
        return instrumentD1PreparedStatement(stmt, dbName, sql);
      } else if (operation === "exec") {
        const sql = argArray[0];
        const options = spanOptions(dbName, operation, sql);
        return tracer2.startActiveSpan(`${dbName} ${operation}`, options, async (span) => {
          try {
            const result = await Reflect.apply(target, thisArg, argArray);
            span.setStatus({ code: import_api13.SpanStatusCode.OK });
            return result;
          } catch (error) {
            span.recordException(error);
            span.setStatus({ code: import_api13.SpanStatusCode.ERROR });
            throw error;
          } finally {
            span.end();
          }
        });
      } else if (operation === "batch") {
        const statements = argArray[0];
        return tracer2.startActiveSpan(`${dbName} ${operation}`, async (span) => {
          const subSpans = statements.map(
            (s) => tracer2.startSpan(`${dbName} ${operation} > query`, spanOptions(dbName, operation, s.statement))
          );
          try {
            const result = await Reflect.apply(target, thisArg, argArray);
            result.forEach((r, i) => subSpans[i]?.setAttributes(metaAttributes(r.meta)));
            span.setStatus({ code: import_api13.SpanStatusCode.OK });
            return result;
          } catch (error) {
            span.recordException(error);
            span.setStatus({ code: import_api13.SpanStatusCode.ERROR });
            throw error;
          } finally {
            subSpans.forEach((s) => s.end());
            span.end();
          }
        });
      } else {
        return Reflect.apply(target, thisArg, argArray);
      }
    }
  };
  return wrap(fn, fnHandler);
}
function instrumentD1(database, dbName) {
  const dbHandler = {
    get: (target, prop, receiver) => {
      const operation = String(prop);
      const fn = Reflect.get(target, prop, receiver);
      if (typeof fn === "function") {
        return instrumentD1Fn(fn, dbName, operation);
      }
      return fn;
    }
  };
  return wrap(database, dbHandler);
}

// src/instrumentation/analytics-engine.ts
var import_api14 = require("@opentelemetry/api");
var import_semantic_conventions7 = require("@opentelemetry/semantic-conventions");
var dbSystem4 = "Cloudflare Analytics Engine";
var AEAttributes = {
  writeDataPoint(argArray) {
    const attrs = {};
    const opts = argArray[0];
    if (typeof opts === "object") {
      attrs["db.cf.ae.indexes"] = opts.indexes.length;
      attrs["db.cf.ae.index"] = opts.indexes[0].toString();
      attrs["db.cf.ae.doubles"] = opts.doubles.length;
      attrs["db.cf.ae.blobs"] = opts.blobs.length;
    }
    return attrs;
  }
};
function instrumentAEFn(fn, name, operation) {
  const tracer2 = import_api14.trace.getTracer("AnalyticsEngine");
  const fnHandler = {
    apply: (target, thisArg, argArray) => {
      const attributes = {
        binding_type: "AnalyticsEngine",
        [import_semantic_conventions7.SemanticAttributes.DB_NAME]: name,
        [import_semantic_conventions7.SemanticAttributes.DB_SYSTEM]: dbSystem4,
        [import_semantic_conventions7.SemanticAttributes.DB_OPERATION]: operation
      };
      const options = {
        kind: import_api14.SpanKind.CLIENT,
        attributes
      };
      return tracer2.startActiveSpan(`Analytics Engine ${name} ${operation}`, options, async (span) => {
        const result = await Reflect.apply(target, thisArg, argArray);
        const extraAttrsFn = AEAttributes[operation];
        const extraAttrs = extraAttrsFn ? extraAttrsFn(argArray, result) : {};
        span.setAttributes(extraAttrs);
        span.setAttribute(import_semantic_conventions7.SemanticAttributes.DB_STATEMENT, `${operation} ${argArray[0]}`);
        span.end();
        return result;
      });
    }
  };
  return wrap(fn, fnHandler);
}
function instrumentAnalyticsEngineDataset(dataset, name) {
  const datasetHandler = {
    get: (target, prop, receiver) => {
      const operation = String(prop);
      const fn = Reflect.get(target, prop, receiver);
      return instrumentAEFn(fn, name, operation);
    }
  };
  return wrap(dataset, datasetHandler);
}

// src/instrumentation/env.ts
var isJSRPC = (item) => {
  return !!item?.["__some_property_that_will_never_exist" + Math.random()];
};
var isKVNamespace = (item) => {
  return !isJSRPC(item) && !!item?.getWithMetadata;
};
var isQueue = (item) => {
  return !isJSRPC(item) && !!item?.sendBatch;
};
var isDurableObject = (item) => {
  return !isJSRPC(item) && !!item?.idFromName;
};
var isVersionMetadata = (item) => {
  return !isJSRPC(item) && typeof item?.id === "string" && typeof item?.tag === "string";
};
var isAnalyticsEngineDataset = (item) => {
  return !isJSRPC(item) && !!item?.writeDataPoint;
};
var isD1Database = (item) => {
  return !!item?.exec && !!item?.prepare;
};
var instrumentEnv = (env) => {
  const envHandler = {
    get: (target, prop, receiver) => {
      const item = Reflect.get(target, prop, receiver);
      if (!isProxyable(item)) {
        return item;
      }
      if (isJSRPC(item)) {
        return instrumentServiceBinding(item, String(prop));
      } else if (isKVNamespace(item)) {
        return instrumentKV(item, String(prop));
      } else if (isQueue(item)) {
        return instrumentQueueSender(item, String(prop));
      } else if (isDurableObject(item)) {
        return instrumentDOBinding(item, String(prop));
      } else if (isVersionMetadata(item)) {
        return item;
      } else if (isAnalyticsEngineDataset(item)) {
        return instrumentAnalyticsEngineDataset(item, String(prop));
      } else if (isD1Database(item)) {
        return instrumentD1(item, String(prop));
      } else {
        return item;
      }
    }
  };
  return wrap(env, envHandler);
};

// src/instrumentation/fetch.ts
var netKeysFromCF = /* @__PURE__ */ new Set(["colo", "country", "request_priority", "tls_cipher", "tls_version", "asn", "tcp_rtt"]);
var camelToSnakeCase = (s) => {
  return s.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
};
var gatherOutgoingCfAttributes = (cf) => {
  const attrs = {};
  Object.keys(cf).forEach((key) => {
    const value = cf[key];
    const destKey = camelToSnakeCase(key);
    if (!netKeysFromCF.has(destKey)) {
      if (typeof value === "string" || typeof value === "number") {
        attrs[`cf.${destKey}`] = value;
      } else {
        attrs[`cf.${destKey}`] = JSON.stringify(value);
      }
    }
  });
  return attrs;
};
function gatherRequestAttributes(request) {
  const attrs = {};
  const headers = request.headers;
  attrs["http.request.method"] = request.method.toUpperCase();
  attrs["network.protocol.name"] = "http";
  attrs["network.protocol.version"] = request.cf?.httpProtocol;
  attrs["http.request.body.size"] = headers.get("content-length");
  attrs["user_agent.original"] = headers.get("user-agent");
  attrs["http.mime_type"] = headers.get("content-type");
  attrs["http.accepts"] = request.cf?.clientAcceptEncoding;
  const u = new URL(request.url);
  attrs["url.full"] = `${u.protocol}//${u.host}${u.pathname}${u.search}`;
  attrs["server.address"] = u.host;
  attrs["url.scheme"] = u.protocol;
  attrs["url.path"] = u.pathname;
  attrs["url.query"] = u.search;
  return attrs;
}
function gatherResponseAttributes(response) {
  const attrs = {};
  attrs["http.response.status_code"] = response.status;
  if (response.headers.get("content-length") == null) {
    attrs["http.response.body.size"] = response.headers.get("content-length");
  }
  attrs["http.mime_type"] = response.headers.get("content-type");
  return attrs;
}
function gatherIncomingCfAttributes(request) {
  const attrs = {};
  attrs["net.colo"] = request.cf?.colo;
  attrs["net.country"] = request.cf?.country;
  attrs["net.request_priority"] = request.cf?.requestPriority;
  attrs["net.tls_cipher"] = request.cf?.tlsCipher;
  attrs["net.tls_version"] = request.cf?.tlsVersion;
  attrs["net.asn"] = request.cf?.asn;
  attrs["net.tcp_rtt"] = request.cf?.clientTcpRtt;
  return attrs;
}
function getParentContextFromHeaders(headers) {
  return import_api15.propagation.extract(import_api15.context.active(), headers, {
    get(headers2, key) {
      return headers2.get(key) || void 0;
    },
    keys(headers2) {
      return [...headers2.keys()];
    }
  });
}
function getParentContextFromRequest(request) {
  const workerConfig = getActiveConfig();
  if (workerConfig === void 0) {
    return import_api15.context.active();
  }
  const acceptTraceContext = typeof workerConfig.handlers.fetch.acceptTraceContext === "function" ? workerConfig.handlers.fetch.acceptTraceContext(request) : workerConfig.handlers.fetch.acceptTraceContext ?? true;
  return acceptTraceContext ? getParentContextFromHeaders(request.headers) : import_api15.context.active();
}
function waitUntilTrace(fn) {
  const tracer2 = import_api15.trace.getTracer("waitUntil");
  return tracer2.startActiveSpan("waitUntil", async (span) => {
    await fn();
    span.end();
  });
}
var cold_start2 = true;
function executeFetchHandler(fetchFn, [request, env, ctx]) {
  const spanContext = getParentContextFromRequest(request);
  const tracer2 = import_api15.trace.getTracer("fetchHandler");
  const attributes = {
    ["faas.trigger"]: "http",
    ["faas.coldstart"]: cold_start2,
    ["faas.invocation_id"]: request.headers.get("cf-ray") ?? void 0
  };
  cold_start2 = false;
  Object.assign(attributes, gatherRequestAttributes(request));
  Object.assign(attributes, gatherIncomingCfAttributes(request));
  Object.assign(attributes, versionAttributes(env));
  const options = {
    attributes,
    kind: import_api15.SpanKind.SERVER
  };
  const method = request.method.toUpperCase();
  const promise = tracer2.startActiveSpan(`fetchHandler ${method}`, options, spanContext, async (span) => {
    const readable = span;
    try {
      const response = await fetchFn(request, env, ctx);
      span.setAttributes(gatherResponseAttributes(response));
      return response;
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: import_api15.SpanStatusCode.ERROR });
      throw error;
    } finally {
      if (readable.attributes["http.route"]) {
        span.updateName(`fetchHandler ${method} ${readable.attributes["http.route"]}`);
      }
      span.end();
    }
  });
  return promise;
}
function createFetchHandler(fetchFn, initialiser) {
  const fetchHandler = {
    apply: async (target, _thisArg, argArray) => {
      const [request, orig_env, orig_ctx] = argArray;
      const config = initialiser(orig_env, request);
      const env = instrumentEnv(orig_env);
      const { ctx, tracker } = proxyExecutionContext(orig_ctx);
      const context3 = setConfig(config);
      try {
        const args = [request, env, ctx];
        return await import_api15.context.with(context3, executeFetchHandler, void 0, target, args);
      } catch (error) {
        throw error;
      } finally {
        orig_ctx.waitUntil(exportSpans(tracker));
      }
    }
  };
  return wrap(fetchFn, fetchHandler);
}
function instrumentClientFetch(fetchFn, configFn, attrs) {
  const handler = {
    apply: (target, thisArg, argArray) => {
      const request = new Request(argArray[0], argArray[1]);
      if (!request.url.startsWith("http")) {
        return Reflect.apply(target, thisArg, argArray);
      }
      const workerConfig = getActiveConfig();
      if (!workerConfig) {
        return Reflect.apply(target, thisArg, [request]);
      }
      const config = configFn(workerConfig);
      const tracer2 = import_api15.trace.getTracer("fetcher");
      const options = { kind: import_api15.SpanKind.CLIENT, attributes: attrs };
      const host = new URL(request.url).host;
      const method = request.method.toUpperCase();
      const spanName = typeof attrs?.["name"] === "string" ? attrs?.["name"] : `fetch ${method} ${host}`;
      const promise = tracer2.startActiveSpan(spanName, options, async (span) => {
        const includeTraceContext = typeof config.includeTraceContext === "function" ? config.includeTraceContext(request) : config.includeTraceContext;
        if (includeTraceContext ?? true) {
          import_api15.propagation.inject(import_api15.context.active(), request.headers, {
            set: (h, k, v) => h.set(k, typeof v === "string" ? v : String(v))
          });
        }
        span.setAttributes(gatherRequestAttributes(request));
        if (request.cf) span.setAttributes(gatherOutgoingCfAttributes(request.cf));
        try {
          const response = await Reflect.apply(target, thisArg, [request]);
          span.setAttributes(gatherResponseAttributes(response));
          return response;
        } catch (err) {
          span?.setStatus({ code: import_api15.SpanStatusCode.ERROR });
          throw err;
        } finally {
          span.end();
        }
      });
      return promise;
    }
  };
  return wrap(fetchFn, handler, true);
}
function instrumentGlobalFetch() {
  globalThis.fetch = instrumentClientFetch(globalThis.fetch, (config) => config.fetch);
}

// src/instrumentation/cache.ts
var import_api16 = require("@opentelemetry/api");
var tracer = import_api16.trace.getTracer("cache instrumentation");
function sanitiseURL(url) {
  const u = new URL(url);
  return `${u.protocol}//${u.host}${u.pathname}${u.search}`;
}
function instrumentFunction(fn, cacheName, op) {
  const handler = {
    async apply(target, thisArg, argArray) {
      const attributes = {
        "cache.name": cacheName,
        "http.url": argArray[0].url ? sanitiseURL(argArray[0].url) : void 0,
        "cache.operation": op
      };
      const options = { kind: import_api16.SpanKind.CLIENT, attributes };
      return tracer.startActiveSpan(`Cache ${cacheName} ${op}`, options, async (span) => {
        const result = await Reflect.apply(target, thisArg, argArray);
        if (op === "match") {
          span.setAttribute("cache.hit", !!result);
        }
        span.end();
        return result;
      });
    }
  };
  return wrap(fn, handler);
}
function instrumentCache(cache, cacheName) {
  const handler = {
    get(target, prop) {
      if (prop === "delete" || prop === "match" || prop === "put") {
        const fn = Reflect.get(target, prop).bind(target);
        return instrumentFunction(fn, cacheName, prop);
      } else {
        return Reflect.get(target, prop);
      }
    }
  };
  return wrap(cache, handler);
}
function instrumentOpen(openFn) {
  const handler = {
    async apply(target, thisArg, argArray) {
      const cacheName = argArray[0];
      const cache = await Reflect.apply(target, thisArg, argArray);
      return instrumentCache(cache, cacheName);
    }
  };
  return wrap(openFn, handler);
}
function _instrumentGlobalCache() {
  const handler = {
    get(target, prop) {
      if (prop === "default") {
        const cache = target.default;
        return instrumentCache(cache, "default");
      } else if (prop === "open") {
        const openFn = Reflect.get(target, prop).bind(target);
        return instrumentOpen(openFn);
      } else {
        return Reflect.get(target, prop);
      }
    }
  };
  globalThis.caches = wrap(caches, handler);
}
function instrumentGlobalCache() {
  return _instrumentGlobalCache();
}

// src/instrumentation/scheduled.ts
var import_api17 = require("@opentelemetry/api");
var import_semantic_conventions8 = require("@opentelemetry/semantic-conventions");
var traceIdSymbol2 = Symbol("traceId");
var cold_start3 = true;
function executeScheduledHandler(scheduledFn, [controller, env, ctx]) {
  const tracer2 = import_api17.trace.getTracer("scheduledHandler");
  const attributes = {
    [import_semantic_conventions8.SemanticAttributes.FAAS_TRIGGER]: "timer",
    [import_semantic_conventions8.SemanticAttributes.FAAS_COLDSTART]: cold_start3,
    [import_semantic_conventions8.SemanticAttributes.FAAS_CRON]: controller.cron,
    [import_semantic_conventions8.SemanticAttributes.FAAS_TIME]: new Date(controller.scheduledTime).toISOString()
  };
  cold_start3 = false;
  Object.assign(attributes, versionAttributes(env));
  const options = {
    attributes,
    kind: import_api17.SpanKind.SERVER
  };
  const promise = tracer2.startActiveSpan(`scheduledHandler ${controller.cron}`, options, async (span) => {
    const traceId = span.spanContext().traceId;
    import_api17.context.active().setValue(traceIdSymbol2, traceId);
    try {
      await scheduledFn(controller, env, ctx);
    } catch (error) {
      span.recordException(error);
      span.setStatus({ code: import_api17.SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
  return promise;
}
function createScheduledHandler(scheduledFn, initialiser) {
  const scheduledHandler = {
    async apply(target, _thisArg, argArray) {
      const [controller, orig_env, orig_ctx] = argArray;
      const config = initialiser(orig_env, controller);
      const env = instrumentEnv(orig_env);
      const { ctx, tracker } = proxyExecutionContext(orig_ctx);
      const context3 = setConfig(config);
      try {
        const args = [controller, env, ctx];
        return await import_api17.context.with(context3, executeScheduledHandler, void 0, target, args);
      } catch (error) {
        throw error;
      } finally {
        orig_ctx.waitUntil(exportSpans(tracker));
      }
    }
  };
  return wrap(scheduledFn, scheduledHandler);
}

// versions.json
var _microlabs_otel_cf_workers = "1.0.0-rc.49";
var node = "18.18.2";

// src/instrumentation/email.ts
var import_api18 = require("@opentelemetry/api");
var import_incubating = require("@opentelemetry/semantic-conventions/incubating");
function createEmailHandler(emailFn, initialiser) {
  const emailHandler = {
    async apply(target, _thisArg, argArray) {
      const [message, orig_env, orig_ctx] = argArray;
      const config = initialiser(orig_env, message);
      const env = instrumentEnv(orig_env);
      const { ctx, tracker } = proxyExecutionContext(orig_ctx);
      const context3 = setConfig(config);
      try {
        const args = [message, env, ctx];
        return await import_api18.context.with(context3, executeEmailHandler, void 0, target, args);
      } catch (error) {
        throw error;
      } finally {
        orig_ctx.waitUntil(exportSpans(tracker));
      }
    }
  };
  return wrap(emailFn, emailHandler);
}
function headerAttributes(message) {
  return Object.fromEntries([...message.headers].map(([key, value]) => [`email.header.${key}`, value]));
}
async function executeEmailHandler(emailFn, [message, env, ctx]) {
  const tracer2 = import_api18.trace.getTracer("emailHandler");
  const options = {
    attributes: {
      [import_incubating.ATTR_FAAS_TRIGGER]: "other",
      [import_incubating.ATTR_RPC_MESSAGE_ID]: message.headers.get("Message-Id") ?? void 0,
      [import_incubating.ATTR_MESSAGING_DESTINATION_NAME]: message.to
    },
    kind: import_api18.SpanKind.CONSUMER
  };
  Object.assign(options.attributes, headerAttributes(message), versionAttributes(env));
  const promise = tracer2.startActiveSpan(`emailHandler ${message.to}`, options, async (span) => {
    try {
      const result = await emailFn(message, env, ctx);
      span.end();
      return result;
    } catch (error) {
      span.recordException(error);
      span.end();
      throw error;
    }
  });
  return promise;
}

// src/instrumentation/page.ts
var import_api19 = require("@opentelemetry/api");
var cold_start4 = true;
function executePageHandler(pagesFn, [input]) {
  const { event } = input;
  const spanContext = getParentContextFromRequest(event.request);
  const tracer2 = import_api19.trace.getTracer("pagesHandler");
  const attributes = {
    ["faas.trigger"]: "http",
    ["faas.coldstart"]: cold_start4,
    ["faas.invocation_id"]: event.request.headers.get("cf-ray") ?? void 0
  };
  cold_start4 = false;
  Object.assign(attributes, gatherRequestAttributes(event.request));
  Object.assign(attributes, gatherIncomingCfAttributes(event.request));
  const options = {
    attributes,
    kind: import_api19.SpanKind.SERVER
  };
  const promise = tracer2.startActiveSpan(
    `${event.request.method} ${event.url.pathname}`,
    options,
    spanContext,
    async (span) => {
      const readable = span;
      const method = event.request.method.toUpperCase();
      try {
        const response = await pagesFn(input);
        span.setAttributes(gatherResponseAttributes(response));
        if (readable.attributes["http.route"]) {
          span.updateName(`${event.request.method} ${readable.attributes["http.route"]}`);
        }
        span.end();
        return response;
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: import_api19.SpanStatusCode.ERROR });
        throw error;
      } finally {
        if (readable.attributes["http.route"]) {
          span.updateName(`fetchHandler ${method} ${readable.attributes["http.route"]}`);
        }
        span.end();
      }
    }
  );
  return promise;
}
function createPageHandler(pageFn, initialiser) {
  const pagesHandler = {
    apply: async (target, _thisArg, argArray) => {
      const [input] = argArray;
      const { event } = input;
      let { env, context: context3 } = event.platform;
      const config = initialiser(env, event.request);
      const configContext = setConfig(config);
      event.locals.env = instrumentEnv(env);
      event.fetch = instrumentClientFetch(event.fetch, (config2) => config2.fetch);
      const { ctx, tracker } = proxyExecutionContext(context3);
      event.locals.ctx = ctx;
      try {
        const args = [input];
        return await import_api19.context.with(configContext, executePageHandler, void 0, target, args);
      } catch (error) {
        throw error;
      } finally {
        context3.waitUntil(exportSpans(tracker));
      }
    }
  };
  return wrap(pageFn, pagesHandler);
}

// src/sdk.ts
function isRequest(trigger) {
  return trigger instanceof Request;
}
function isMessageBatch(trigger) {
  return !!trigger.ackAll;
}
function isAlarm(trigger) {
  return trigger === "do-alarm";
}
var createResource = (config) => {
  const workerResourceAttrs = {
    "cloud.provider": "cloudflare",
    "cloud.platform": "cloudflare.workers",
    "cloud.region": "earth",
    "faas.max_memory": 134217728,
    "telemetry.sdk.language": "js",
    "telemetry.sdk.name": "@microlabs/otel-cf-workers",
    "telemetry.sdk.version": _microlabs_otel_cf_workers,
    "telemetry.sdk.build.node_version": node
  };
  const serviceResource = new import_resources.Resource({
    "service.name": config.service.name,
    "service.namespace": config.service.namespace,
    "service.version": config.service.version
  });
  const resource = new import_resources.Resource(workerResourceAttrs);
  return resource.merge(serviceResource);
};
var initialised = false;
function init(config) {
  if (!initialised) {
    if (config.instrumentation.instrumentGlobalCache) {
      instrumentGlobalCache();
    }
    if (config.instrumentation.instrumentGlobalFetch) {
      instrumentGlobalFetch();
    }
    import_api20.propagation.setGlobalPropagator(config.propagator);
    const resource = createResource(config);
    const provider = new WorkerTracerProvider(config.spanProcessors, resource);
    provider.register();
    initialised = true;
  }
}
function createInitialiser(config) {
  if (typeof config === "function") {
    return (env, trigger) => {
      const conf = parseConfig(config(env, trigger));
      init(conf);
      return conf;
    };
  } else {
    return () => {
      const conf = parseConfig(config);
      init(conf);
      return conf;
    };
  }
}
function instrumentPage(eventHandler, config) {
  const initialiser = createInitialiser(config);
  eventHandler = createPageHandler(eventHandler, initialiser);
  return eventHandler;
}
function instrument(handler, config) {
  const initialiser = createInitialiser(config);
  if (handler.fetch) {
    const fetcher = unwrap(handler.fetch);
    handler.fetch = createFetchHandler(fetcher, initialiser);
  }
  if (handler.scheduled) {
    const scheduler = unwrap(handler.scheduled);
    handler.scheduled = createScheduledHandler(scheduler, initialiser);
  }
  if (handler.queue) {
    const queuer = unwrap(handler.queue);
    handler.queue = createQueueHandler(queuer, initialiser);
  }
  if (handler.email) {
    const emailer = unwrap(handler.email);
    handler.email = createEmailHandler(emailer, initialiser);
  }
  return handler;
}
function instrumentDO(doClass, config) {
  const initialiser = createInitialiser(config);
  return instrumentDOClass(doClass, initialiser);
}
var __unwrappedFetch = unwrap(fetch);

// src/multiexporter.ts
var import_core6 = require("@opentelemetry/core");
var MultiSpanExporter = class {
  exporters;
  constructor(exporters) {
    this.exporters = exporters;
  }
  export(items, resultCallback) {
    for (const exporter of this.exporters) {
      exporter.export(items, resultCallback);
    }
  }
  async shutdown() {
    for (const exporter of this.exporters) {
      await exporter.shutdown();
    }
  }
};
var MultiSpanExporterAsync = class {
  exporters;
  constructor(exporters) {
    this.exporters = exporters;
  }
  export(items, resultCallback) {
    const promises = this.exporters.map(
      (exporter) => new Promise((resolve) => {
        exporter.export(items, resolve);
      })
    );
    Promise.all(promises).then((results) => {
      const failed = results.filter((result) => result.code === import_core6.ExportResultCode.FAILED);
      if (failed.length > 0) {
        resultCallback({ code: import_core6.ExportResultCode.FAILED, error: failed[0].error });
      } else {
        resultCallback({ code: import_core6.ExportResultCode.SUCCESS });
      }
    });
  }
  async shutdown() {
    await Promise.all(this.exporters.map((exporter) => exporter.shutdown()));
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  BatchTraceSpanProcessor,
  MultiSpanExporter,
  MultiSpanExporterAsync,
  OTLPExporter,
  SpanImpl,
  __unwrappedFetch,
  createSampler,
  instrument,
  instrumentDO,
  instrumentPage,
  isAlarm,
  isHeadSampled,
  isMessageBatch,
  isRequest,
  isRootErrorSpan,
  multiTailSampler,
  waitUntilTrace,
  withNextSpan
});
//# sourceMappingURL=index.js.map