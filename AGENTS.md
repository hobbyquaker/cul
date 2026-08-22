# Agent instructions — cul

## What this is

`cul` is a thin Node.js abstraction over the serial/telnet connection to a Busware CUL / COC / SCC /
CUNO running [culfw](http://culfw.de), plus parsers and command builders for the RF protocols culfw
speaks (FS20, FHT, EM, HMS, WS/S300, ESA, MORITZ/MAX!, TX, UNIRoll). It is a **library**, not an
application: no state machines, no device database, no persistence. Consumers such as
[cul2mqtt](https://github.com/hobbyquaker/cul2mqtt) (`../cul2mqtt` when checked out next to this
repo) own all of that.

## Public API

The constructor options, `write()` / `cmd()` / `close()` / `parse()`, the `ready` / `data` / `close`
/ `error` events **and the shape of the parsed message objects** (`protocol`, `address`, `device`,
`rssi`, `data.*`). Downstream projects build MQTT topics out of `protocol`/`address`/field names, so
renaming a `data` field is a breaking change. Check [ROADMAP.md](ROADMAP.md) before changing output;
breaking changes are collected for 1.0.0, not shipped piecemeal.

## Code layout (CommonJS, node >= 18)

- `cul.js` — connection handling (serialport / `node:net`), option defaults, `cmd()` dispatch.
- `lib/parse.js` — message dispatcher: RSSI stripping, prefix → protocol module. Usable standalone.
- `lib/<protocol>.js` — one module per protocol, each exporting `parse(raw)` and/or `cmd(...)`.
  `raw` arrives **without** the trailing RSSI byte, so message length is meaningful.
- `test/*.test.js` — `node:test`, run with `npm test`.

## Style & practices

- Plain JavaScript, CommonJS, 4-space indent, eslint + prettier (`npm run lint`, `npm run lintfix`).
  Let a failing lint stop you.
- `lib/fht.js` and `lib/moritz.js` are legacy: tabs, `var`, upstream-shaped. They are in
  `.prettierignore` and have relaxed eslint rules **on purpose** — a reformat would bury the
  remaining bugs. Do not reformat them; rewrite them with tests (1.0.0) or leave them alone.
- Run commands through WSL (Debian), not PowerShell: `wsl -d Debian -- bash -lc '<cmd>'`. The repo
  lives at `~/repos/cul` inside WSL.
- No new runtime dependencies. This runs on a Raspberry Pi next to the CUL.

## Adding a protocol

1. Find the FHEM module at <https://svn.fhem.de/trac/browser/trunk/fhem/FHEM> — it is the reference
   implementation (GPLv2, same licence as this project). `00_CUL.pm` holds the `matchList` that maps
   culfw prefixes to modules, and the reformatting each module expects. Note that FHEM parsers often
   see a **rewritten** message (`810e04...` style), not the raw culfw line — map the offsets back.
2. Add `lib/<name>.js` exporting `parse(raw)` and/or `cmd(...)`, register it in `lib/parse.js`
   (`protocol` map and, if the prefix is new, `commands`).
3. Add tests with real or hand-derived messages, and document the byte layout in a header comment.
4. Update the coverage tables in README.md and ROADMAP.md, and add a CHANGELOG entry.

## Releasing

Semver. Bump `version` in package.json, add the CHANGELOG section, commit, tag `vX.Y.Z`, push the
tag — `.github/workflows/release.yml` runs lint + tests, publishes to npm with provenance, and
creates the GitHub release from `.github/release-notes.mjs` (CHANGELOG section + grouped commits).

## Known weak spots

- `serialport ^9` has no prebuilds for current Node and is compiled from source on install. CI works
  around this with `npm ci --ignore-scripts`; 1.0.0 moves to serialport 13.
- No reconnect. Consumers implement it themselves. The telnet watchdog only emits `error`.
- `lib/moritz.js` keeps a module-level `seen_devices` map shared across all `Cul` instances.
- Several parsers are unverified against real hardware — the README table marks what is tested.
