# Migrating from 0.x to 1.0.0

1.0.0 collects every breaking change that had piled up since 0.17. Everything here is mechanical -
there is no new concept to learn, and nothing was removed without a replacement.

## Node.js and installation

|            | 0.x    | 1.0.0                          |
| :--------- | :----- | :----------------------------- |
| Node.js    | `>=18` | `^20.19 \|\| ^22.12 \|\| >=24` |
| serialport | `^9`   | `^13`                          |

serialport 9 published prebuilt binaries for Node 12, 14 and 16 only, so on anything newer it was
compiled from source against `nan` at install time. That needed python3, make and g++ on the target
and did not reliably work — see [#36](https://github.com/hobbyquaker/cul/issues/36). serialport 13
is N-API based and ships prebuilds for every current Node, so `npm install cul` no longer needs a
toolchain.

## ESM

The package is `"type": "module"` now.

```js
// 0.x
const Cul = require('cul');

// 1.0.0
import Cul from 'cul';
```

`require('cul')` from CommonJS no longer works. If you cannot move to ESM yet, use a dynamic import:

```js
const {default: Cul} = await import('cul');
```

The entry point is `index.js` instead of `cul.js`; `main`, `exports` and `types` in `package.json`
point at it, so `import 'cul'` keeps working either way. TypeScript typings ship as `index.d.ts`.

Parsing helpers are named exports now, and `cul/lib/*.js` is still importable:

```js
// 0.x
const {parseMessage} = require('cul/lib/parse.js');

// 1.0.0
import {parseMessage} from 'cul';
// or, unchanged:
import {parseMessage} from 'cul/lib/parse.js';
```

## Promises

`write()`, `cmd()` and `close()` return promises. They still accept a node style callback, so
existing callback code keeps working — except that `cmd()` no longer returns a boolean.

```js
// 0.x
cul.cmd('FS20', '6C48', '01', 'on'); // returned true/false
cul.write('V', (err, res) => {});

// 1.0.0
await cul.cmd('FS20', '6C48', '01', 'on'); // rejects instead of returning false
cul.write('V', (err) => {}); // still fine
```

There is also `open()`, which resolves on `ready`:

```js
const cul = new Cul({autoOpen: false});
await cul.open();
```

`autoOpen` defaults to `true`, so `new Cul()` still connects on its own.

## Reconnect

`cul` reconnects by itself now, every 10 s by default (`reconnect: false` disables it, or pass a
number of milliseconds). `ready` fires again after each successful reconnect and `connected` tells
you the current state. If you wrapped `cul` in your own reconnect loop, remove it.

## Renamed and normalised message fields

The point of this pass is that a generic consumer no longer needs per-protocol special cases.

| protocol | 0.x                                                                  | 1.0.0                                                                               |
| :------- | :------------------------------------------------------------------- | :---------------------------------------------------------------------------------- |
| all      | `data.battery` (`0/1/2`, or `'ok'`/`'low'`, meaning varied)          | `data.batteryLow` (boolean) and `data.batteryState` (`ok`/`low`/`empty`/`replaced`) |
| `WS`     | `address` was a number (`firstByte & 7`), plus `data.addressCode`    | `address` is a string with the FHEM numbering (1..8); `data.addressCode` is gone    |
| `FHTTK`  | `data.window`                                                        | `data.open`                                                                         |
| `MORITZ` | `data.isopen` (`0/1`)                                                | `data.open` (boolean)                                                               |
| `MORITZ` | `data.batterylow`, `data.battery`                                    | `data.batteryLow`, `data.batteryState`                                              |
| `MORITZ` | `data.valveposition`                                                 | `data.valvePosition`                                                                |
| `MORITZ` | `data.dstsetting`, `data.langateway`, `data.rferror`, `data.unkbits` | `data.dstSetting`, `data.lanGateway`, `data.rfError`, `data.unknownBits`            |
| `MORITZ` | `data.untilStr` (an object, despite the name)                        | `data.until`                                                                        |
| `FHT`    | `data.value` was a string for everything except `0`                  | numbers stay numbers, enums (`AUTO`, `OK`, ...) and times stay strings              |
| `FHT`    | week program times as `6:00`                                         | zero padded `06:00`                                                                 |

### culfw responses

`V 1.66 CSM868` used to be reported as a MORITZ message with `data.culfw.version`. It is its own
protocol now:

```js
// 0.x: {protocol: 'MORITZ', data: {culfw: {version: '1.66', hardware: 'CSM868'}}}
// 1.0.0
{protocol: 'culfw', data: {version: '1.66', hardware: 'CSM868'}}
```

### MAX! week profile control points

Control points reported the time they are valid _until_, which reads backwards for a schedule
([#34](https://github.com/hobbyquaker/cul/pull/34)). `hour`/`minute` is the start time now, and the
old value is still there as `untilHour`/`untilMinute`:

```js
// 0.x
{temperature: 17, hour: 6, minute: 0}

// 1.0.0
{temperature: 17, hour: 0, minute: 0, untilHour: 6, untilMinute: 0}
```

## Stricter validation

An unknown `mode` or `connectionMode`, and telnet without a `host`, now throw from the constructor
instead of being silently ignored. If you passed something like `mode: 'slowRF '` with a stray
space, that used to disable the mode command without telling you.

## FHT commands return two messages

`fht.cmd()` returns an array (setting the central code, then the command) instead of one string
with an embedded newline. `cul.cmd('FHT', ...)` writes all of them in order, so this only matters
if you called the protocol module directly.

## Removed

- `cul.js` — the entry point is `index.js`.
- `moritz.cmd()` — it always returned `false`. MAX! send support is tracked for 1.1.0.
- `Object.prototype.getKeyByValue` — this was never intentional, see
  [#19](https://github.com/hobbyquaker/cul/issues/19). Removed in 0.18.0 already.
