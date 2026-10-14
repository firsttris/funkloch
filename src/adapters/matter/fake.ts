// A stand-in for matterjs-server for the tests: answers the commands Funkloch sends from a node
// list, in the wire format (bigint as unquoted numbers), and can push events or drop the line.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Socket } from './client'
import { parseWire, stringifyWire } from './wire'

type Node = { node_id: number | bigint; available: boolean; attributes: Record<string, unknown> }

export const SPEC_NETWORK = join(import.meta.dirname, '../../../tests/fixtures/matter-spec')

/** The network from tests/fixtures/matter-spec/network.json */
export const specNetwork = () =>
  parseWire(readFileSync(join(SPEC_NETWORK, 'network.json'), 'utf8')) as {
    nodes: Node[]
    borderRouters: unknown[]
  }

export const createFakeMatterServer = (
  options: { nodes?: Node[]; borderRouters?: unknown[]; schemaVersion?: number } = {},
) => {
  const spec = specNetwork()
  const nodes = structuredClone(options.nodes ?? spec.nodes)
  const borderRouters = options.borderRouters ?? spec.borderRouters
  const commands: { command: string; args: unknown }[] = []
  const sockets: Socket[] = []

  const deliver = (socket: Socket, message: unknown) =>
    setTimeout(() => socket.onmessage?.({ data: stringifyWire(message) }), 0)

  const answer = (command: string, args: Record<string, unknown> | undefined): unknown => {
    if (command === 'start_listening') return nodes
    if (command === 'get_thread_border_routers') return borderRouters
    if (command === 'read_attribute') {
      const node = nodes.find((n) => String(n.node_id) === String(args?.node_id))
      const paths = [args?.attribute_path].flat() as string[]
      return Object.fromEntries(paths.map((path) => [path, node?.attributes[path] ?? null]))
    }
    return null
  }

  const open = (_url: string): Socket => {
    const socket: Socket = {
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send: (data) => {
        const request = parseWire(data) as {
          message_id: string
          command: string
          args?: Record<string, unknown>
        }
        commands.push({ command: request.command, args: request.args })
        deliver(socket, {
          message_id: request.message_id,
          result: answer(request.command, request.args),
        })
      },
      close: () => setTimeout(() => socket.onclose?.(), 0),
    }
    sockets.push(socket)
    deliver(socket, {
      fabric_id: 1,
      compressed_fabric_id: 12249790986447749121n,
      schema_version: options.schemaVersion ?? 14,
      min_supported_schema_version: 11,
      sdk_version: 'matter-server/1.1.7 (matter.js/0.17.5)',
    })
    return socket
  }

  return {
    open,
    nodes,
    commands,
    /** Sends an event to every open connection */
    push: (event: string, data: unknown) => {
      for (const socket of sockets) deliver(socket, { event, data })
    },
    /** Closes every connection from the server's side */
    drop: () => {
      for (const socket of sockets.splice(0)) socket.onclose?.()
    },
    connections: () => sockets.length,
  }
}
