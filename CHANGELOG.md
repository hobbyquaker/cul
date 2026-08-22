# Changelog

All notable changes are documented here. This project follows [semantic versioning](https://semver.org).

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
