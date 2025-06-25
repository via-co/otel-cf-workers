import { trace, SpanKind, Attributes, Span, propagation, context as api_context } from '@opentelemetry/api'
import { unwrap, wrap } from '../wrap.js'
import { HandlerInstrumentation, InitialSpanInfo, OrPromise } from '../types.js'
import { ATTR_FAAS_TRIGGER, FAAS_TRIGGER_VALUE_PUBSUB } from '@opentelemetry/semantic-conventions/incubating'

type QueueHandler = ExportedHandlerQueueHandler<unknown, unknown>
export type QueueHandlerArgs = Parameters<QueueHandler>

class MessageStatusCount {
	succeeded = 0
	failed = 0
	implicitly_acked = 0
	implicitly_retried = 0
	readonly total: number

	constructor(total: number) {
		this.total = total
	}

	ack() {
		this.succeeded = this.succeeded + 1
	}

	ackRemaining() {
		this.implicitly_acked = this.total - this.succeeded - this.failed
		this.succeeded = this.total - this.failed
	}

	retry() {
		this.failed = this.failed + 1
	}

	retryRemaining() {
		this.implicitly_retried = this.total - this.succeeded - this.failed
		this.failed = this.total - this.succeeded
	}

	toAttributes(): Attributes {
		return {
			'queue.messages_count': this.total,
			'queue.messages_success': this.succeeded,
			'queue.messages_failed': this.failed,
			'queue.batch_success': this.succeeded === this.total,
			'queue.implicitly_acked': this.implicitly_acked,
			'queue.implicitly_retried': this.implicitly_retried,
		}
	}
}

const addEvent = (name: string, msg?: Message) => {
	const attrs: Attributes = {}
	if (msg) {
		attrs['queue.message_id'] = msg.id
		attrs['queue.message_timestamp'] = msg.timestamp.toISOString()
	}
	trace.getActiveSpan()?.addEvent(name, attrs)
}

const proxyQueueMessage = <Q>(msg: Message<Q>, count: MessageStatusCount): Message<Q> => {
	const msgHandler: ProxyHandler<Message<Q>> = {
		get: (target, prop) => {
			if (prop === 'ack') {
				const ackFn = Reflect.get(target, prop)
				return new Proxy(ackFn, {
					apply: (fnTarget) => {
						addEvent('messageAck', msg)
						count.ack()

						//TODO: handle errors
						Reflect.apply(fnTarget, msg, [])
					},
				})
			} else if (prop === 'retry') {
				const retryFn = Reflect.get(target, prop)
				return new Proxy(retryFn, {
					apply: (fnTarget) => {
						addEvent('messageRetry', msg)
						count.retry()
						//TODO: handle errors
						const result = Reflect.apply(fnTarget, msg, [])
						return result
					},
				})
			} else {
				return Reflect.get(target, prop, msg)
			}
		},
	}
	return wrap(msg, msgHandler)
}

const proxyMessageBatch = (batch: MessageBatch, count: MessageStatusCount) => {
	const batchHandler: ProxyHandler<MessageBatch> = {
		get: (target, prop) => {
			if (prop === 'messages') {
				const messages = Reflect.get(target, prop)
				const messagesHandler: ProxyHandler<MessageBatch['messages']> = {
					get: (target, prop) => {
						if (typeof prop === 'string' && !isNaN(parseInt(prop))) {
							const message = Reflect.get(target, prop)
							return proxyQueueMessage(message, count)
						} else {
							return Reflect.get(target, prop)
						}
					},
				}
				return wrap(messages, messagesHandler)
			} else if (prop === 'ackAll') {
				const ackFn = Reflect.get(target, prop)
				return new Proxy(ackFn, {
					apply: (fnTarget) => {
						addEvent('ackAll')
						count.ackRemaining()
						//TODO: handle errors
						Reflect.apply(fnTarget, batch, [])
					},
				})
			} else if (prop === 'retryAll') {
				const retryFn = Reflect.get(target, prop)
				return new Proxy(retryFn, {
					apply: (fnTarget) => {
						addEvent('retryAll')
						count.retryRemaining()
						//TODO: handle errors
						Reflect.apply(fnTarget, batch, [])
					},
				})
			}

			return Reflect.get(target, prop)
		},
	}
	return wrap(batch, batchHandler)
}

export class QueueInstrumentation implements HandlerInstrumentation<MessageBatch, OrPromise<void>> {
	private count?: MessageStatusCount

	getInitialSpanInfo(batch: MessageBatch): InitialSpanInfo {
		return {
			name: `queueHandler ${batch.queue}`,
			options: {
				attributes: {
					[ATTR_FAAS_TRIGGER]: FAAS_TRIGGER_VALUE_PUBSUB,
					'queue.name': batch.queue,
				},
				kind: SpanKind.CONSUMER,
			},
		}
	}

	instrumentTrigger(batch: MessageBatch): MessageBatch {
		this.count = new MessageStatusCount(batch.messages.length)
		return proxyMessageBatch(batch, this.count)
	}

	executionSucces(span: Span) {
		if (this.count) {
			this.count.ackRemaining()
			span.setAttributes(this.count.toAttributes())
		}
	}

	executionFailed(span: Span) {
		if (this.count) {
			this.count.retryRemaining()
			span.setAttributes(this.count.toAttributes())
		}
	}
}

type SimpleQueueRequest = {
	metadata: Record<string, string>
}

function propagateContext(argArray: unknown[]) {
	const shouldPropagate = argArray?.length > 0 && typeof argArray[0] === 'object'

	const request = shouldPropagate ? (argArray[0] as SimpleQueueRequest) : undefined
	if (request) {
		request.metadata = request.metadata ? request.metadata : {}
	}
	if (request) {
		propagation.inject(api_context.active(), request.metadata, {
			set: (h, k, v) => (h[k] = typeof v === 'string' ? v : String(v)),
		})
	}
}

function instrumentQueueSend(fn: Queue<unknown>['send'], name: string): Queue<unknown>['send'] {
	const tracer = trace.getTracer('queueSender')
	const handler: ProxyHandler<Queue<unknown>['send']> = {
		apply: (target, thisArg, argArray) => {
			return tracer.startActiveSpan(`PRODUCER ${name}.send`, async (span) => {
				propagateContext(argArray)
				span.setAttribute('queue.operation', 'send')
				await Reflect.apply(target, unwrap(thisArg), argArray)
				span.end()
			})
		},
	}
	return wrap(fn, handler)
}

function instrumentQueueSendBatch(fn: Queue<unknown>['sendBatch'], name: string): Queue<unknown>['sendBatch'] {
	const tracer = trace.getTracer('queueSender')
	const handler: ProxyHandler<Queue<unknown>['sendBatch']> = {
		apply: (target, thisArg, argArray) => {
			return tracer.startActiveSpan(`PRODUCER ${name}.sendBatch`, async (span) => {
				span.setAttribute('queue.operation', 'sendBatch')
				await Reflect.apply(target, unwrap(thisArg), argArray)
				span.end()
			})
		},
	}
	return wrap(fn, handler)
}

export function instrumentQueueSender(queue: Queue<unknown>, name: string) {
	const queueHandler: ProxyHandler<Queue<unknown>> = {
		get: (target, prop) => {
			if (prop === 'send') {
				const sendFn = Reflect.get(target, prop)
				return instrumentQueueSend(sendFn, name)
			} else if (prop === 'sendBatch') {
				const sendFn = Reflect.get(target, prop)
				return instrumentQueueSendBatch(sendFn, name)
			} else {
				return Reflect.get(target, prop)
			}
		},
	}
	return wrap(queue, queueHandler)
}
