# matterjs-server answers from the sources

Not recorded: a small network written after matterjs-server's wire format, until recordings from a
real server (`bun run record`) sit in `../recordings/`. `network.json` holds the `start_listening`
answer (`nodes`) and the `get_thread_border_routers` answer (`borderRouters`).

The shapes follow `packages/ws-client/src/models/node.ts` (`MatterNodeData`), the attribute paths and
struct field ids the matter.js model (`packages/model/src/standard/elements/*.element.ts`), and
`packages/ws-client/src/topology/topology-utils.ts`, which reads the same attributes: extended
addresses in the neighbor table as uint64 (unquoted numbers above 2^53), hardware addresses and
BSSIDs as base64.

The network: an Apple TV as border router that is no node of this controller; an Eve Energy
(router) and a Nanoleaf bulb (router) that hear it; an Eve Door (sleepy, long idle time) under the
Eve Energy, which also has a child of another controller; a Meross plug on Wi-Fi; and a Hue bridge
on Ethernet, which Funkloch leaves out.
