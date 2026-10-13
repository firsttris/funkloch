import pino from 'pino'

export type Log = pino.Logger

export const createLog = (level: string) => pino({ level, base: { app: 'funkloch' } })
