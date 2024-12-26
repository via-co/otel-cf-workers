import { SpanExporter, ReadableSpan, Sampler, SpanProcessor, TimedEvent } from '@opentelemetry/sdk-trace-base';
import { TextMapPropagator, Span, SpanKind, Attributes, SpanStatus, HrTime, Link, SpanContext, AttributeValue, TimeInput, Exception, Context } from '@opentelemetry/api';
import { OTLPExporterError } from '@opentelemetry/otlp-exporter-base';
import { ExportResult, InstrumentationLibrary } from '@opentelemetry/core';
import * as cookie from 'cookie';
import { IResource } from '@opentelemetry/resources';

interface OTLPExporterConfig {
    url: string;
    headers?: Record<string, string>;
}
declare class OTLPExporter implements SpanExporter {
    private headers;
    private url;
    constructor(config: OTLPExporterConfig);
    export(items: any[], resultCallback: (result: ExportResult) => void): void;
    private _export;
    send(items: any[], onSuccess: () => void, onError: (error: OTLPExporterError) => void): void;
    shutdown(): Promise<void>;
}

type IncludeTraceContextFn = (request: Request) => boolean;
interface FetcherConfig {
    includeTraceContext?: boolean | IncludeTraceContextFn;
}
type AcceptTraceContextFn = (request: Request) => boolean;
interface FetchHandlerConfig {
    /**
     * Whether to enable context propagation for incoming requests to `fetch`.
     * This enables or disables distributed tracing from W3C Trace Context headers.
     * @default true
     */
    acceptTraceContext?: boolean | AcceptTraceContextFn;
}
declare function waitUntilTrace(fn: () => Promise<any>): Promise<void>;

type PostProcessorFn = (spans: ReadableSpan[]) => ReadableSpan[];
type ExporterConfig = OTLPExporterConfig | SpanExporter;
interface HandlerConfig {
    fetch?: FetchHandlerConfig;
}
interface ServiceConfig {
    name: string;
    namespace?: string;
    version?: string;
}
interface ParentRatioSamplingConfig {
    acceptRemote?: boolean;
    ratio: number;
}
type HeadSamplerConf = Sampler | ParentRatioSamplingConfig;
interface SamplingConfig<HS extends HeadSamplerConf = HeadSamplerConf> {
    headSampler?: HS;
    tailSampler?: TailSampleFn;
}
interface InstrumentationOptions {
    instrumentGlobalFetch?: boolean;
    instrumentGlobalCache?: boolean;
}
interface TraceConfigBase {
    service: ServiceConfig;
    handlers?: HandlerConfig;
    fetch?: FetcherConfig;
    postProcessor?: PostProcessorFn;
    sampling?: SamplingConfig;
    propagator?: TextMapPropagator;
    instrumentation?: InstrumentationOptions;
}
interface TraceConfigExporter extends TraceConfigBase {
    exporter: ExporterConfig;
}
interface TraceConfigSpanProcessors extends TraceConfigBase {
    spanProcessors: SpanProcessor | SpanProcessor[];
}
type TraceConfig = TraceConfigExporter | TraceConfigSpanProcessors;
declare function isSpanProcessorConfig(config: TraceConfig): config is TraceConfigSpanProcessors;
interface ResolvedTraceConfig extends TraceConfigBase {
    handlers: Required<HandlerConfig>;
    fetch: Required<FetcherConfig>;
    postProcessor: PostProcessorFn;
    sampling: Required<SamplingConfig<Sampler>>;
    spanProcessors: SpanProcessor[];
    propagator: TextMapPropagator;
    instrumentation: InstrumentationOptions;
}
interface DOConstructorTrigger {
    id: string;
    name?: string;
}
type Trigger = Request | MessageBatch | ScheduledController | DOConstructorTrigger | 'do-alarm' | ForwardableEmailMessage;

interface LocalTrace {
    readonly traceId: string;
    readonly localRootSpan: ReadableSpan;
    readonly spans: ReadableSpan[];
}
type TailSampleFn = (traceInfo: LocalTrace) => boolean;
declare function multiTailSampler(samplers: TailSampleFn[]): TailSampleFn;
declare const isHeadSampled: TailSampleFn;
declare const isRootErrorSpan: TailSampleFn;
declare function createSampler(conf: ParentRatioSamplingConfig): Sampler;

type DOClass = {
    new (state: DurableObjectState, env: any): DurableObject;
};

type Cookies = {
    /**
     * Gets a cookie that was previously set with `cookies.set`, or from the request headers.
     * @param name the name of the cookie
     * @param opts the options, passed directly to `cookie.parse`. See documentation [here](https://github.com/jshttp/cookie#cookieparsestr-options)
     */
    get(name: string, opts?: cookie.ParseOptions): string | undefined;
    /**
     * Gets all cookies that were previously set with `cookies.set`, or from the request headers.
     * @param opts the options, passed directly to `cookie.parse`. See documentation [here](https://github.com/jshttp/cookie#cookieparsestr-options)
     */
    getAll(opts?: cookie.ParseOptions): Array<{
        name: string;
        value: string;
    }>;
    /**
     * Sets a cookie. This will add a `set-cookie` header to the response, but also make the cookie available via `cookies.get` or `cookies.getAll` during the current request.
     *
     * The `httpOnly` and `secure` options are `true` by default (except on http://localhost, where `secure` is `false`), and must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP. The `sameSite` option defaults to `lax`.
     *
     * You must specify a `path` for the cookie. In most cases you should explicitly set `path: '/'` to make the cookie available throughout your app. You can use relative paths, or set `path: ''` to make the cookie only available on the current path and its children
     * @param name the name of the cookie
     * @param value the cookie value
     * @param opts the options, passed directly to `cookie.serialize`. See documentation [here](https://github.com/jshttp/cookie#cookieserializename-value-options)
     */
    set(name: string, value: string, opts: cookie.ParseOptions & {
        path: string;
    }): void;
    /**
     * Deletes a cookie by setting its value to an empty string and setting the expiry date in the past.
     *
     * You must specify a `path` for the cookie. In most cases you should explicitly set `path: '/'` to make the cookie available throughout your app. You can use relative paths, or set `path: ''` to make the cookie only available on the current path and its children
     * @param name the name of the cookie
     * @param opts the options, passed directly to `cookie.serialize`. The `path` must match the path of the cookie you want to delete. See documentation [here](https://github.com/jshttp/cookie#cookieserializename-value-options)
     */
    delete(name: string, opts: cookie.ParseOptions & {
        path: string;
    }): void;
    /**
     * Serialize a cookie name-value pair into a `Set-Cookie` header string, but don't apply it to the response.
     *
     * The `httpOnly` and `secure` options are `true` by default (except on http://localhost, where `secure` is `false`), and must be explicitly disabled if you want cookies to be readable by client-side JavaScript and/or transmitted over HTTP. The `sameSite` option defaults to `lax`.
     *
     * You must specify a `path` for the cookie. In most cases you should explicitly set `path: '/'` to make the cookie available throughout your app. You can use relative paths, or set `path: ''` to make the cookie only available on the current path and its children
     *
     * @param name the name of the cookie
     * @param value the cookie value
     * @param opts the options, passed directly to `cookie.serialize`. See documentation [here](https://github.com/jshttp/cookie#cookieserializename-value-options)
     */
    serialize(name: string, value: string, opts: cookie.ParseOptions & {
        path: string;
    }): string;
};
interface ResolveOptions {
    /**
     * Applies custom transforms to HTML. If `done` is true, it's the final chunk. Chunks are not guaranteed to be well-formed HTML
     * (they could include an element's opening tag but not its closing tag, for example)
     * but they will always be split at sensible boundaries such as `%sveltekit.head%` or layout/page components.
     * @param input the html chunk and the info if this is the last chunk
     */
    transformPageChunk?(input: {
        html: string;
        done: boolean;
    }): MaybePromise<string | undefined>;
    /**
     * Determines which headers should be included in serialized responses when a `load` function loads a resource with `fetch`.
     * By default, none will be included.
     * @param name header name
     * @param value header value
     */
    filterSerializedResponseHeaders?(name: string, value: string): boolean;
    /**
     * Determines what should be added to the `<head>` tag to preload it.
     * By default, `js` and `css` files will be preloaded.
     * @param input the type of the file and its path
     */
    preload?(input: {
        type: 'font' | 'css' | 'js' | 'asset';
        path: string;
    }): boolean;
}
type SvelteLocals = Partial<Record<string, any>>;
type Env = unknown;
type SveltePlatform = {
    env: Env;
    cf: CfProperties;
    ctx: ExecutionContext;
};
type RequestEvent<Params extends Partial<Record<string, string>> = Partial<Record<string, string>>, RouteId extends string | null = string | null> = {
    /**
     * Get or set cookies related to the current request
     */
    cookies: Cookies;
    /**
     * `fetch` is equivalent to the [native `fetch` web API](https://developer.mozilla.org/en-US/docs/Web/API/fetch), with a few additional features:
     *
     * - It can be used to make credentialed requests on the server, as it inherits the `cookie` and `authorization` headers for the page request.
     * - It can make relative requests on the server (ordinarily, `fetch` requires a URL with an origin when used in a server context).
     * - Internal requests (e.g. for `+server.js` routes) go directly to the handler function when running on the server, without the overhead of an HTTP call.
     * - During server-side rendering, the response will be captured and inlined into the rendered HTML by hooking into the `text` and `json` methods of the `Response` object. Note that headers will _not_ be serialized, unless explicitly included via [`filterSerializedResponseHeaders`](https://svelte.dev/docs/kit/hooks#Server-hooks-handle)
     * - During hydration, the response will be read from the HTML, guaranteeing consistency and preventing an additional network request.
     *
     * You can learn more about making credentialed requests with cookies [here](https://svelte.dev/docs/kit/load#Cookies)
     */
    fetch: typeof fetch;
    /**
     * The client's IP address, set by the adapter.
     */
    getClientAddress(): string;
    /**
     * Contains custom data that was added to the request within the [`server handle hook`](https://svelte.dev/docs/kit/hooks#Server-hooks-handle).
     */
    locals: SvelteLocals;
    /**
     * The parameters of the current route - e.g. for a route like `/blog/[slug]`, a `{ slug: string }` object
     */
    params: Params;
    /**
     * Additional data made available through the adapter.
     */
    platform: Readonly<SveltePlatform> | undefined;
    /**
     * The original request object
     */
    request: Request;
    /**
     * Info about the current route
     */
    route: {
        /**
         * The ID of the current route - e.g. for `src/routes/blog/[slug]`, it would be `/blog/[slug]`
         */
        id: RouteId;
    };
    /**
     * If you need to set headers for the response, you can do so using the this method. This is useful if you want the page to be cached, for example:
     *
     *	```js
     *	/// file: src/routes/blog/+page.js
     *	export async function load({ fetch, setHeaders }) {
     *		const url = `https://cms.example.com/articles.json`;
     *		const response = await fetch(url);
     *
     *		setHeaders({
     *			age: response.headers.get('age'),
     *			'cache-control': response.headers.get('cache-control')
     *		});
     *
     *		return response.json();
     *	}
     *	```
     *
     * Setting the same header multiple times (even in separate `load` functions) is an error — you can only set a given header once.
     *
     * You cannot add a `set-cookie` header with `setHeaders` — use the [`cookies`](https://svelte.dev/docs/kit/@sveltejs-kit#Cookies) API instead.
     */
    setHeaders(headers: Record<string, string>): void;
    /**
     * The requested URL.
     */
    url: URL;
    /**
     * `true` if the request comes from the client asking for `+page/layout.server.js` data. The `url` property will be stripped of the internal information
     * related to the data request in this case. Use this property instead if the distinction is important to you.
     */
    isDataRequest: boolean;
    /**
     * `true` for `+server.js` calls coming from SvelteKit without the overhead of actually making an HTTP request. This happens when you make same-origin `fetch` requests on the server.
     */
    isSubRequest: boolean;
};
type MaybePromise<T> = T | Promise<T>;
type ExportedSvelteEventHandler = (input: {
    event: RequestEvent;
    resolve(event: RequestEvent, opts?: ResolveOptions): MaybePromise<Response>;
}) => MaybePromise<Response>;

type ResolveConfigFn<Env = any> = (env: Env, trigger: Trigger) => TraceConfig;
type ConfigurationOption = TraceConfig | ResolveConfigFn;
declare function isRequest(trigger: Trigger): trigger is Request;
declare function isMessageBatch(trigger: Trigger): trigger is MessageBatch;
declare function isAlarm(trigger: Trigger): trigger is 'do-alarm';
declare function instrumentPage(eventHandler: ExportedSvelteEventHandler, config: ConfigurationOption): ExportedSvelteEventHandler;
declare function instrument<E, Q, C>(handler: ExportedHandler<E, Q, C>, config: ConfigurationOption): ExportedHandler<E, Q, C>;
declare function instrumentDO(doClass: DOClass, config: ConfigurationOption): DOClass;

declare const __unwrappedFetch: typeof fetch;

type OnSpanEnd = (span: Span) => void;
interface SpanInit {
    attributes: unknown;
    name: string;
    onEnd: OnSpanEnd;
    resource: IResource;
    spanContext: SpanContext;
    links?: Link[];
    parentSpanId?: string;
    spanKind?: SpanKind;
    startTime?: TimeInput;
}
declare class SpanImpl implements Span, ReadableSpan {
    name: string;
    private readonly _spanContext;
    private readonly onEnd;
    readonly parentSpanId?: string;
    readonly kind: SpanKind;
    readonly attributes: Attributes;
    status: SpanStatus;
    endTime: HrTime;
    private _duration;
    readonly startTime: HrTime;
    readonly events: TimedEvent[];
    readonly links: Link[];
    readonly resource: IResource;
    instrumentationLibrary: InstrumentationLibrary;
    private _ended;
    private _droppedAttributesCount;
    private _droppedEventsCount;
    private _droppedLinksCount;
    constructor(init: SpanInit);
    addLink(link: Link): this;
    addLinks(links: Link[]): this;
    spanContext(): SpanContext;
    setAttribute(key: string, value?: AttributeValue): this;
    setAttributes(attributes: Attributes): this;
    addEvent(name: string, attributesOrStartTime?: Attributes | TimeInput, startTime?: TimeInput): this;
    setStatus(status: SpanStatus): this;
    updateName(name: string): this;
    end(endTime?: TimeInput): void;
    isRecording(): boolean;
    recordException(exception: Exception, time?: TimeInput): void;
    get duration(): HrTime;
    get ended(): boolean;
    get droppedAttributesCount(): number;
    get droppedEventsCount(): number;
    get droppedLinksCount(): number;
}

declare class MultiSpanExporter implements SpanExporter {
    private exporters;
    constructor(exporters: Array<SpanExporter>);
    export(items: any[], resultCallback: (result: ExportResult) => void): void;
    shutdown(): Promise<void>;
}
declare class MultiSpanExporterAsync implements SpanExporter {
    private exporters;
    constructor(exporters: Array<SpanExporter>);
    export(items: any[], resultCallback: (result: ExportResult) => void): void;
    shutdown(): Promise<void>;
}

declare class BatchTraceSpanProcessor implements SpanProcessor {
    private exporter;
    private traceLookup;
    private localRootSpanLookup;
    private inprogressExports;
    constructor(exporter: SpanExporter);
    private action;
    private export;
    onStart(span: Span, parentContext: Context): void;
    onEnd(span: ReadableSpan): void;
    forceFlush(): Promise<void>;
    shutdown(): Promise<void>;
}

declare function withNextSpan(attrs: Attributes): void;

export { BatchTraceSpanProcessor, type ConfigurationOption, type DOConstructorTrigger, type ExporterConfig, type HandlerConfig, type InstrumentationOptions, type LocalTrace, MultiSpanExporter, MultiSpanExporterAsync, OTLPExporter, type OTLPExporterConfig, type ParentRatioSamplingConfig, type PostProcessorFn, type ResolveConfigFn, type ResolvedTraceConfig, type SamplingConfig, type ServiceConfig, SpanImpl, type TailSampleFn, type TraceConfig, type Trigger, __unwrappedFetch, createSampler, instrument, instrumentDO, instrumentPage, isAlarm, isHeadSampled, isMessageBatch, isRequest, isRootErrorSpan, isSpanProcessorConfig, multiTailSampler, waitUntilTrace, withNextSpan };
