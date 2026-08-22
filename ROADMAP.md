# Roadmap — cul

`cul` is the thin culfw abstraction under [cul2mqtt](https://github.com/hobbyquaker/cul2mqtt) and a
number of ioBroker/Node-RED integrations. It has two jobs: talk to a CUL/COC/SCC/CUNO, and turn the
culfw line protocol into plain objects. Everything here is ordered so that the first releases are
safe to take without touching consumer code.

Versioning is [semver](https://semver.org): the constructor options, the `write`/`cmd`/`close`
methods, the `ready`/`data`/`close`/`error` events and the **shape of the parsed message objects**
(`protocol`, `address`, `device`, `rssi`, `data.*`) are the public API. Renaming a `data` field or
changing an `address` format is a breaking change, because downstream projects build MQTT topics
from them.

---

## 0.18.0 — tooling and parser fixes (done)

No API changes. See [CHANGELOG.md](CHANGELOG.md) for the full list.

- eslint + prettier, `node:test`, GitHub Actions (CI + release with npm provenance), Travis and xo
  removed.
- RSSI is stripped before parsing, which is the prerequisite for telling protocols apart by message
  length.
- New parsers: FHT80 TF window sensors, LaCrosse TX2/TX3, HMS binary detectors, KS300/2, WS7000.
- Fixed: FS20 command table off-by-one and flag masking, FS20 extended timer, EM1000 current,
  S300TH detection, boolean options that could not be switched off, `Object.prototype` pollution.

## 0.19.0 — send support for the cheap 433 MHz world (done)

Additive only: new `cmd()` protocols, no changes to existing output. See
[CHANGELOG.md](CHANGELOG.md).

- Intertechno (`lib/it.js`): V1 tri-state with the A..P / FLS 100 rotary switch tables, V3
  pass-through, `it` clock and `isr` repetition.
- Somfy RTS (`lib/somfy.js`): `Ys` send with stateless rolling code / encryption key helpers, `Yt` /
  `Yr` settings, and receive.
- Hoermann (`lib/hoermann.js`): `R` receive and `hn` send.
- UNIRoll: validated `cmd()` and an echo `parse()`.

Left out on purpose: Intertechno V3 send is only a pass-through (building a V3 frame from an address,
group bit and unit needs the dim-level encoding of 10_IT.pm) and HomeEasy (`ish`/`ise`) is not
implemented.

## 0.20.0 — the rest of the receive side (done)

Additive: new `protocol` values appear in the `data` event, nothing existing changed. See
[CHANGELOG.md](CHANGELOG.md).

- CUL_TCM97001 (`lib/tcm97001.js`): ten decoders for the cheap 433 MHz sensor families, picked by
  length + checksum + fixed nibbles, with a plausibility gate so a wrong guess falls through to the
  next candidate.
- Revolt NC-5462 (`lib/revolt.js`).
- Intertechno receive: V1, EV1527 and V3.
- `{protocol, unknown: true}` for prefixes culfw uses but `cul` has no parser for.

Still open on the receive side, deliberately deferred:

- [ ] **Kopp Free Control** (`kr` prefix,
      [`10_KOPP_FC.pm`](https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/10_KOPP_FC.pm)). a-culfw
      only, and the module is 900 lines that are mostly a key code table - it needs hardware to
      verify, not more porting.
- [ ] **Ventus W044 / W132 / W174** wind and rain sensors, **PFR-130** rain gauge and **NX7674**
      inside CUL_TCM97001. They need bit-reversed nibbles and their own checksums; the decoder table
      in `lib/tcm97001.js` takes them as three more entries whenever someone has one to test with.
- [ ] **CUL_IR** (`I` prefix) for CUNO/CUNO2 infrared.
- [ ] **OBIS / smart meter** (`o` prefix). `commands.o` maps to `Obis`, but `00_CUL.pm` routes `^o+`
      to CUL_REDIRECT, not to `47_OBIS.pm` - the mapping needs checking against real hardware before
      a parser is worth writing. Such messages are reported as `unknown` since 0.20.0.
- [ ] **HMS address ambiguity**: the HMS address changes on every battery change. Document the FHEM
      `100<type>` wildcard convention so consumers can keep a stable device id.

## 0.21.0 — the useful parts of the open pull requests (done)

- `initTimeout` option, from [#35](https://github.com/hobbyquaker/cul/pull/35).
- `X` report parsing (`lib/culfw.js`), from [#33](https://github.com/hobbyquaker/cul/pull/33).
- Fixed the `AddLinkPartner` crash and the fractional week profile hour from
  [#34](https://github.com/hobbyquaker/cul/pull/34).

## 1.0.0 — the breaking release (done)

Every change that alters output or requirements, in one version, with
[MIGRATION.md](MIGRATION.md) as the before/after list.

- **serialport 13**, Node `^20.19 || ^22.12 || >=24`. Installing no longer compiles anything, which
  is what [#36](https://github.com/hobbyquaker/cul/issues/36) needed. CI verifies a plain install on
  Linux, macOS and Windows.
- **ESM** with `index.d.ts` typings and a type-level test, matching
  [lgtv2](https://github.com/hobbyquaker/lgtv2) 2.0.
- **Promise API** (`open`, `close`, `write`, `cmd`) with the callback form kept, and `AbortSignal`
  support.
- **Built-in reconnect** plus a `connected` property, so consumers can drop their own wrappers.
- **Normalised message fields**: `batteryLow` / `batteryState` everywhere, `WS` addresses as strings
  with the FHEM numbering, `open` for both window contact protocols, camelCase throughout.
- `V` is a `culfw` message instead of a MORITZ one; `mode` and `connectionMode` are validated.
- MAX! week profile control points report start times
  ([#34](https://github.com/hobbyquaker/cul/pull/34)).
- `lib/fht.js` and `lib/moritz.js` rewritten; no module is excluded from prettier or eslint any
  more.
- **Transport tests** ([#15](https://github.com/hobbyquaker/cul/issues/15)) for both the telnet and
  the serial path.

## 1.1.0 — MAX! and HomeMatic

This is the milestone most of the open issues are waiting for.

- [ ] **MORITZ (MAX!) send support** - `lib/moritz.js` has a `cmd()` skeleton; wall thermostat /
      radiator valve set-temperature and mode are what cul2mqtt is waiting for.
- [ ] **MAX! pairing** ([#18](https://github.com/hobbyquaker/cul/issues/18)). `PairPing` is parsed,
      but nothing answers it. `14_CUL_MAX.pm` replies with `PairPong` and distinguishes a new pairing
      from a re-pair by the destination address (`000000` = anyone, otherwise the last paired
      device). Receiving works without pairing, which is why ShutterContacts appear to work today
      and thermostats do not.
- [ ] **MAX! associate / link partners** ([#31](https://github.com/hobbyquaker/cul/issues/31)):
      `AddLinkPartner` / `RemoveLinkPartner` are parsed (and no longer crash since 0.21.0), but
      there is no way to send them, so a wall thermostat cannot be associated with a radiator valve
      the way FHEM does it.
- [ ] MAX! device state tracking is currently a module-level `seen_devices` map shared by every
      `Cul` instance in the process. Move it onto the instance.
- [ ] **AskSin / BidCoS (HomeMatic)**: `commands.A` is mapped but there is no parser. A full
      HomeMatic implementation is out of scope (that is what `10_CUL_HM.pm` is, and it is enormous),
      but decoding the frame header (length, counter, flags, type, source, destination, payload) is
      cheap and lets consumers route messages.
- [ ] **Wireless M-Bus** (`b` prefix) frame extraction for water/heat meters - decoding is the job
      of a dedicated wmbus library, `cul` should just hand over the frame.
- [ ] **RF native mode** (`Nr<mode>`, a-culfw): LaCrosse IT+, PCA301, EMT7110. Payload is
      `id, type/flags, temp*10+1000, humidity|battery`.
- [ ] **Stacked CUNs / mapleCUN / MAX!Cube with a-culfw**
      ([#28](https://github.com/hobbyquaker/cul/issues/28)). Several transceivers behind one serial
      or telnet connection: commands are prefixed with `*` per stack level, and received messages
      carry the same prefix (`STACKABLE_CC` in `00_CUL.pm`, matched as `^\*`). It needs a routing
      layer above the parser - a `Cul` instance per stack level sharing one transport, or a
      `stackLevel` on each message - and cannot be bolted onto `parse()` alone.

## Testing

`npm test` covers the parsers and command builders, both transports, and the typings
(`tsc --noEmit` against `types-test/`).

The transport tests ([#15](https://github.com/hobbyquaker/cul/issues/15)) use a local `net` server
for telnet and serialport's mock binding for serial — `SerialPortMock.binding`, which ships with
serialport, so no extra dependency and nothing test-only in the public API. They cover the init
sequence, the mode command, reconnect, `close()`, messages split across chunks and `cmd()` dispatch.

Still open:

- [ ] Recorded-traffic fixtures. Most protocol tests use hand-derived messages checked against the
      FHEM sources; a capture from real hardware would be worth more, especially for MORITZ and the
      CUL_TCM97001 models that no one here can verify.

## Not planned

- Device state machines, dedup windows, "window open for 5 s" logic. FHEM modules do that; `cul`
  stays a parser. Consumers such as cul2mqtt own the state.
- A device database or auto-discovery of house codes.
- Replacing culfw itself (SIGNALduino/rtl_433 style demodulation).

## Reference material

- [culfw command reference](http://culfw.de/commandref.html) — the authoritative list of send
  commands and message prefixes.
- [a-culfw](https://github.com/heliflieger/a-culfw) — the maintained fork; adds Kopp FC, Somfy,
  Manchester (Oregon/Hideki), Revolt, RF native mode. Its
  [commandref](https://github.com/heliflieger/a-culfw/blob/master/culfw/docs/commandref.html) is
  more complete than the original.
- [`00_CUL.pm`](https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/00_CUL.pm) — the dispatch table
  (`matchList`) that maps prefixes to FHEM modules, and the RSSI/reformat rules `cul` mirrors.
- [FHEM module sources](https://svn.fhem.de/trac/browser/trunk/fhem/FHEM) — one module per protocol,
  GPLv2, the reference implementation for everything above.
- [FHEM forum](https://forum.fhem.de) — boards "CUL/COC/CUNO" and "Sonstiges" for protocol quirks
  and firmware-specific behaviour.

### Prefix coverage

| Prefix    | Protocol                         | culfw      | status in `cul`                  |
| --------- | -------------------------------- | ---------- | -------------------------------- |
| `F`       | FS20                             | stock      | parse + cmd                      |
| `T` (10)  | FHT80b                           | stock      | parse + cmd                      |
| `T` (8)   | FHT80 TF window sensor           | stock      | parse (0.18.0)                   |
| `E`       | EM1000                           | stock      | parse                            |
| `K`       | S300TH / KS300 / WS7000          | stock      | parse (KS300 + WS7000 in 0.18.0) |
| `H`       | HMS                              | stock      | parse (detectors in 0.18.0)      |
| `S`       | ESA1000/2000                     | stock      | parse                            |
| `t`       | LaCrosse TX2/TX3                 | stock      | parse (0.18.0)                   |
| `U`       | UNIRoll                          | stock      | cmd + echo parse (0.19.0)        |
| `Z` / `V` | MORITZ (MAX!)                    | stock      | parse, cmd incomplete (1.1.0)    |
| `R`       | Hoermann                         | 1.67+      | parse + cmd (0.19.0)             |
| `A`       | AskSin / BidCoS (HomeMatic)      | stock      | none — 1.1.0                     |
| `o`       | OBIS smart meter                 | stock      | `unknown` — needs hardware       |
| `i`       | Intertechno                      | stock      | parse + cmd (0.19.0 / 0.20.0)    |
| `s`       | CUL_TCM97001 (433 MHz sensors)   | Manchester | parse (0.20.0)                   |
| `r`       | Revolt NC-5462                   | a-culfw    | parse (0.20.0)                   |
| `Y`       | Somfy RTS                        | a-culfw    | parse + cmd (0.19.0)             |
| `kr`      | Kopp Free Control                | a-culfw    | none — needs hardware            |
| `b`       | Wireless M-Bus                   | stock      | none — 1.1.0                     |
| `N`       | RF native (LaCrosse IT+, PCA301) | a-culfw    | none — 1.1.0                     |
| `I`       | CUL_IR (CUNO)                    | CUNO       | none — deferred                  |
