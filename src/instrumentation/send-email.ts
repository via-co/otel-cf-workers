import { Exception, SpanKind, type SpanOptions, trace } from '@opentelemetry/api'
import { unwrap, wrap } from '../wrap.js'

type SendArg = Parameters<SendEmail['send']>[0]
type EmailBuilder = Exclude<SendArg, EmailMessage>

const isEmailBuilder = (message: SendArg): message is EmailBuilder => {
	return typeof (message as EmailBuilder)?.subject === 'string'
}

const maskEmail = (email: string): string => {
	const atIndex = email.lastIndexOf('@')
	if (atIndex <= 0) return '***'
	const local = email.slice(0, atIndex)
	const domain = email.slice(atIndex + 1)
	const maskedLocal = local.length <= 2 ? `${local[0]}***` : `${local.slice(0, 2)}***${local.slice(-1)}`
	return `${maskedLocal}@${domain}`
}

const addressToString = (address: string | EmailAddress | (string | EmailAddress)[]): string => {
	if (Array.isArray(address)) {
		return address.map(addressToString).join(', ')
	}
	return maskEmail(typeof address === 'string' ? address : address.email)
}

const instrumentEmailServiceSendFn = (fn: SendEmail['send'], name: string): SendEmail['send'] => {
	const tracer = trace.getTracer('sendEmail')
	const handler: ProxyHandler<SendEmail['send']> = {
		apply: (target, thisArg, argArray) => {
			const [message] = argArray as [SendArg]
			const options: SpanOptions = {
				kind: SpanKind.PRODUCER,
				attributes: {
					binding_type: 'SendEmail',
					'email.from': addressToString(message.from),
					'email.to': addressToString(message.to),
				},
			}
			if (isEmailBuilder(message)) {
				const attrs = options.attributes!
				attrs['email.subject'] = message.subject
				if (message.cc) attrs['email.cc'] = addressToString(message.cc)
				if (message.bcc) attrs['email.bcc'] = addressToString(message.bcc)
				if (message.replyTo) attrs['email.reply_to'] = addressToString(message.replyTo)
			}
			return tracer.startActiveSpan(`PRODUCER ${name}.send`, options, async (span) => {
				try {
					const result = (await Reflect.apply(target, unwrap(thisArg), argArray)) as EmailSendResult
					if (result?.messageId) {
						span.setAttribute('email.message_id', result.messageId)
					}
					return result
				} catch (error) {
					span.recordException(error as Exception)
					throw error
				} finally {
					span.end()
				}
			})
		},
	}
	return wrap(fn, handler)
}

export function instrumentEmailServiceSend(sendEmail: SendEmail, name: string): SendEmail {
	const sendEmailHandler: ProxyHandler<SendEmail> = {
		get: (target, prop) => {
			if (prop === 'send') {
				const sendFn = Reflect.get(target, prop)
				return instrumentEmailServiceSendFn(sendFn, name)
			}
			return Reflect.get(target, prop)
		},
	}
	return wrap(sendEmail, sendEmailHandler)
}
