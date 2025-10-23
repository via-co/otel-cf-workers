import { DurableObject } from 'cloudflare:workers'
import { Initialiser, setConfig } from '../config'
import { propagation, context as api_context, trace, SpanOptions, SpanKind, Exception } from '@opentelemetry/api'
import { instrumentEnv } from './env'
import { exportSpans, proxyExecutionContext } from './common'
import { getParentContextFromMetadata } from './entrypoint'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { ResolvedTraceConfig } from '../types'

const traceIdSymbol = Symbol('traceId')

export abstract class InstrumentedDurableObject<Env extends Record<string, unknown>> extends DurableObject<Env> {
	private metadata: Record<string, unknown> = {}
	static async getInstance<T extends InstrumentedDurableObject<Record<string, unknown>>>(
		doNamespace: DurableObjectNamespace<T>,
		key: string,
	): Promise<DurableObjectStub<T>> {
		if (!key) {
			throw new Error('DO identifier cannot be null or undefined.')
		}
		const id: DurableObjectId = doNamespace.idFromName(key)
		const stub = doNamespace.get(id)
		const metadata: Record<string, unknown> = {}
		propagation.inject(api_context.active(), metadata, {
			set: (h, k, v) => (h[k] = typeof v === 'string' ? v : String(v)),
		})
		await stub.setMetadata(metadata)
		return stub
	}

	public async setMetadata(metadata: Record<string, unknown>): Promise<void> {
		if (Object.keys(this.metadata).length === 0) {
			this.metadata = metadata
		}
	}
}

function getParentContextFromDO(workerConfig: ResolvedTraceConfig | undefined, metadata: Record<string, unknown>) {
	if (workerConfig === undefined) {
		return api_context.active()
	}

	const acceptTraceContext = workerConfig.handlers.fetch.acceptTraceContext ?? true
	return acceptTraceContext && !!metadata
		? getParentContextFromMetadata((metadata as Record<string, string | string[] | undefined>) ?? {})
		: api_context.active()
}

export function createDoMethodHandler(initialiser: Initialiser): MethodDecorator {
	// @ts-expect-error type checking
	const decorator: MethodDecorator = <Target extends InstrumentedDurableObject>(
		target: Target,
		propertyKey: string,
		descriptor: PropertyDescriptor,
	) => {
		const original = descriptor.value
		descriptor.value = async function (...args: unknown[]) {
			const originalRef = this as Target
			const orig_env = originalRef.env
			const orig_ctx = originalRef.ctx
			const config = initialiser(orig_env as Record<string, unknown>, this)
			const env = instrumentEnv(orig_env as Record<string, unknown>)
			const { tracker } = proxyExecutionContext(orig_ctx)
			const context = setConfig(config)

			try {
				originalRef.env = env
				const metadata = originalRef['metadata'] ?? {}
				const executeEntrypointHandler = (): Promise<unknown> => {
					const spanContext = getParentContextFromDO(config, metadata)
					const tracer = trace.getTracer('doClassHandler')
					const options: SpanOptions = {
						attributes: {
							[SemanticAttributes.FAAS_TRIGGER]: 'do-rpc',
							'rpc.function.name': propertyKey,
						},
						kind: SpanKind.SERVER,
					}
					const promise = tracer.startActiveSpan(
						`DO RPC ${target.constructor.name}.${propertyKey}`,
						options,
						spanContext,
						async (span) => {
							const traceId = span.spanContext().traceId
							api_context.active().setValue(traceIdSymbol, traceId)
							try {
								const result = await original.apply(originalRef, args)
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
		}
		return descriptor
	}
	return decorator
}
