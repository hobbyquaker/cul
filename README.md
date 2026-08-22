# cul

[![NPM version](https://img.shields.io/npm/v/cul.svg)](https://www.npmjs.com/package/cul)
[![CI](https://github.com/hobbyquaker/cul/actions/workflows/ci.yml/badge.svg)](https://github.com/hobbyquaker/cul/actions/workflows/ci.yml)
[![License][gpl-badge]][gpl-url]

A [Node.js](https://nodejs.org) module to interact with a
[Busware CUL (USB)](http://busware.de/tiki-index.php?page=CUL),
[COC (RaspberryPi)](http://busware.de/tiki-index.php?page=COC),
[SCC (RaspberryPi)](http://busware.de/tiki-index.php?page=SCC) or
[CUNO](http://busware.de/tiki-index.php?page=CUNO) running [culfw](http://culfw.de). With
CUL/COC/SCC/CUNO and culfw many 433/868 MHz RF devices can be controlled, like
[FS20](https://www.elv.de/fs20-funkschaltsystem.html), [MAX!](https://www.elv.de/max-haussteuerung),
FHT heating controls, temperature sensors, weather stations and more. See the
[full list of supported devices](http://culfw.de/culfw.html#Features).

#### Purpose

This module is a thin abstraction over the serial port or telnet connection to a
CUL/COC/SCC/CUNO/CUNO2 plus lightweight parse and command wrappers. It is meant to be used in
Node.js based home automation software - see [cul2mqtt](https://github.com/hobbyquaker/cul2mqtt) for
a complete bridge built on it.

#### Credits

Based on the work of Rudolf Koenig, author of [culfw](http://culfw.de) and [fhem](http://fhem.de)
(both licensed under GPLv2).

## Usage

```
npm install cul
```

```javascript
import Cul from 'cul';

const cul = new Cul();

// ready is emitted after the connection is established and culfw acknowledged data reporting
cul.on('ready', () => {
  // send arbitrary commands to culfw
  cul.write('V');
});

cul.on('data', (raw, message) => {
  console.log(raw, message);
});

cul.on('error', (error) => {
  console.error(error.message);
});
```

Requires Node.js `^20.19 || ^22.12 || >=24`. The package is an ES module and ships TypeScript
typings. Upgrading from 0.x? See **[MIGRATION.md](MIGRATION.md)**.

`cul` reconnects on its own and the methods return promises, so a complete bridge is short:

```javascript
import Cul from 'cul';

const cul = new Cul({serialport: '/dev/ttyACM0'});

cul.on('ready', () => console.log('connected'));
cul.on('close', () => console.log('disconnected, reconnecting'));
cul.on('error', (error) => console.error(error.message));
cul.on('data', (raw, message) => {
  if (message.data?.temperature !== undefined) {
    console.log(message.protocol, message.address, message.data.temperature, '°C');
  }
});

await cul.cmd('FS20', '6C48', '01', 'on');
```

## Options

| Option           | Default        | Description                                                                                 |
| ---------------- | -------------- | ------------------------------------------------------------------------------------------- |
| `connectionMode` | `serial`       | `serial` (CUL/COC/SCC) or `telnet` (CUNO/CUNO2)                                             |
| `serialport`     | `/dev/ttyAMA0` | serial device                                                                               |
| `baudrate`       | `9600`         | 38400 when `coc` or `scc` is set                                                            |
| `mode`           | `SlowRF`       | `SlowRF` (FS20, HMS, FHT, EM, ...), `MORITZ` (MAX!) or `AskSin` (HomeMatic)                 |
| `parse`          | `true`         | try to parse received messages                                                              |
| `init`           | `true`         | send the "enable data reporting" command when the connection is established                 |
| `coc`            | `false`        | [COC](http://busware.de/tiki-index.php?page=COC): baudrate 38400, serialport `/dev/ttyACM0` |
| `scc`            | `false`        | [SCC](http://busware.de/tiki-index.php?page=SCC): baudrate 38400, serialport `/dev/ttyAMA0` |
| `rssi`           | `true`         | request and decode the signal strength byte (needs `init` and `parse`)                      |
| `debug`          | `false`        | log every command that is sent                                                              |
| `repeat`         | `false`        | disable repeat-message filtering in culfw, i.e. report every repetition of a message        |
| `host`           | -              | IP address of the CUNO (required in telnet mode)                                            |
| `port`           | `2323`         | telnet port                                                                                 |
| `networkTimeout` | `true`         | send keep-alive commands to the telnet server                                               |
| `initTimeout`    | `2000`         | ms the CUL gets to wake up before the init command is written                               |
| `reconnect`      | `10000`        | reconnect delay in ms; `false` or `0` disables reconnecting                                 |
| `autoOpen`       | `true`         | open the connection from the constructor; `false` means `open()` has to be called           |
| `signal`         | -              | an `AbortSignal` that closes the connection                                                 |
| `logger`         | `console.log`  | function used for the `debug` output                                                        |

An unknown `mode` or `connectionMode`, and telnet without a `host`, throw from the constructor.

```javascript
const fs20 = new Cul({serialport: '/dev/ttyACM0', mode: 'SlowRF'});
const max = new Cul({serialport: '/dev/ttyACM1', mode: 'MORITZ'});
```

## Methods

All of these return a promise and also accept an optional node style callback.

- **open()**
  open the connection; resolves on `ready`. Only needed with `autoOpen: false`
- **close([callback])**
  close the connection and stop reconnecting
- **write(raw, [callback])**
  send a message to the CUL, without the trailing CRLF
- **cmd(protocol, arg1, arg2, ..., [callback])**
  build a command and send it (see "Sending commands" below). Rejects when the protocol is unknown
  or the arguments do not produce a valid message
- **parse(raw)**
  parse a message and emit `data`. Normally called internally

`cul.connected` is `true` between `ready` and `close`.

For parsing without a connection:

```javascript
import {parseMessage} from 'cul';

parseMessage('F6C480011E5');
// { protocol: 'FS20', address: '6C4800', data: { ..., cmd: 'on' }, rssi: -87.5 }
```

`commands`, `protocol`, `resolveProtocol` and `rssiPattern` are exported too, and the individual
protocol modules stay importable as `cul/lib/fs20.js` and so on.

## Events

- **ready** - connection established and (if `init` is true) data reporting enabled. Fires again
  after every successful reconnect
- **close** - connection closed
- **data(raw, message)** - a message was received. `raw` is the string from the CUL, `message` the
  parsed object (see "Data parsing")
- **error(exception)** - the serial port or the TCP connection reported an error. `cul` keeps
  reconnecting unless `reconnect` is disabled

## Sending commands

### Raw commands

```javascript
cul.write('F6C480111');
```

### Predefined commands

Implemented for FS20, FHT, Intertechno, Somfy RTS, Hoermann and UNIRoll.

#### FS20

`lib/fs20.js` exports `cmd(housecode, address, command, time, bidi, res)`.

```javascript
cul.cmd('FS20', '2341 2131', '1112', 'on'); // ELV notation, command as text
cul.cmd('FS20', '6C48', '01', '11'); // hex housecode, hex address, hex command
```

Both produce the same message as the raw command above. `time` (seconds) sets the extended flag and
appends the FS20 timer byte:

```javascript
cul.cmd('FS20', '6C48', '01', 'on-for-timer', 30);
```

#### Intertechno

`lib/it.js` exports `cmd(housecode, command)`. The house code is either 10 tri-state digits
(`0`, `1`, `F`, `D`) or a rotary switch position - `A1` ... `P16` for Intertechno, `I1` ... `IV4`
for FLS 100. `on`, `off`, `dimup` and `dimdown` use the codes FHEM defaults to; pass an explicit
2 digit code for devices that differ.

```javascript
cul.cmd('it', 'A1', 'on'); // rotary switch house A, unit 1
cul.cmd('it', 'FFFFFF0FFF', '0F'); // explicit house code and command code
```

`it.clock(us)` and `it.repetition(n)` build the `it` / `isr` settings commands, and a complete
32 or 36 digit protocol V3 payload is passed through when `command` is omitted.

#### Somfy RTS

Somfy is a rolling code protocol: every frame carries a counter that has to be higher than the last
one the shutter saw. `cul` stays stateless - keep the counters yourself and increment them with the
helpers before each send.

```javascript
import * as somfy from 'cul/lib/somfy.js';

rollingCode = somfy.nextRollingCode(rollingCode); // persist these two
encKey = somfy.nextEncKey(encKey);
cul.cmd('somfy', 'A29842', 'up', rollingCode, encKey);
```

Commands: `up`/`off`, `down`/`on`, `stop`, `go-my`, `prog`, `wind_sun`, `wind_only`, `blind`, or a
2 digit hex code. `somfy.symbolWidth(us)` and `somfy.repetition(n)` build the `Yt` / `Yr` settings
commands. Needs a firmware with Somfy support ([a-culfw](https://github.com/heliflieger/a-culfw)).

#### Hoermann

```javascript
cul.cmd('hoermann', '0123456789'); // toggles the door, needs culfw >= 1.67
```

#### UNIRoll

```javascript
cul.cmd('uniroll', '1234', 0, 'up'); // group, device, up / down / stop
```

## Data parsing

The second argument of the `data` event is an object representation of the message:

- **protocol** - `FS20`, `EM`, `HMS`, `WS`, `FHT`, `FHTTK`, `TX`, `MORITZ`, ...
- **address** - unique address within the protocol
- **device** - device type name
- **rssi** - signal strength in dBm (only when the `rssi` option is enabled and the message is an RF
  message)
- **data** - the parsed values

### Examples

#### FS20

```
F6C480011E5
{
    protocol: 'FS20',
    address: '6C4800',
    rssi: -87.5,
    data: {
        addressCode: '6C48',
        addressCodeElv: '2341 2131',
        addressDevice: '00',
        addressDeviceElv: '1111',
        extended: false,
        bidirectional: false,
        response: false,
        cmd: 'on',
        cmdRaw: '11'
    }
}
```

#### EM1000

```
E020563037A01000200EC
{
    protocol: 'EM',
    address: '0205',
    device: 'EM1000-EM',
    rssi: -84,
    data: {seq: 99, total: 31235, current: 10, peak: 2}
}
```

#### S300TH

```
K1145525828
{
    protocol: 'WS',
    address: '2',
    device: 'S300TH',
    rssi: -54,
    data: {temperature: 24.5, humidity: 58.5}
}
```

#### FHT80 TF window sensor

```
T12345602E5
{
    protocol: 'FHTTK',
    address: '123456',
    device: 'FHT80TF',
    rssi: -54,
    data: {stateRaw: '02', repetition: false, state: 'Window Closed', batteryLow: false, open: false}
}
```

#### culfw report (answer to a bare `X`)

```
21   900
{
    protocol: 'culfw',
    data: {
        reportRaw: '21',
        report: {known: true, repeated: false, bits: false, monitor: false,
                 bintime: false, rssi: true, fhtproto: false, lcdmon: false},
        credit10ms: 900
    }
}
```

`credit10ms` is the transmit credit culfw has left, in units of 10 ms - it enforces the 1 % duty
cycle of the 868 MHz band.

#### 433 MHz sensor (CUL_TCM97001)

```
s9F00D76E00A5
{
    protocol: 'TCM97001',
    address: '159',
    device: 'GT_WT_02',
    rssi: -119.5,
    data: {temperature: 21.5, humidity: 55, channel: 1, battery: 1, mode: 0}
}
```

These sensors carry no protocol id, so the model is identified by message length, a checksum where
the protocol has one, and a fixed nibble where it does not. Results outside -30 ... 60 °C or
0 ... 100 % make `cul` try the next candidate rather than report a wrong value; when nothing fits,
`data.error` is `no matching decoder`.

#### Revolt NC-5462

```
rAB12E60064320898620141A5
{
    protocol: 'Revolt',
    address: 'AB12',
    device: 'NC-5462',
    rssi: -119.5,
    data: {voltage: 230, current: 1, frequency: 50, power: 220, powerFactor: 0.98, energy: 3.21}
}
```

#### FHT80b

```
T4C5300AA00E3
{
    protocol: 'FHT',
    address: '4c53',
    rssi: -88.5,
    data: {addressCode: 7683, cmdRaw: '00', cmd: 'actuator', confirmRaw: 'aa', valueRaw: '00', value: 0}
}
```

`value` is a number for temperatures and the valve position (as a percentage), and a string for the
enums (`AUTO`/`MANU`, the `warnings` text) and for week program times (`06:00`).

#### MORITZ (MAX!)

```
Z0C000442113AD30C4F0D001CB41D
{
    protocol: 'MORITZ',
    address: '113ad3',
    device: 'WallMountedThermostat',
    rssi: -59.5,
    data: {
        len: 12,
        msgcnt: 0,
        msgFlag: '04',
        msgTypeRaw: '42',
        msgType: 'WallThermostatControl',
        src: '113ad3',
        dst: '0c4f0d',
        groupid: 0,
        payload: '1CB4',
        desiredTemperature: 14,
        measuredTemperature: 18
    }
}
```

#### culfw firmware version

```
V 1.66 CSM868
{protocol: 'culfw', data: {version: '1.66', hardware: 'CSM868'}}
```

### Supported devices

| protocol | device                                                      | should work        | tested             |
| :------- | :---------------------------------------------------------- | :----------------- | :----------------- |
| FS20     | all devices                                                 | :white_check_mark: | :white_check_mark: |
| FHT      | FHT80b                                                      | :white_check_mark: | :white_check_mark: |
| FHTTK    | FHT80 TF (window/door)                                      | :white_check_mark: |                    |
| HMS      | HMS100T                                                     | :white_check_mark: | :white_check_mark: |
| HMS      | HMS100TF                                                    | :white_check_mark: |                    |
| HMS      | HMS100WD, RM100-2, HMS100TFK, HMS100MG, HMS100CO, HMS100FIT | :white_check_mark: |                    |
| EM       | EM1000(-EM, -GZ, -WZ)                                       | :white_check_mark: | :white_check_mark: |
| WS       | S300TH                                                      | :white_check_mark: | :white_check_mark: |
| WS       | KS300/2                                                     | :white_check_mark: |                    |
| WS       | WS7000 (temp, temp/hum, rain, wind, indoor, brightness)     | :white_check_mark: |                    |
| TX       | LaCrosse TX2/TX3                                            | :white_check_mark: |                    |
| ESA      | ESA1000, ESA2000                                            | :white_check_mark: | :white_check_mark: |
| MORITZ   | HeatingThermostat, WallMountedThermostat, PushButton        | :white_check_mark: |                    |
| MORITZ   | ShutterContact                                              | :white_check_mark: | :white_check_mark: |
| IT       | Intertechno V1 + V3, EV1527 (send V1, receive both)         | :white_check_mark: |                    |
| Somfy    | RTS shutters (send + receive)                               | :white_check_mark: |                    |
| Hoermann | garage doors (send + receive)                               | :white_check_mark: |                    |
| UNIRoll  | all devices (send)                                          | :white_check_mark: |                    |
| TCM97001 | Mebus, GT_WT_02, Type1, KW9010, KW9015                      | :white_check_mark: |                    |
| TCM97001 | Prologue, NC_WS, Eurochron, Rubicson, AURIOL, ABS700        | :white_check_mark: |                    |
| Revolt   | NC-5462 power meter                                         | :white_check_mark: |                    |

A message whose prefix culfw uses but for which `cul` has no parser yet comes back as
`{protocol, unknown: true}`. It carries no `data`, so it is easy to log and easy to ignore.
Kopp FC, CUL_IR, HomeMatic, wM-Bus and the Ventus wind/rain sensors are on the
[roadmap](ROADMAP.md). Adding a protocol means adding one file to `lib/`; the FHEM sources at
<https://svn.fhem.de/fhem/trunk/fhem/FHEM/> are the reference implementation. Pull requests welcome.

## Further reading

- [culfw command reference](http://culfw.de/commandref.html)
- [a-culfw](https://github.com/heliflieger/a-culfw), the maintained culfw fork
- [ROADMAP.md](ROADMAP.md) — what is planned and why
- [CHANGELOG.md](CHANGELOG.md)

## Credits

- <http://culfw.de>
- <http://fhem.de>
- <https://github.com/serialport/node-serialport>
- <https://github.com/netAction/CUL_FS20>
- <https://github.com/katanapod/COC_FS20>

## License

[Licensed under GPLv2](LICENSE)

Copyright (c) 2014-2026 Sebastian Raff <hobbyquaker@gmail.com> and contributors

[gpl-badge]: https://img.shields.io/badge/License-GPL-blue.svg?style=flat
[gpl-url]: LICENSE
