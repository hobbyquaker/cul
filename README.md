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
const Cul = require('cul');
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

Requires Node.js >= 18.

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
| `logger`         | `console.log`  | function used for the `debug` output                                                        |

```javascript
const Cul = require('cul');

const fs20 = new Cul({serialport: '/dev/ttyACM0', mode: 'SlowRF'});
const max = new Cul({serialport: '/dev/ttyACM1', mode: 'MORITZ'});
```

## Methods

- **close([callback])**
  close the connection
- **write(raw, [callback])**
  send a message to the CUL. Writes directly to the serial port / socket; the optional callback is
  passed through to the serialport module and called with `(err, res)`
- **cmd(protocol, arg1, arg2, ..., [callback])**
  build a command and send it (see "Sending commands" below)
- **parse(raw)**
  parse a message and emit `data`. Normally called internally

For parsing without a connection use `require('cul/lib/parse.js')`:

```javascript
const {parseMessage} = require('cul/lib/parse.js');

parseMessage('F6C480011E5');
// { protocol: 'FS20', address: '6C4800', data: { ..., cmd: 'on' }, rssi: -87.5 }
```

## Events

- **ready** - connection established and (if `init` is true) data reporting enabled
- **close** - connection closed
- **data(raw, message)** - a message was received. `raw` is the string from the CUL, `message` the
  parsed object (see "Data parsing")
- **error(exception)** - the serial port or the TCP connection reported an error

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
const somfy = require('cul/lib/somfy.js');

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
    address: 1,
    device: 'S300TH',
    rssi: -54,
    data: {addressCode: 2, temperature: 24.5, humidity: 58.5}
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
    data: {stateRaw: '02', repetition: false, state: 'Window Closed', battery: 0, window: false}
}
```

#### FHT80b

```
T4C5300AA00E3
{
    protocol: 'FHT',
    address: '4c53',
    rssi: -88.5,
    data: {cmdRaw: '00', addressCode: 7683, cmd: 'actuator', valueRaw: '00'}
}
```

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
        payload: '1CB41D',
        desiredTemperature: 14,
        measuredTemperature: 18
    }
}
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
| IT       | Intertechno V1 (send)                                       | :white_check_mark: |                    |
| Somfy    | RTS shutters (send + receive)                               | :white_check_mark: |                    |
| Hoermann | garage doors (send + receive)                               | :white_check_mark: |                    |
| UNIRoll  | all devices (send)                                          | :white_check_mark: |                    |

Everything not in this list - Revolt, Kopp FC, the cheap 433 MHz sensor families, HomeMatic, wM-Bus

- is on the [roadmap](ROADMAP.md). Adding a protocol means adding
  one file to `lib/`; the FHEM sources at <https://svn.fhem.de/fhem/trunk/fhem/FHEM/> are the
  reference implementation. Pull requests welcome.

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
