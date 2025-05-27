import {
	context as api_context,
	Attributes,
	propagation,
	SpanKind,
	SpanOptions,
	SpanStatusCode,
	trace,
} from '@opentelemetry/api'
import { ResolvedTraceConfig } from '../../dist/index.mjs'
import { unwrap, wrap } from '../wrap.js'
import { FetcherConfig, instrumentClientFetch } from './fetch.js'
import { getActiveConfig } from '../config.js'
import { should } from 'vitest'

export function instrumentServiceBinding(fetcher: Fetcher, envName: string): Fetcher {
	const fetcherHandler: ProxyHandler<Fetcher> = {
		get(target, prop) {
			if (prop === 'fetch') {
				const fetcher = Reflect.get(target, prop)
				const attrs = {
					name: `Service Binding ${envName}`,
				}
				return instrumentClientFetch(fetcher, () => ({ includeTraceContext: true }), attrs)
			} else {
				return instrumentClientRpcIfNeeded(target, envName, prop)
			}
		},
	}
	return wrap(fetcher, fetcherHandler)
}

export function instrumentClientRpcIfNeeded(target: any, envName: string, prop: string | symbol, thisArg?: any) {
	const unwrappedTarget = unwrap(target)
	const value = Reflect.get(unwrappedTarget, prop)
	if (typeof value === 'function') {
		if (value.constructor.name === 'RpcProperty') {
			const attrs = {
				name: `RPC call ${envName}.${String(prop)}`,
			}
			return instrumentClientRpc(value, () => ({ includeTraceContext: true }), attrs)
		}
		thisArg = thisArg || unwrappedTarget
		return value.bind(thisArg)
	} else {
		return value
	}
}

type SimpleRpcRequest = {
	metadata: Record<string, string>
}

type getFetchConfig = (config: ResolvedTraceConfig) => FetcherConfig
export function instrumentClientRpc(
	fetchFn: Fetcher['fetch'],
	configFn: getFetchConfig,
	attrs?: Attributes,
): Fetcher['fetch'] {
	const handler: ProxyHandler<Fetcher['fetch']> = {
		apply: (target, thisArg, argArray): Response | Promise<Response> => {
			const shouldPropagate = argArray?.length > 0 && typeof argArray[0] === 'object'

			const request = shouldPropagate ? (argArray[0] as SimpleRpcRequest) : undefined
			if (request) {
				request.metadata = request.metadata ? request.metadata : {}
			}

			const workerConfig = getActiveConfig()
			if (!workerConfig) {
				return Reflect.apply(target, thisArg, [request])
			}
			const config = configFn(workerConfig)

			const tracer = trace.getTracer('rpc')
			const options: SpanOptions = { kind: SpanKind.CLIENT, attributes: attrs }

			const spanName = typeof attrs?.['name'] === 'string' ? attrs?.['name'] : `RPC call`
			const promise = tracer.startActiveSpan(spanName, options, async (span) => {
				const includeTraceContext = config.includeTraceContext ?? true
				if (request && includeTraceContext) {
					propagation.inject(api_context.active(), request.metadata, {
						set: (h, k, v) => (h[k] = typeof v === 'string' ? v : String(v)),
					})
				}
				try {
					return await Reflect.apply(target, thisArg, [request])
				} catch (err) {
					span?.setStatus({ code: SpanStatusCode.ERROR })
					throw err
				} finally {
					span.end()
				}
			})
			return promise
		},
	}
	return wrap(fetchFn, handler, true)
}
