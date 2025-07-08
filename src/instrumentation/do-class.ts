import { DurableObject, RpcTarget } from 'cloudflare:workers'
import { Initialiser, setConfig } from '../config'
import { instrumentEnv } from './env'
import { exportSpans, proxyExecutionContext } from './common'
import { Exception, SpanKind, SpanOptions, trace, context as api_context } from '@opentelemetry/api'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { getParentContextFromMetadata } from './entrypoint'

const traceIdSymbol = Symbol('traceId')

export class InstrumentedDoRpc<DoClass extends DurableObject> extends RpcTarget {
	constructor(
		protected targetDo: DoClass,
		private metadata: Record<string, unknown>,
	) {
		super()
	}

	getMetadata<R>(key: string): R {
		return this.metadata[key] as R
	}
}

export function createDoMethodHandler(initialiser: Initialiser, targetClass: Function, omitFunctions?: string[]) {
	return function <T extends { new (...args: any[]): any }>(constructor: T) {
		const methodNames = Object.getOwnPropertyNames(targetClass.prototype).filter(
			(key) => key !== 'constructor' && typeof targetClass.prototype[key] === 'function',
		)

		for (const methodName of methodNames) {
			Object.defineProperty(constructor.prototype, methodName, {
				value: async function (...args: any[]) {
					const mainDo = this['targetDo']
					if (omitFunctions?.includes(methodName)) {
						// do not start span
						return await mainDo[methodName](...args)
					}
					const originalRef = mainDo as DurableObject<Record<string, unknown>>
					const orig_env = originalRef['env']
					const orig_ctx = originalRef['ctx']
					const config = initialiser(orig_env as Record<string, unknown>, this)
					const env = instrumentEnv(orig_env as Record<string, unknown>)
					const { tracker } = proxyExecutionContext(orig_ctx)
					const context = setConfig(config)

					try {
						// @ts-expect-error type checking
						originalRef.env = env
						const metadata = this['metadata'] ?? {}
						const executeEntrypointHandler = (): Promise<unknown> => {
							const spanContext = getParentContextFromMetadata(metadata)
							const tracer = trace.getTracer('rpcHandler')
							const options: SpanOptions = {
								attributes: {
									[SemanticAttributes.FAAS_TRIGGER]: 'rpc',
									'rpc.function.name': methodName,
								},
								kind: SpanKind.SERVER,
							}
							const promise = tracer.startActiveSpan(
								`DO RPC ${mainDo.constructor.name}.${methodName}`,
								options,
								spanContext,
								async (span) => {
									const traceId = span.spanContext().traceId
									api_context.active().setValue(traceIdSymbol, traceId)
									try {
										const result = await mainDo[methodName](...args)
										span.end()
										return result
									} catch (error) {
										span.recordException(error as Exception)
										span.end()
										throw error
									}
								},
							)
							return promise
						}
						return await api_context.with(context, executeEntrypointHandler)
					} catch (error) {
						throw error
					} finally {
						orig_ctx.waitUntil(exportSpans(tracker))
					}
				},
				writable: true,
				configurable: true,
			})
		}
	}
}
