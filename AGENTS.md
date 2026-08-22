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
breaking changes are collected into one major release with a migration guide, never shipped
piecemeal — see [MIGRATION.md](MIGRATION.md) for how 1.0.0 did it.

Field naming is normalised across protocols since 1.0.0: `batteryLow` (boolean) plus `batteryState`,
`open` for contacts, `temperature` / `humidity` / `pressure`, camelCase everywhere. A new protocol
follows those names rather than whatever its FHEM module happens to call them.

## Code layout (ES modules, node >= 20.19)

- `index.js` — connection handling (serialport 13 / `node:net`), reconnect, the promise API, option
  defaults and validation, `cmd()` dispatch. `index.d.ts` holds the typings, `types-test/` type
  checks them with `tsc --noEmit`.
- `lib/parse.js` — message dispatcher: RSSI stripping, prefix → protocol module. Usable standalone
  and re-exported from `index.js`.
- `lib/<protocol>.js` — one module per protocol, each exporting `parse(raw)` and/or `cmd(...)`.
  `raw` arrives **without** the trailing RSSI byte, so message length is meaningful. `cmd()` may
  return an array when a protocol needs several messages (FHT sets the central code first).
- `test/*.test.js` — `node:test`, run with `npm test`. `transport.test.js` drives both transports:
  a local `net` server for telnet, `SerialPortMock.binding` for serial.

## Style & practices

- Plain JavaScript, ES modules, 4-space indent, eslint + prettier (`npm run lint`, `npm run
lintfix`). Let a failing lint stop you. Nothing is excluded from either any more.
- Run commands through WSL (Debian), not PowerShell: `wsl -d Debian -- bash -lc '<cmd>'`. The repo
  lives at `~/repos/cul` inside WSL.
- No new runtime dependencies beyond serialport. This runs on a Raspberry Pi next to the CUL.

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

**Push tags one at a time.** GitHub does not run push-triggered workflows at all when more than
three tags arrive in one push, so a batch of tags silently produces no releases. If that happens,
create the missing GitHub releases with `gh release create <tag> --notes-file <(node
.github/release-notes.mjs <tag>)` — do _not_ re-run the release workflow for an old tag, because
`npm publish` would move the `latest` dist-tag backwards. Afterwards check `gh release list` and fix
the "Latest" marker with `gh release edit <newest> --latest` if needed.

## Known weak spots

- MAX! send is not implemented: `PairPing` is parsed but never answered with a `PairPong`, so
  thermostats cannot be paired (#18), and link partners cannot be sent (#31). Tracked for 1.1.0.
- Stacked CUNs (#28) need a routing layer above the parser, not a parser change.
- `lib/moritz.js` keeps a module-level `seen_devices` map shared across all `Cul` instances.
- Several parsers are unverified against real hardware — the README table marks what is tested.
