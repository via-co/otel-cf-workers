import { isProxyable, wrap } from '../wrap.js'
import { instrumentKV } from './kv.js'
import { instrumentQueueSender } from './queue.js'
import { instrumentServiceBinding } from './service.js'
import { instrumentD1 } from './d1'
import { instrumentAnalyticsEngineDataset } from './analytics-engine.js'
import { instrumentVectorize } from './vectorize.js'
import { instrumentEmailServiceSend } from './send-email.js'

const isJSRPC = (item?: unknown): item is Service => {
	// @ts-expect-error The point of RPC types is to block non-existent properties, but that's the goal here
	return !!(item as Service)?.['__some_property_that_will_never_exist' + Math.random()]
}

const isKVNamespace = (item?: unknown): item is KVNamespace => {
	return !isJSRPC(item) && !!(item as KVNamespace)?.getWithMetadata
}

const isQueue = (item?: unknown): item is Queue<unknown> => {
	return !isJSRPC(item) && !!(item as Queue<unknown>)?.sendBatch
}

export const isVersionMetadata = (item?: unknown): item is WorkerVersionMetadata => {
	return (
		!isJSRPC(item) &&
		typeof (item as WorkerVersionMetadata)?.id === 'string' &&
		typeof (item as WorkerVersionMetadata)?.tag === 'string'
	)
}

const isAnalyticsEngineDataset = (item?: unknown): item is AnalyticsEngineDataset => {
	return !isJSRPC(item) && !!(item as AnalyticsEngineDataset)?.writeDataPoint
}

const isD1Database = (item?: unknown): item is D1Database => {
	return !!(item as D1Database)?.exec && !!(item as D1Database)?.prepare
}

const isVectorize = (item?: unknown): item is Vectorize => {
	return !!(item as Vectorize)?.upsert && !!(item as Vectorize)?.getByIds
}

const isSendEmail = (item?: unknown): item is SendEmail => {
	return !isJSRPC(item) && !isQueue(item) && typeof (item as SendEmail)?.send === 'function'
}

const instrumentEnv = (env: Record<string, unknown>): Record<string, unknown> => {
	const envHandler: ProxyHandler<Record<string, unknown>> = {
		get: (target, prop, receiver) => {
			const item = Reflect.get(target, prop, receiver)
			if (!isProxyable(item)) {
				return item
			}
			if (isJSRPC(item)) {
				return instrumentServiceBinding(item, String(prop))
			} else if (isKVNamespace(item)) {
				return instrumentKV(item, String(prop))
			} else if (isQueue(item)) {
				return instrumentQueueSender(item, String(prop))
			} else if (isVersionMetadata(item)) {
				// we do not need to log accesses to the metadata
				return item
			} else if (isAnalyticsEngineDataset(item)) {
				return instrumentAnalyticsEngineDataset(item, String(prop))
			} else if (isD1Database(item)) {
				return instrumentD1(item, String(prop))
			} else if (isVectorize(item)) {
				return instrumentVectorize(item, String(prop))
			} else if (isSendEmail(item)) {
				return instrumentEmailServiceSend(item, String(prop))
			} else {
				return item
			}
		},
	}
	return wrap(env, envHandler)
}

export { instrumentEnv }
