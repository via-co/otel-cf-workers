import { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import { Initialiser, setConfig } from '../config'
import { exportSpans, proxyExecutionContext } from './common'
import { Exception, SpanKind, SpanOptions, SpanStatusCode, context as api_context, trace } from '@opentelemetry/api'
import { wrap } from '../wrap'
import {
	gatherIncomingCfAttributes,
	gatherRequestAttributes,
	gatherResponseAttributes,
	getParentContextFromRequest,
	instrumentClientFetch,
} from './fetch'
import { instrumentEnv } from './env'

export type Cookies = {
	/**
	 * Gets a cookie that was previously set with `cookies.set`, or from the request headers.
	 * @param name the name of the cookie
	 * @param opts the options, passed directly to `cookie.parse`. See documentation [here](https://github.com/jshttp/cookie#cookieparsestr-options)
	 */
	get(name: string, opts?: import('cookie').ParseOptions): string | undefined

	/**
	 * Gets all cookies that were previously set with `cookies.set`, or from the request headers.
	 * @param opts the options, passed directly to `cookie.parse`. See documentation [here](https://github.com/jshttp/cookie#cookieparsestr-options)
	 */
	getAll(opts?: import('cookie').ParseOptions): Array<{ name: string; value: string }>

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
	set(name: string, value: string, opts: import('cookie').ParseOptions & { path: string }): void

	/**
	 * Deletes a cookie by setting its value to an empty string and setting the expiry date in the past.
	 *
	 * You must specify a `path` for the cookie. In most cases you should explicitly set `path: '/'` to make the cookie available throughout your app. You can use relative paths, or set `path: ''` to make the cookie only available on the current path and its children
	 * @param name the name of the cookie
	 * @param opts the options, passed directly to `cookie.serialize`. The `path` must match the path of the cookie you want to delete. See documentation [here](https://github.com/jshttp/cookie#cookieserializename-value-options)
	 */
	delete(name: string, opts: import('cookie').ParseOptions & { path: string }): void

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
	serialize(name: string, value: string, opts: import('cookie').ParseOptions & { path: string }): string
}

export interface ResolveOptions {
	/**
	 * Applies custom transforms to HTML. If `done` is true, it's the final chunk. Chunks are not guaranteed to be well-formed HTML
	 * (they could include an element's opening tag but not its closing tag, for example)
	 * but they will always be split at sensible boundaries such as `%sveltekit.head%` or layout/page components.
	 * @param input the html chunk and the info if this is the last chunk
	 */
	transformPageChunk?(input: { html: string; done: boolean }): MaybePromise<string | undefined>
	/**
	 * Determines which headers should be included in serialized responses when a `load` function loads a resource with `fetch`.
	 * By default, none will be included.
	 * @param name header name
	 * @param value header value
	 */
	filterSerializedResponseHeaders?(name: string, value: string): boolean
	/**
	 * Determines what should be added to the `<head>` tag to preload it.
	 * By default, `js` and `css` files will be preloaded.
	 * @param input the type of the file and its path
	 */
	preload?(input: { type: 'font' | 'css' | 'js' | 'asset'; path: string }): boolean
}
export type SvelteLocals = Partial<Record<string, any>>
type Env = unknown
export type SveltePlatform = {
	env: Env
	cf: CfProperties
	ctx: ExecutionContext
}

export type RequestEvent<
	Params extends Partial<Record<string, string>> = Partial<Record<string, string>>,
	RouteId extends string | null = string | null,
> = {
	/**
	 * Get or set cookies related to the current request
	 */
	cookies: Cookies
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
	fetch: typeof fetch
	/**
	 * The client's IP address, set by the adapter.
	 */
	getClientAddress(): string
	/**
	 * Contains custom data that was added to the request within the [`server handle hook`](https://svelte.dev/docs/kit/hooks#Server-hooks-handle).
	 */
	locals: SvelteLocals
	/**
	 * The parameters of the current route - e.g. for a route like `/blog/[slug]`, a `{ slug: string }` object
	 */
	params: Params
	/**
	 * Additional data made available through the adapter.
	 */
	platform: Readonly<SveltePlatform> | undefined
	/**
	 * The original request object
	 */
	request: Request
	/**
	 * Info about the current route
	 */
	route: {
		/**
		 * The ID of the current route - e.g. for `src/routes/blog/[slug]`, it would be `/blog/[slug]`
		 */
		id: RouteId
	}
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
	setHeaders(headers: Record<string, string>): void
	/**
	 * The requested URL.
	 */
	url: URL
	/**
	 * `true` if the request comes from the client asking for `+page/layout.server.js` data. The `url` property will be stripped of the internal information
	 * related to the data request in this case. Use this property instead if the distinction is important to you.
	 */
	isDataRequest: boolean
	/**
	 * `true` for `+server.js` calls coming from SvelteKit without the overhead of actually making an HTTP request. This happens when you make same-origin `fetch` requests on the server.
	 */
	isSubRequest: boolean
}

export type MaybePromise<T> = T | Promise<T>

export type ExportedSvelteEventHandler = (input: {
	event: RequestEvent
	resolve(event: RequestEvent, opts?: ResolveOptions): MaybePromise<Response>
}) => MaybePromise<Response>

export type _Response = typeof globalThis extends { onmessage: any } ? {} : import('undici-types').Response
export interface ResponseEvent extends _Response {}

type PageHandlerArgs = Parameters<ExportedSvelteEventHandler>

let cold_start = true
export function executePageHandler(pagesFn: ExportedSvelteEventHandler, [input]: PageHandlerArgs): Promise<Response> {
	const { event } = input
	const spanContext = getParentContextFromRequest(event.request)

	const tracer = trace.getTracer('pagesHandler')
	const attributes = {
		['faas.trigger']: 'http',
		['faas.coldstart']: cold_start,
		['faas.invocation_id']: event.request.headers.get('cf-ray') ?? undefined,
	}
	cold_start = false
	Object.assign(attributes, gatherRequestAttributes(event.request))
	Object.assign(attributes, gatherIncomingCfAttributes(event.request))
	const options: SpanOptions = {
		attributes,
		kind: SpanKind.SERVER,
	}

	const promise = tracer.startActiveSpan(
		`${event.request.method} ${event.url.pathname}`,
		options,
		spanContext,
		async (span) => {
			const readable = span as unknown as ReadableSpan
			const method = event.request.method.toUpperCase()
			try {
				const response: Response = await pagesFn(input)
				span.setAttributes(gatherResponseAttributes(response))
				if (readable.attributes['http.route']) {
					span.updateName(`${event.request.method} ${readable.attributes['http.route']}`)
				}
				span.end()

				return response
			} catch (error) {
				span.recordException(error as Exception)
				span.setStatus({ code: SpanStatusCode.ERROR })
				throw error
			} finally {
				if (readable.attributes['http.route']) {
					span.updateName(`fetchHandler ${method} ${readable.attributes['http.route']}`)
				}
				span.end()
			}
		},
	)
	return promise
}

export function createPageHandler(pageFn: ExportedSvelteEventHandler, initialiser: Initialiser) {
	const pagesHandler: ProxyHandler<ExportedSvelteEventHandler> = {
		apply: async (target, _thisArg, argArray: Parameters<ExportedSvelteEventHandler>): Promise<Response> => {
			const [input] = argArray
			const { event } = input
			// @ts-expect-error
			let { env, context } = event.platform!
			const config = initialiser(env as Record<string, unknown>, event.request)
			const configContext = setConfig(config)
			// @ts-expect-error
			event.locals.env = instrumentEnv(env as Record<string, unknown>)
			event.fetch = instrumentClientFetch(event.fetch, (config) => config.fetch)
			const { ctx, tracker } = proxyExecutionContext(context)
			// @ts-expect-error
			event.locals.ctx = ctx

			try {
				const args: PageHandlerArgs = [input] as PageHandlerArgs
				return await api_context.with(configContext, executePageHandler, undefined, target, args)
			} catch (error) {
				throw error
			} finally {
				context.waitUntil(exportSpans(tracker))
			}
		},
	}
	return wrap(pageFn, pagesHandler)
}
