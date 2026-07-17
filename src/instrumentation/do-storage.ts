import { Attributes, SpanKind, SpanOptions, SpanStatusCode, trace } from '@opentelemetry/api'
import { ATTR_DB_OPERATION_NAME, ATTR_DB_QUERY_TEXT, ATTR_DB_SYSTEM_NAME } from '@opentelemetry/semantic-conventions'
import { passthroughGet, wrap } from '../wrap.js'
import { Overloads } from './common.js'

type ExtraAttributeFn = (argArray: any[], result: any) => Attributes

const dbSystem = 'Cloudflare DO'

type DurableObjectCommonOptions = Pick<DurableObjectPutOptions, 'allowConcurrency' | 'allowUnconfirmed' | 'noCache'>
function isDurableObjectCommonOptions(options: any): options is DurableObjectCommonOptions {
	return (
		typeof options === 'object' &&
		('allowConcurrency' in options || 'allowUnconfirmed' in options || 'noCache' in options)
	)
}

/** Applies attributes for common Durable Objects options:
 * `allowConcurrency`, `allowUnconfirmed`, and `noCache`
 */
function applyOptionsAttributes(attrs: Attributes, options: DurableObjectCommonOptions) {
	if ('allowConcurrency' in options) {
		attrs['db.cf.do.allow_concurrency'] = options.allowConcurrency
	}
	if ('allowUnconfirmed' in options) {
		attrs['db.cf.do.allow_unconfirmed'] = options.allowUnconfirmed
	}
	if ('noCache' in options) {
		attrs['db.cf.do.no_cache'] = options.noCache
	}
}

const StorageAttributes: Record<string | symbol, ExtraAttributeFn> = {
	delete(argArray, result: Awaited<ReturnType<Overloads<DurableObjectStorage['delete']>>>) {
		const args = argArray as Parameters<Overloads<DurableObjectStorage['delete']>>
		let attrs: Attributes = {}
		if (Array.isArray(args[0])) {
			const keys = args[0]
			attrs = {
				// todo: Maybe set db.cf.do.keys to the whole array here?
				'db.cf.do.key': keys[0],
				'db.cf.do.number_of_keys': keys.length,
				'db.cf.do.keys_deleted': result,
			}
		} else {
			attrs = {
				'db.cf.do.key': args[0],
				'db.cf.do.success': result,
			}
		}
		if (args[1]) {
			applyOptionsAttributes(attrs, args[1])
		}
		return attrs
	},
	deleteAll(argArray) {
		const args = argArray as Parameters<Overloads<DurableObjectStorage['deleteAll']>>
		let attrs: Attributes = {}
		if (args[0]) {
			applyOptionsAttributes(attrs, args[0])
		}
		return attrs
	},
	get(argArray) {
		const args = argArray as Parameters<Overloads<DurableObjectStorage['get']>>
		let attrs: Attributes = {}
		if (Array.isArray(args[0])) {
			const keys = args[0]
			attrs = {
				// todo: Maybe set db.cf.do.keys to the whole array here?
				'db.cf.do.key': keys[0],
				'db.cf.do.number_of_keys': keys.length,
			}
		} else {
			attrs = {
				'db.cf.do.key': args[0],
			}
		}
		if (args[1]) {
			applyOptionsAttributes(attrs, args[1])
		}
		return attrs
	},
	list(argArray, result: Awaited<ReturnType<Overloads<DurableObjectStorage['list']>>>) {
		const args = argArray as Parameters<Overloads<DurableObjectStorage['list']>>
		const attrs: Attributes = {
			'db.cf.do.number_of_results': result.size,
		}
		if (args[0]) {
			const options = args[0]
			applyOptionsAttributes(attrs, options)
			if ('start' in options) {
				attrs['db.cf.do.start'] = options.start
			}
			if ('startAfter' in options) {
				attrs['db.cf.do.start_after'] = options.startAfter
			}
			if ('end' in options) {
				attrs['db.cf.do.end'] = options.end
			}
			if ('prefix' in options) {
				attrs['db.cf.do.prefix'] = options.prefix
			}
			if ('reverse' in options) {
				attrs['db.cf.do.reverse'] = options.reverse
			}
			if ('limit' in options) {
				attrs['db.cf.do.limit'] = options.limit
			}
		}
		return attrs
	},
	put(argArray) {
		const args = argArray as Parameters<Overloads<DurableObjectStorage['put']>>
		const attrs: Attributes = {}
		if (typeof args[0] === 'string') {
			attrs['db.cf.do.key'] = args[0]
			if (args[2]) {
				applyOptionsAttributes(attrs, args[2])
			}
		} else {
			const keys = Object.keys(args[0])
			// todo: Maybe set db.cf.do.keys to the whole array here?
			attrs['db.cf.do.key'] = keys[0]
			attrs['db.cf.do.number_of_keys'] = keys.length
			if (isDurableObjectCommonOptions(args[1])) {
				applyOptionsAttributes(attrs, args[1])
			}
		}
		return attrs
	},
	getAlarm(argArray) {
		const args = argArray as Parameters<Overloads<DurableObjectStorage['getAlarm']>>
		const attrs: Attributes = {}
		if (args[0]) {
			applyOptionsAttributes(attrs, args[0])
		}
		return attrs
	},
	setAlarm(argArray) {
		const args = argArray as Parameters<Overloads<DurableObjectStorage['setAlarm']>>
		const attrs: Attributes = {}
		if (args[0] instanceof Date) {
			attrs['db.cf.do.alarm_time'] = args[0].getTime()
		} else {
			attrs['db.cf.do.alarm_time'] = args[0]
		}
		if (args[1]) {
			applyOptionsAttributes(attrs, args[1])
		}
		return attrs
	},
	deleteAlarm(argArray) {
		const args = argArray as Parameters<Overloads<DurableObjectStorage['deleteAlarm']>>
		const attrs: Attributes = {}
		if (args[0]) {
			applyOptionsAttributes(attrs, args[0])
		}
		return attrs
	},
}

function instrumentStorageFn(fn: Function, operation: string) {
	const tracer = trace.getTracer('do_storage')
	const fnHandler: ProxyHandler<any> = {
		apply: (target, thisArg, argArray) => {
			const attributes = {
				[ATTR_DB_SYSTEM_NAME]: dbSystem,
				[ATTR_DB_OPERATION_NAME]: operation,
				[ATTR_DB_QUERY_TEXT]: `${operation} ${argArray[0]}`,
			}
			const options: SpanOptions = {
				kind: SpanKind.CLIENT,
				attributes: {
					...attributes,
					operation,
				},
			}
			return tracer.startActiveSpan(`Durable Object Storage ${operation}`, options, async (span) => {
				const result = await Reflect.apply(target, thisArg, argArray)
				const extraAttrsFn = StorageAttributes[operation]
				const extraAttrs = extraAttrsFn ? extraAttrsFn(argArray, result) : {}
				span.setAttributes(extraAttrs)
				span.setAttribute('db.cf.do.has_result', !!result)
				span.end()
				return result
			})
		},
	}
	return wrap(fn, fnHandler)
}

/** Extracts the SQL verb (SELECT/INSERT/UPDATE/DELETE) for the `db.operation.name` attribute. */
function sqlOperation(query: string): string | undefined {
	return query.match(/\b(SELECT|INSERT|UPDATE|DELETE)\b/i)?.[1]?.toUpperCase()
}

/** Extracts the target table: `UPDATE <t>`, `INSERT INTO <t>`, `DELETE FROM <t>`, `SELECT … FROM <t>`. */
function sqlTable(query: string, verb: string): string | undefined {
	const regex = verb === 'UPDATE' ? /\bUPDATE\s+["`']?(?<table>\w+)/i : /\b(?:FROM|INTO)\s+["`']?(?<table>\w+)/i
	return query.match(regex)?.groups?.['table']
}

/** Derives `db.<verb>.<table>` (e.g. `db.insert.hello_pings`) from a statement, or `undefined`. */
function sqlSpanName(query: string): string | undefined {
	const verb = sqlOperation(query)
	if (!verb) {
		return undefined
	}
	const table = sqlTable(query, verb)
	return table ? `db.${verb.toLowerCase()}.${table.toLowerCase()}` : undefined
}

/**
 * Wraps `SqlStorage.exec` so each statement runs inside a CLIENT span carrying the statement text,
 * operation, args, and wall-clock duration. Unlike the KV-style storage methods (which are proxied by
 * `instrumentStorageFn`), `sql.exec` is reached via a property get on the `sql` sub-object, so it needs
 * its own wrapper — this is the call `drizzle-orm/durable-sqlite` issues for every query.
 */
function instrumentSqlExec(exec: SqlStorage['exec'], rawSql: SqlStorage): SqlStorage['exec'] {
	const tracer = trace.getTracer('do_storage')
	return ((query: string, ...params: unknown[]) => {
		// Only trace when there is a recording span in context. Statements executed during DO
		// construction (e.g. migrations run inside blockConcurrencyWhile) have no active span and would
		// otherwise emit parentless spans. Remove this guard to trace every statement unconditionally.
		const active = trace.getActiveSpan()
		if (!active || !active.isRecording()) {
			return exec.call(rawSql, query, ...params)
		}

		const options: SpanOptions = {
			kind: SpanKind.CLIENT,
			attributes: {
				[ATTR_DB_SYSTEM_NAME]: dbSystem,
				[ATTR_DB_OPERATION_NAME]: sqlOperation(query),
				[ATTR_DB_QUERY_TEXT]: query,
				'db.statement.args': JSON.stringify(params),
			},
		}
		return tracer.startActiveSpan(`Durable Object Storage ${sqlSpanName(query) ?? 'sql'}`, options, (span) => {
			try {
				return exec.call(rawSql, query, ...params)
			} catch (error) {
				span.recordException(error as Error)
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: error instanceof Error ? error.message : String(error),
				})
				throw error
			} finally {
				span.end()
			}
		})
	}) as SqlStorage['exec']
}

function instrumentSql(sql: SqlStorage): SqlStorage {
	const sqlHandler: ProxyHandler<SqlStorage> = {
		get: (target, prop) => {
			if (prop === 'exec') {
				return instrumentSqlExec(target.exec, target)
			}
			return passthroughGet(target, prop)
		},
	}
	return wrap(sql, sqlHandler)
}

export function instrumentStorage(storage: DurableObjectStorage): DurableObjectStorage {
	const storageHandler: ProxyHandler<DurableObjectStorage> = {
		get: (target, prop, receiver) => {
			// The `sql` sub-API is an object, not a method: instrument its `exec` rather than treating it
			// as a callable like the KV-style storage methods below.
			if (prop === 'sql') {
				return instrumentSql(Reflect.get(target, prop, receiver) as SqlStorage)
			}
			const operation = String(prop)
			const fn = Reflect.get(target, prop, receiver)
			return instrumentStorageFn(fn, operation)
		},
	}
	return wrap(storage, storageHandler)
}
