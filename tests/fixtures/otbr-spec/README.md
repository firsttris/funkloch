# OTBR answers from the specification

Not recorded: these are the examples from ot-br-posix `src/rest/openapi.yaml` (devices,
diagnostics, energy scan), extended to a small network. They test the Thread adapter until
recordings from a real border router (`bun run record`) sit in `../recordings/`.

Where the border router's source differs from the specification, the source decides: the network
diagnostic items are of type `networkDiagnostics` (`src/rest/rest_diagnostics_coll.hpp`), and the
fake refuses tasks without their required attributes (`src/rest/actions/*.cpp` `Validate`).
