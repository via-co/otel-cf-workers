import {
	SpanKind,
	SpanOptions,
	trace,
	context as api_context,
	Exception,
	propagation,
	Context,
} from '@opentelemetry/api'
import { Initialiser, setConfig } from '../config'
import { exportSpans, proxyExecutionContext } from './common'
import { instrumentEnv } from './env'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { WorkerEntrypoint } from 'cloudflare:workers'
import { instrumentClientFetch } from './fetch'
import { ResolvedTraceConfig } from '../types'

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

export function getParentContextFromMetadata(metadata: Record<string, string | string[] | undefined>): Context {
	return propagation.extract<Record<string, unknown>>(api_context.active(), metadata, {
		get(headers, key) {
			const value = headers[key] || undefined
			if (Array.isArray(value)) {
				return value as string[]
			}
			return value as string
		},
		keys(data) {
			return [...Object.keys(data)]
		},
	})
}

function getParentContextFromEntrypoint(
	workerConfig: ResolvedTraceConfig | undefined,
	request: Record<string, unknown>,
) {
	if (workerConfig === undefined) {
		return api_context.active()
	}

	const acceptTraceContext = workerConfig.handlers.fetch.acceptTraceContext ?? true
	return acceptTraceContext && !!request
		? getParentContextFromMetadata((request['metadata'] as Record<string, string | string[] | undefined>) ?? {})
		: api_context.active()
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
			const request = args?.length > 0 ? (args[0] as Record<string, unknown>) : {}
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
					const spanContext = getParentContextFromEntrypoint(config, request)
					const tracer = trace.getTracer('rpcHandler')
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
