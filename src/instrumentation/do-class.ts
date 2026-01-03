import { Initialiser, setConfig } from '../config'
import {
	Attributes,
	propagation,
	context as api_context,
	trace,
	SpanOptions,
	SpanKind,
	Exception,
	Span,
	SpanStatusCode,
} from '@opentelemetry/api'
import { instrumentEnv } from './env'
import { exportSpans, proxyExecutionContext } from './common'
import { getParentContextFromMetadata } from './entrypoint'
import { SemanticAttributes } from '@opentelemetry/semantic-conventions'
import { ResolvedTraceConfig } from '../types'
import { instrumentState } from './do'
import { DurableObject } from 'cloudflare:workers'

const traceIdSymbol = Symbol('traceId')

class Logger {
	private rootSpan: Span | undefined
	constructor() {
		this.rootSpan = trace.getActiveSpan()
	}
	exception(err: Error, msg?: string): void {
		const span = this.rootSpan ?? trace.getActiveSpan()
		if (span) {
			span?.recordException(err)
			span.setStatus({ code: SpanStatusCode.ERROR, message: msg })
		} else {
			console.error(msg ?? 'General error', err)
		}
	}
	log(attributes: Attributes): void {
		const span = this.rootSpan ?? trace.getActiveSpan()
		span?.addEvent('log', attributes)
	}
	addProperties(attributes: Attributes): void {
		const span = this.rootSpan ?? trace.getActiveSpan()
		span?.setAttributes(attributes)
	}
}

export abstract class InstrumentedDurableObject<Env extends Record<string, unknown>> extends DurableObject<Env> {
	private _metadata: Record<string, unknown> = {}
	private _logger: Logger
	private _instrumentedCtx: DurableObjectState
	protected _instrumentedEnv: Env

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		this._instrumentedCtx = instrumentState(ctx)
		// @ts-expect-error we just need binding
		this._instrumentedEnv = instrumentEnv(env)
		this._logger = new Logger()
	}

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
		await stub._setOpts(metadata)
		return stub
	}

	protected _getCurrentTraceContext(): Record<string, unknown> {
		const metadata: Record<string, unknown> = {}
		propagation.inject(api_context.active(), metadata, {
			set: (h, k, v) => (h[k] = typeof v === 'string' ? v : String(v)),
		})
		return metadata
	}

	protected get logger() {
		return this._logger
	}

	protected get metadata() {
		return this._metadata
	}

	private set metadata(metadata) {
		this._metadata = metadata
	}

	protected get storage() {
		return this._instrumentedCtx.storage
	}

	async _setOpts(metadata: Record<string, unknown>): Promise<void> {
		if (!this._metadata || Object.keys(this._metadata).length === 0) {
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
			if (propertyKey.startsWith('_')) {
				return await original.apply(originalRef, args)
			}
			const orig_env = originalRef['env']
			const orig_ctx = originalRef['ctx']
			const config = initialiser(orig_env as Record<string, unknown>, this)
			const { tracker } = proxyExecutionContext(orig_ctx)
			const context = setConfig(config)

			try {
				const metadata = originalRef['metadata']
				originalRef['metadata'] = undefined
				const executeEntrypointHandler = (): Promise<unknown> => {
					if (propertyKey.startsWith('_')) {
						if (!!metadata) {
							originalRef['_logger']['rootSpan'] = trace.getActiveSpan()
						}
						return original.apply(originalRef, args)
					}
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
							if (!!metadata) {
								originalRef['_logger']['rootSpan'] = span
							}
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
