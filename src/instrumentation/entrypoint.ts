import { SpanKind, SpanOptions, trace, context as api_context, Exception } from '@opentelemetry/api'
import { Initialiser, setConfig } from '../config'
import { exportSpans, proxyExecutionContext } from './common'
import { instrumentEnv } from './env'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { instrumentClientFetch } from './fetch'
import { WorkerEntrypoint } from 'cloudflare:workers'

const traceIdSymbol = Symbol('traceId')

export abstract class InstrumentedEntrypoint<E extends Record<string, unknown>> extends WorkerEntrypoint<E> {
	private enhancedEnv: E

	constructor(ctx: ExecutionContext, env: E) {
		super(ctx, env)
		this.enhancedEnv = {} as E
	}

	public set instrumentedEnv(env: E) {
		this.enhancedEnv = env
	}

	protected entrypointContext<EntrypointContext>(): EntrypointContext {
		return {
			env: this.enhancedEnv,
			fetch: this.fetch,
		} as EntrypointContext
	}
}

export function createEntrypointHandler<E extends Record<string, unknown>>(initialiser: Initialiser): MethodDecorator {
	// @ts-expect-error type checking
	const decorator: MethodDecorator = <Target extends InstrumentedEntrypoint<E>>(
		target: Target,
		propertyKey: string,
		descriptor: PropertyDescriptor,
	) => {
		const original = descriptor.value
		descriptor.value = async function (...args: unknown[]) {
			const originalRef = this as InstrumentedEntrypoint<E>
			// @ts-expect-error type check
			const orig_env = originalRef.env
			// @ts-expect-error type check
			const orig_ctx = originalRef.ctx
			const config = initialiser(orig_env as Record<string, unknown>, this)
			const env = instrumentEnv(orig_env as Record<string, unknown>)
			// @ts-expect-error type checking
			originalRef.fetch = instrumentClientFetch(originalRef.fetch, (config) => config.fetch)
			const { tracker } = proxyExecutionContext(orig_ctx)
			const context = setConfig(config)

			try {
				// @ts-expect-error type checking
				originalRef.instrumentedEnv = env
				const executeEntrypointHandler = (): Promise<unknown> => {
					const tracer = trace.getTracer('queueHandler')
					const options: SpanOptions = {
						attributes: {
							[SemanticAttributes.FAAS_TRIGGER]: 'rpc',
							'rpc.function.name': propertyKey,
						},
						kind: SpanKind.SERVER,
					}
					const promise = tracer.startActiveSpan(
						`RPC ${target.constructor.name}.${propertyKey}`,
						options,
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
