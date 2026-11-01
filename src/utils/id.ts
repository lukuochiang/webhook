import { randomToken } from './crypto'

/** Generate a unique endpoint id, e.g. ep_4f9a... */
export function generateEndpointId(): string {
  return `ep_${randomToken(12)}`
}

/** Generate a unique event id, e.g. evt_9c21... */
export function generateEventId(): string {
  return `evt_${randomToken(12)}`
}
