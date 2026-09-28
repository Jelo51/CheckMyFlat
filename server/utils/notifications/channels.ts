import { Resend } from 'resend'

/** Destinataire d'une notification, quel que soit le canal. */
export interface Recipient {
  email: string
  name?: string | null
  phone?: string | null
}

export interface OutgoingMessage {
  to: Recipient
  subject: string
  text: string
  html: string
  /** Clé d'idempotence (évite les doublons si un envoi est rejoué). */
  idempotencyKey?: string
}

/**
 * Un canal d'envoi. L'email est le seul en v1 ; un canal SMS implémentera la
 * même interface (en utilisant `to.phone`) sans toucher au métier.
 */
export interface Channel {
  readonly name: string
  send(message: OutgoingMessage): Promise<void>
}

class LogEmailChannel implements Channel {
  readonly name = 'email:log'
  async send(message: OutgoingMessage) {
    console.info(`[email] → ${message.to.email} · ${message.subject}\n${message.text}\n`)
  }
}

class ResendEmailChannel implements Channel {
  readonly name = 'email:resend'
  private readonly client: Resend
  constructor(
    apiKey: string,
    private readonly from: string,
  ) {
    this.client = new Resend(apiKey)
  }
  async send(message: OutgoingMessage) {
    const { error } = await this.client.emails.send(
      {
        from: this.from,
        to: message.to.name ? `${message.to.name} <${message.to.email}>` : message.to.email,
        subject: message.subject,
        text: message.text,
        html: message.html,
      },
      message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : undefined,
    )
    if (error) throw new Error(`Resend : ${error.message}`)
  }
}

let channels: Channel[] | null = null

export function getChannels(): Channel[] {
  if (channels) return channels
  const config = useRuntimeConfig()
  if (config.emailProvider === 'resend') {
    if (!config.resendApiKey || !config.emailFrom) {
      throw new Error('NUXT_RESEND_API_KEY et NUXT_EMAIL_FROM sont requis avec NUXT_EMAIL_PROVIDER=resend')
    }
    channels = [new ResendEmailChannel(config.resendApiKey, config.emailFrom)]
  } else {
    channels = [new LogEmailChannel()]
  }
  return channels
}
