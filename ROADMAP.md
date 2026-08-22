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

Left out on purpose: Intertechno V3 is only a pass-through (building a V3 frame from an address,
group bit and unit needs the dim-level encoding of 10_IT.pm), HomeEasy (`ish`/`ise`) and EV1527 are
not implemented.

## 0.20.0 — the rest of the receive side

Additive: new `protocol` values appear in the `data` event.

- [ ] **CUL_TCM97001** (`s` prefix,
      [`14_CUL_TCM97001.pm`](https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/14_CUL_TCM97001.pm)).
      The single biggest coverage win: ~20 cheap 433 MHz temperature/humidity sensor families
      (Prologue, NC_WS, Mebus, AURIOL, Rubicson, GT-WT-02, KW9010, Eurochron, TCM 218943, W044/W132/
      W174 Ventus wind/rain, PFR-130 rain gauge, NX7674). Message length (8/10/12/14 hex) plus a
      per-model checksum identifies the model. Port it as a table of `{length, detect, decode}`
      entries so models can be added one at a time; without a model hint several of them are only
      distinguishable by their CRC.
- [ ] **Revolt NC-5462 power meters** (`r` prefix,
      [`19_Revolt.pm`](https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/19_Revolt.pm)). 23 hex
      digits: voltage (byte 2), current (bytes 3-4, ×0.01 A), frequency (byte 5), power (bytes 6-7,
      ×0.1 W), power factor (byte 8, ×0.01), energy (bytes 9-10, ×0.01 kWh). Plausibility limits:
      V >= 80, f <= 65, P <= 3650, I <= 16.
- [ ] **Intertechno / EV1527 receive** (`i` prefix) - the same tri-state decoding as the send path,
      needed for remotes and PIR sensors.
- [ ] **Kopp Free Control** (`kr` prefix,
      [`10_KOPP_FC.pm`](https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/10_KOPP_FC.pm)), receive
      and send. Only supported by [a-culfw](https://github.com/heliflieger/a-culfw), not by stock
      culfw.
- [ ] **OBIS / smart meter** (`o` prefix, `47_OBIS.pm`) - `commands.o` is mapped to `Obis` but there
      is no module behind it, so those messages come back empty today.
- [ ] **CUL_IR** (`I` prefix) for CUNO/CUNO2 infrared.
- [ ] **HMS100T ambiguity**: the HMS address changes on every battery change. Document the FHEM
      `100<type>` wildcard convention so consumers can keep a stable device id.
- [ ] Emit an `unknown` event (or `message.unknown = true`) for messages with a known prefix but no
      parser, so downstream projects can log what a user's CUL actually sees.

## 1.0.0 — the breaking release

Everything that cannot be done without changing output or requirements. One release, one migration
guide.

- [ ] **ESM** (`"type": "module"`) with a named export, plus `index.d.ts` typings, matching what
      [lgtv2](https://github.com/hobbyquaker/lgtv2) 2.0 did.
- [ ] **serialport 13**, Node >= 20.19. serialport 9 has prebuilt binaries for Node 12/14/16 only,
      so every install on a current Node compiles it from source with `nan` - which needs python3,
      make and g++ on the target, i.e. exactly what a Raspberry Pi user does not want. serialport 13
      is N-API based and ships prebuilds. This also drops the `--ignore-scripts` workaround in CI.
- [ ] **Promise API** next to the callback API: `open()`, `close()`, `write()`, `cmd()` returning
      promises, `AbortSignal` support.
- [ ] **Built-in reconnect** with backoff for both serial and telnet, and `connected` state on the
      instance. Every consumer currently reimplements this (cul2mqtt has its own wrapper); the
      telnet watchdog only emits `error` and then leaves the object dead.
- [ ] **Consistent `address`**: `WS` reports a number (`firstByte & 7`), everything else reports a
      string; FHEM numbers the same sensors 1..8. 0.18.0 added `data.addressCode` with the FHEM
      numbering - 1.0.0 makes `address` the string form of it and drops the old value.
- [ ] **Consistent `data` field names** across protocols (`battery`/`batteryState`, `temperature`,
      `humidity`, ...), so a generic consumer such as cul2mqtt does not need a per-protocol skip
      list.
- [ ] Rewrite `lib/fht.js` and `lib/moritz.js` (tabs, `var`, dead branches, a `payload(6,2)` call on
      a string in the `AddLinkPartner` branch that throws). They are excluded from prettier and have
      relaxed eslint rules today precisely because a reformat would hide the remaining bugs. Rewrite
      with tests first, using recorded messages.
- [ ] Drop the `V`-response-parsed-as-MORITZ oddity: `V 1.66 CSM868` should be
      `{protocol: 'culfw', data: {version, hardware}}`, not a MORITZ message.
- [ ] Validate `mode` against the known values instead of silently falling back to no mode command.

## 1.1.0 — MAX! and HomeMatic

- [ ] **MORITZ (MAX!) send support** - `lib/moritz.js` has a `cmd()` skeleton; wall thermostat /
      radiator valve set-temperature, mode and pairing are what cul2mqtt is waiting for.
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
| `o`       | OBIS smart meter                 | stock      | mapped but no parser — 0.20.0    |
| `i`       | Intertechno                      | stock      | cmd (0.19.0), parse in 0.20.0    |
| `s`       | CUL_TCM97001 (433 MHz sensors)   | Manchester | none — 0.20.0                    |
| `r`       | Revolt NC-5462                   | a-culfw    | none — 0.20.0                    |
| `Y`       | Somfy RTS                        | a-culfw    | parse + cmd (0.19.0)             |
| `kr`      | Kopp Free Control                | a-culfw    | none — 0.20.0                    |
| `b`       | Wireless M-Bus                   | stock      | none — 1.1.0                     |
| `N`       | RF native (LaCrosse IT+, PCA301) | a-culfw    | none — 1.1.0                     |
| `I`       | CUL_IR (CUNO)                    | CUNO       | none — 0.20.0                    |
