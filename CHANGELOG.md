# Changelog

All notable changes are documented here. This project follows [semantic versioning](https://semver.org).

## 1.0.0

The breaking release. Every change that alters output or requirements, collected into one version —
see **[MIGRATION.md](MIGRATION.md)** for the complete before/after list.

### Breaking

- **ESM.** The package is `"type": "module"`, the entry point is `index.js` instead of `cul.js`.
  `require('cul')` no longer works; use `import Cul from 'cul'` or a dynamic `import()`.
- **serialport 13, Node `^20.19 || ^22.12 || >=24`.** serialport 9 only published prebuilds for Node
  12/14/16, so on anything newer it was compiled from source against `nan` at install time — which
  is what [#36](https://github.com/hobbyquaker/cul/issues/36) is about. serialport 13 is N-API based
  and ships prebuilds, so installing needs no toolchain.
- **`cmd()` rejects instead of returning `false`**, and `write()` / `cmd()` / `close()` return
  promises. Node style callbacks still work.
- **Message fields normalised** so a generic consumer needs no per-protocol special cases:
  `battery` (which meant `0/1/2` in one protocol, `'ok'`/`'low'` in another, and had opposite
  polarity in a third) is now `batteryLow` (boolean) plus `batteryState`; `WS` reports `address` as
  a string with the FHEM 1..8 numbering; `FHTTK.window` and `MORITZ.isopen` are both `open`;
  `valveposition`, `batterylow`, `dstsetting`, `langateway`, `rferror`, `unkbits` and `untilStr`
  are camelCase.
- **`V 1.66 CSM868` is a `culfw` message**, not a MORITZ one: `{protocol: 'culfw', data: {version,
hardware}}`.
- **MAX! week profile control points report their start time** as `hour`/`minute`, with the old
  end time kept as `untilHour`/`untilMinute`
  ([#34](https://github.com/hobbyquaker/cul/pull/34) by @1stsetup).
- **An unknown `mode` or `connectionMode`, and telnet without a `host`, throw** instead of being
  silently ignored.
- `fht.cmd()` returns an array of messages; `moritz.cmd()` is gone (it always returned `false`).

### Added

- **Built-in reconnect** with a configurable delay (`reconnect`, default 10 s), plus a `connected`
  property. Consumers no longer have to wrap `cul` in their own reconnect loop.
- **`open()`** and the `autoOpen` option, so the connection can be opened explicitly.
- **`AbortSignal` support** via the `signal` option.
- **TypeScript typings** (`index.d.ts`) with a type-level test, and `parseMessage`,
  `resolveProtocol`, `commands`, `protocol` and `rssiPattern` as named exports of the main entry.
- **Transport tests** ([#15](https://github.com/hobbyquaker/cul/issues/15)): the telnet path against
  a local server, the serial path against serialport's mock binding. They cover the init sequence,
  reconnect, `close()`, chunked and split messages, and `cmd()` dispatch — the gap @Apollon77
  described. CI also verifies that a plain `npm install` works on Linux, macOS and Windows.
- FHT reports `data.confirmRaw`, decodes `actuator` as a percentage, and sets `batteryLow` from the
  `warnings` value.

### Fixed

- `lib/fht.js` and `lib/moritz.js` were rewritten; they are no longer excluded from prettier and
  eslint. Along the way: FHT could not encode a week program time with hour 0 or minute 0
  (`time[0] > 0 && time[1] > 0`), single digit FHT device codes produced a malformed message, and
  the modules no longer `console.log` from library code.

## 0.21.0

Picks up what was still useful in the open pull requests. Additive.

### Added

- `initTimeout` option (default 2000 ms, was a hard coded 1500 ms). Some CULs need longer to wake up
  before the init command is written. Thanks to @jpk75, [#35](https://github.com/hobbyquaker/cul/pull/35).
- The answer to a bare `X` is parsed (`lib/culfw.js`): `{protocol: 'culfw', data: {reportRaw,
report: {known, repeated, bits, monitor, bintime, rssi, fhtproto, lcdmon}, credit10ms}}`. The flag
  names are culfw's own `REP_*` names, `credit10ms` is the remaining transmit credit that enforces
  the 1 % duty cycle. Based on @1stsetup's [#33](https://github.com/hobbyquaker/cul/pull/33),
  recognised by the shape of the response so it works in telnet mode too.

### Fixed

- **`AddLinkPartner` / `RemoveLinkPartner` threw** `data.payload is not a function` - the payload
  was called instead of sliced, so pairing a MAX! device crashed the `data` handler. Same class of
  bug as [#19](https://github.com/hobbyquaker/cul/issues/19), whose other two causes (the
  `Object.prototype` pollution and the unguarded `PairPing` branch) were fixed in 0.18.0.
- MAX! week profile control points reported fractional hours (`11.333` instead of `11`) because the
  hour was not floored. Thanks to @1stsetup, [#34](https://github.com/hobbyquaker/cul/pull/34).

## 0.20.0

The rest of the receive side. Additive: existing protocols are unchanged, but messages that used to
come back as an empty object are parsed now.

### Added

- **CUL_TCM97001** (`lib/tcm97001.js`) - the cheap 433 MHz temperature and humidity sensors sold
  under a dozen brands, received as `s` messages. Ten decoders, tried most specific first:
  Mebus, GT_WT_02, Type1, KW9010, KW9015 (rain), Prologue, NC_WS (PEARL NC7159 / LogiLink WS0002),
  Eurochron (EAS 800), Rubicson, AURIOL and ABS700. There is no protocol id on the air, so a model
  is identified by message length plus a checksum where the protocol has one, and by a fixed nibble
  where it does not. Implausible results (temperature outside -30 ... 60 °C, humidity outside
  0 ... 100 %) make the decoder fall through to the next candidate instead of reporting a wrong
  value. `data.error` says `no matching decoder` when nothing fits.
- **Revolt NC-5462** power meter sockets (`lib/revolt.js`): voltage, current, frequency, power,
  power factor and energy, with the plausibility check 19_Revolt.pm applies (`data.error` is set,
  the values are still reported).
- **Intertechno receive** (`i` messages): protocol V1 (tri-state house code plus command code, the
  counterpart of `it.cmd()`), EV1527 sensors (PIR, door contacts - address `1527x<5 hex>`) and
  protocol V3 (26 bit address, group bit, unit).
- Messages with a prefix culfw uses but for which there is no parser yet (`A` AskSin, `o` Obis, ...)
  are reported as `{protocol, unknown: true}` instead of an empty object, so a bridge can log what a
  user's CUL actually receives. There is no `data` on them, so generic consumers stay quiet.

### Fixed

- **MORITZ (MAX!) messages failed their length check since 0.18.0.** The check counted the RSSI
  byte, which is stripped before parsing now, so every `Z` message came back as
  `data.error: 'len mismatch'` with nothing decoded. As a side effect `data.payload` no longer has
  the RSSI byte appended to it - it used to be two characters too long (`1CB41D` instead of `1CB4`),
  which is also what the old README example showed.

### Notes

- Lower case `s` is not in the prefix list `00_CUL.pm` strips the RSSI byte from, so for
  CUL_TCM97001 the byte is part of the payload. That module decodes its own `rssi`; the length of a
  message therefore counts 10 nibbles of data plus the RSSI byte.
- Not implemented: Kopp Free Control (a-culfw only, needs the full key code table), CUL_IR, the
  Ventus W044/W132/W174 wind and rain sensors, PFR-130, NX7674 and HomeEasy. See ROADMAP.md.

## 0.19.0

Send support for the 433 MHz world. Additive: no existing output changes.

### Added

- **Intertechno** (`lib/it.js`). `cmd(housecode, command)` builds the culfw `is` frame from a 10
  digit tri-state house code, or straight from a rotary switch position (`A1` ... `P16`, and the
  FLS 100 wheels `I1` ... `IV4`). `on`/`off`/`dimup`/`dimdown` resolve to the codes 10_IT.pm uses by
  default; an explicit 2 digit code can be passed instead. A complete 32/36 digit protocol V3
  payload is passed through. `clock()` and `repetition()` set the pulse width (`it`) and the frame
  repeat count (`isr`). Also reachable as `cul.cmd('intertechno', ...)`.
- **Somfy RTS** (`lib/somfy.js`). `cmd(address, command, rollingCode, encKey)` builds the `Ys`
  frame; `nextRollingCode()` and `nextEncKey()` do the increments 10_SOMFY.pm does (the key is
  masked with `0xAF`). The module stays stateless - Somfy is a rolling code protocol and the counter
  belongs to whoever persists it. `symbolWidth()` and `repetition()` set `Yt` / `Yr`. Received `Ys`
  frames are parsed, with the address bytes swapped back into the order `cmd()` takes.
- **Hoermann** garage doors (`lib/hoermann.js`). `R` messages are decoded into an address plus a
  `toggle` command, `cmd(address)` sends `hn<address>` (needs culfw >= 1.67). `R` messages used to
  come back as an empty object.
- **UNIRoll** `parse()` for the echo of a sent frame, and a `cmd()` that validates its arguments
  and accepts both numbers and hex strings. An unknown command stops the shutter instead of
  silently building a wrong message.

### Notes

- Somfy and Hoermann need a firmware built with those protocols - stock culfw 1.67+ or
  [a-culfw](https://github.com/heliflieger/a-culfw). Intertechno is in stock culfw.
- Somfy's control byte carries a checksum in its lower nibble, so `stop` and `go-my` cannot be told
  apart on the receive side. `data.cmdRaw` holds the unmasked byte.

## 0.18.0

Modernisation of the tooling plus a round of parser fixes. The public API (constructor options,
`write`, `cmd`, `close`, the `ready` / `data` / `close` / `error` events) is unchanged.

### Added

- **FHT80 TF window/door sensors** (`lib/fhttk.js`). `T` messages with 8 hex digits are now parsed
  as `protocol: 'FHTTK'` with `window`, `state`, `battery` and `repetition` instead of being fed to
  the FHT80b parser, which produced nonsense for them.
- **LaCrosse TX2/TX3 sensors** (`lib/tx.js`). `t` messages were listed in the command table but the
  parser was never wired up, so they came back as an empty object. Temperature, humidity, sensor id
  and the built-in plausibility check are decoded now.
- **HMS binary sensors**: HMS100TFK (switch contact), RM100-2 (smoke), HMS100MG (gas), HMS100CO and
  HMS100FIT are decoded, each with its own state field and battery status.
- **KS300/2 weather stations** and the **WS7000 family** (rain, wind, brightness, indoor
  temperature/humidity/pressure) in the `WS` parser.
- `data.batteryState` (`ok` / `empty` / `replaced`) alongside the numeric `data.battery` for HMS.
- `lib/parse.js` exports the message dispatcher (`parseMessage`, `resolveProtocol`, `commands`,
  `protocol`), so messages can be parsed without opening a connection.
- `close()` works in telnet mode; it used to be defined only for serial connections and threw a
  `TypeError`.
- `cul.parse(message)` is a public method now.

### Fixed

- **Boolean options were impossible to switch off.** `init`, `parse`, `rssi` and `networkTimeout`
  were assigned with `options.x = options.x || true`, which is always `true`. Passing `parse: false`
  or `rssi: false` now does what the README says. If you passed one of these expecting it to be
  ignored, this changes behaviour.
- **The RSSI byte is stripped before parsing**, like FHEM's `00_CUL.pm` does. This is what makes the
  length-based protocol detection above possible. RSSI is only decoded for messages that look like
  RF messages (`^[AFTKEHRStZrib]([0-9A-F]{2})+$`), so responses such as `V 1.66 CSM868` no longer
  come with a made-up signal strength.
- **FS20 command names were off by one from 0x17 upwards** - `0x16` (`timer`) was missing from the
  table, so `sendstate` and everything after it resolved to the wrong name, in both `parse` and
  `cmd`.
- **FS20 command names ignored the flag bits.** An extended, bidirectional or response message
  resolved to `undefined`; the lookup masks with `0x1F` now.
- **FS20 extended timer was never decoded** (`message.isExtended` was tested, `message.data.extended`
  was set) and both the decoder and the encoder used `2 ^ i` (bitwise xor) where the FS20 protocol
  wants `2 ** i`. `data.time` now holds the timer value in seconds.
- **EM1000 `current` was decoded from the wrong nibble** (`raw[13]` twice instead of `raw[13]` and
  `raw[14]`).
- **S300TH sensors were reported as `WS300`.** Device detection now follows `14_CUL_WS.pm`: the
  WS7000 family is selected by `raw[1] & 7 === 7`, everything else by message length.
- **HMS100FIT was never recognised** - the type nibble arrives upper case (`E`), the lookup table is
  keyed lower case.
- **HMS detectors reported a temperature** decoded from bytes that carry no temperature, and their
  battery status was read from the wrong nibble.
- `Object.prototype.getKeyByValue` is gone. Requiring `cul` used to add an enumerable property to
  `Object.prototype`, which breaks `for...in` loops anywhere in the host process.
- The telnet keep-alive interval is cleared on close and does not keep the process alive any more.
- FHT device codes below 16 are zero padded in `fht.cmd`, they used to produce a malformed message.
- `fs20.cmd` returns `false` instead of throwing when the ELV address notation is invalid.

### Changed

- `Cul` is an ES2015 class extending `EventEmitter` (still `module.exports = Cul`, still
  `new Cul(options)`).
- Node.js >= 18 (`engines` used to claim `>=8`, which has not been true since serialport 9).
- Tooling: eslint + prettier instead of xo, `node:test` instead of mocha/should, GitHub Actions
  instead of Travis CI. `lib/fht.js` and `lib/moritz.js` stay unformatted on purpose - see
  ROADMAP.md.
- Removed the unused `telnet-client` dependency (telnet mode uses `node:net` directly).
- `data.addressCode` (1..8, the numbering FHEM uses) added to WS messages. `address` is unchanged.

## 0.17.0

Moritz: minor fixes and decoding of the week profile.

## 0.16.0

Added decoding of the MAX! week profile.

## 0.15.0

Emit `error` events in more places to prevent throwing async exceptions.

## 0.14.2

Only close the serial port if it is open, to prevent an exception.
