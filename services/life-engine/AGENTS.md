# Native Bend Game of Life

Read `bend --version` and the full `bend guide` before changing Bend source.
The build pins Bend 2.0.5 and Bun 1.3.14; no automatic compiler updates.

- `bend/life.bend` owns all simulation rules and generation updates.
- Preserve `LAWS.bend`; prove requirements in `PROOF.bend`. Run the proof gate after changes.
- `npm run build` checks proofs and compiles the native worker; `npm test` checks JS/native parity and transport behavior.
- `@unsafe` is restricted to the IO service loop. Do not bypass termination checking in the simulation or proofs.
- Parallel calls must divide independent, balanced work.
- Browser code and the Node bridge only encode, transport and draw boards. Do not duplicate the simulation there.
- Protocol 1: 64 × 64 wrapping binary board, 1–100 generations per request. Treat the browser as untrusted.
- Bound inputs, CPU threads, concurrency, and request duration. Keep the engine private; use the website's fixed proxy.
- Runtime jobs are stateless; restarting the service must not lose a browser's board.
