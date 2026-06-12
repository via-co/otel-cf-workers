import { SpanKind, SpanOptions, trace } from '@opentelemetry/api'
import { ATTR_DB_NAMESPACE, ATTR_DB_OPERATION_NAME, ATTR_DB_SYSTEM_NAME } from '@opentelemetry/semantic-conventions'
import { wrap } from '../wrap'

export function instrumentVectorize(v: Vectorize, name: string): Vectorize {
	const vectorHandler: ProxyHandler<Vectorize> = {
		get: (target, prop, receiver) => {
			const operation = String(prop)
			const fn = Reflect.get(target, prop, receiver)
			return instrumentVectorizeFn(fn, name, operation)
		},
	}
	return wrap(v, vectorHandler)
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function instrumentVectorizeFn(fn: Function, name: string, operation: string) {
	const tracer = trace.getTracer('Vectorize')
	const fnHandler: ProxyHandler<object> = {
		apply: (target, thisArg, argArray) => {
			const attributes = {
				binding_type: 'VectorDB',
				[ATTR_DB_NAMESPACE]: name,
				[ATTR_DB_SYSTEM_NAME]: 'vectorize',
				[ATTR_DB_OPERATION_NAME]: operation,
			}
			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes,
			}
			return tracer.startActiveSpan(`vector ${name} ${operation}`, options, async (span) => {
				// @ts-expect-error type checking
				const result = await Reflect.apply(target, thisArg, argArray)
				if (operation === 'deleteByIds') {
					span.setAttribute('db.cf.vectorize.ids', JSON.stringify(argArray[0]))
				} else if (operation === 'upsert') {
					const vectors: VectorizeVector[] = argArray[0]
					span.addEvent('log', {
						'db.vectorize.vectors': JSON.stringify(vectors?.map((v) => ({ id: v.id, metadata: v.metadata }))),
					})
				}
				span.end()
				return result
			})
		},
	}
	return wrap(fn, fnHandler)
}
