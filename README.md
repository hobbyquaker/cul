# cul

[![NPM version](https://badge.fury.io/js/cul.svg)](http://badge.fury.io/js/cul)
[![dependencies Status](https://david-dm.org/hobbyquaker/cul/status.svg)](https://david-dm.org/hobbyquaker/cul)
[![Build Status](https://travis-ci.org/hobbyquaker/cul.svg?branch=master)](https://travis-ci.org/hobbyquaker/cul)
[![XO code style](https://img.shields.io/badge/code_style-XO-5ed9c7.svg)](https://github.com/sindresorhus/xo)
[![License][gpl-badge]][gpl-url]

This is a [Node.js](http://nodejs.org) module that can be used to interact with a
[Busware CUL (USB)](http://busware.de/tiki-index.php?page=CUL),
[COC (RaspberryPi)](http://busware.de/tiki-index.php?page=COC),
[SCC (RaspberryPi)](http://busware.de/tiki-index.php?page=SCC) or [CUNO](http://busware.de/tiki-index.php?page=CUNO) running [culfw](http://culfw.de). With CUL/COC/SCC/CUNO and
culfw many RF devices can be controlled, like [FS20](http://www.elv.de/fs20-funkschaltsystem.html),
[MAX!](http://www.elv.de/max-imale-kontrolle.html), temperature sensors, weather stations and more.
See the [full list of supported Devices](http://culfw.de/culfw.html#Features).

#### Purpose

This module provides a thin abstraction for the serial port or telnet communication with CUL/COC/SCC/CUNO/CUNO2 and lightweight parse and
command wrappers. It's intended to be used in different Node.js based Home Automation software.

#### Credits

based on the work of Rudolf Koenig, Author of [culfw](http://culfw.de) and [fhem](http://fhem.de) (both licensed under
GPLv2)


## Usage

```npm install cul```

```javascript
var Cul = require('cul');
var cul = new Cul();

// ready event is emitted after serial connection is established and culfw acknowledged data reporting
cul.on('ready', function () {
    // send arbitrary commands to culfw
    cul.write('V');
});

cul.on('data', function (raw) {
    // show raw incoming messages
    console.log(raw);
});

```

## Options

* **connectionMode** (default: ```"serial"```)
    possible values:
    * ```serial``` (CUL/COC/SCC)
    * ```telnet``` (CUNO/CUNO2)    
* **serialport** (default: ```"/dev/ttyAMA0"```)
* **baudrate** (default: ```9600```)
* **mode** (default: ```"SlowRF"```)    
    possible values:
    * ```SlowRF``` (FS20, HMS, FHT, EM, ...)
    * ```MORITZ``` (MAX! devices)
    * ```AskSin``` (HomeMatic devices)
* **parse** (default: ```true```)    
    try to parse received messages
* **init** (default: ```true```)    
    auto send "enable datareporting" command when connection is established (depends on chosen mode)
* **coc** (default: ```false```)    
    has to be enabled for usage with [COC](http://busware.de/tiki-index.php?page=COC)), changes default baudrate to 38400 and default serialport to /dev/ttyACM0
* **scc** (default: ```false```)    
    has to be enabled for usage with [SCC](http://busware.de/tiki-index.php?page=SCC)), changes default baudrate to 38400 and default serialport to /dev/ttyAMA0
* **rssi** (default: ```true```)  
    receive rssi (signal strength) value with every message (works only if init and parse are both true)
* **debug** (default: ```false```)  
    log every command which is send in the console
* **repeat** (default: ```false```)  
    disable repeat message filtering in culfw, that means report each of the (repeated) packets of a message
* **host** (no default value)  
    the IP-Address of CUNO (has to be set when using telnet mode)
* **port** (default: ```2323```)  
    the port of the telnet server
* **networkTimeout** (default: ```true```)  
    enabling sending keep alive signals to the telnet server

pass options when creating a new cul object:
```javascript
var Cul = require('cul');
var fs20 = new Cul({
    serialport: '/dev/ttyACM0',
    mode: 'SlowRF'
});
var max = new Cul({
    serialport: '/dev/ttyACM1',
    mode: 'MORITZ'
});
```

## Methods


* **close( )**    
close the serialport connection
* **write(raw, callback)**    
send message to cul. writes directly to the serialport    
optional callback is passed through to serialport module and is called with params (err, res)
* **cmd(protocol, arg1, arg2, ..., callback)**    
generate a command and send it to cul (see chapter "predefined commands" below)    
optional callback is passed through to serialport module and is called with params (err, res)


## Events

* **ready**    
called when serialport connection is established and (if init is true) datareporting is enabled
* **close**    
called when serialport connection is closed
* **data(raw, obj)**    
called for every received message
  * **raw** string, contains the raw message received from cul
  * **obj** object, contains parsed message data (see "data parsing" below)

## Sending commands

### Raw commands

Example
```javascript
cul.write('F6C480111'); // Raw command
```
### Predefined commands

(until now only FS20 and FHT is implemented)

#### FS20

Take a look at the file lib/fs20.js - it exports a function cmd(housecode, address, command, time, bidi, res)

example
```javascript
cul.cmd('FS20', '2341 2131', '1112', 'on'); // house code in ELV-Notation, address in ELV-Notation, command as text
cul.cmd('FS20', '6C48', '01', '11');        // house code as hex string, address as hex string, command as hex string
```
(these examples result in the same message as the raw command example above.)


## Data parsing

The 2nd param ```obj``` of the data event contains a object representation of the parsed data.

Each object has the following attributes:

* **protocol**    
FS20, EM, HMS, WS, MORITZ, ...
* **address**    
a unique address in this protocol
* **device**  
device type name
* **rssi**    
radio signal strength value (only present if option rssi is true)
* **data**    
a object with the parsed data


### Examples

Sample output of
```javascript
cul.on('data', function (raw, obj) {
    console.log(raw, obj);
});
```

#### FS20
```
F6C480011E5, {
    protocol: 'FS20',
    address: '6C4800',
    device: 'FS20',
    rssi: -87.5,
    data: {
        addressCode: '6C48',
        addressCodeElv: '2341 2131',
        addressDevice: '00',
        addressDeviceElv: '1111',
        extended: false,
        time: null,
        bidirectional: false,
        response: false,
        cmdRaw: '11',
        cmd: 'on'

    }
}
```

#### EM1000
```
E020563037A01000200EC, {
    protocol: 'EM',
    address: '0205',
    device: 'EM1000-EM',
    rssi: -84,
    data: { seq: 99, total: 31235, current: 1, peak: 2 }
}
```

#### S300TH
```
K1145525828, {
    protocol: 'WS',
    address: 1,
    device: 'S300TH',
    rssi: -28,
    data: { temperature: 24.5, humidity: 58.5 },
}
```

#### Moritz (MAX!)
```
V 1.66 CSM868 { data: { culfw: { version: '1.66', hardware: 'CSM868' } },
  protocol: 'MORITZ',
  rssi: -22 }
Z0C000442113AD30C4F0D001CB41D { data:
   { len: 12,
     msgcnt: 0,
     msgFlag: '04',
     msgTypeRaw: '42',
     msgType: 'WallThermostatControl',
     src: '113ad3',
     dst: '0c4f0d',
     groupid: 0,
     payload: '1CB41D',
     desiredTemperature: 14,
     measuredTemperature: 18 },
  protocol: 'MORITZ',
  address: '113ad3',
  device: 'WallMountedThermostat',
  rssi: -59.5 }
Z0E0002020C4F0D113AD3000119001C1E { data:
   { len: 14,
     msgcnt: 0,
     msgFlag: '02',
     msgTypeRaw: '02',
     msgType: 'Ack',
     src: '0c4f0d',
     dst: '113ad3',
     groupid: 0,
     payload: '0119001C1E',
     dstDevice: 'WallMountedThermostat' },
  protocol: 'MORITZ',
  address: '0c4f0d',
  rssi: -59 }
  Z0B4F06300E3F3C1234560012F7 { data:
   { len: 11,
     msgcnt: 79,
     msgFlag: '06',
     msgTypeRaw: '30',
     msgType: 'ShutterContactState',
     src: '0e3f3c',
     dst: '123456',
     groupid: 0,
     payload: '12F7',
     isopen: 1,
     unkbits: 4,
     rferror: 0,
     batterlow: 0,
     battery: 'ok' },
  protocol: 'MORITZ',
  address: '0e3f3c',
  device: 'ShutterContact',
  rssi: -78.5 }
```

#### FHT
```
T4C5300AA00E3 { protocol: 'FHT',
  address: '4c53',
  data:
   { cmdRaw: '00',
     addressCode: 7683,
     cmd: 'actuator',
     valueRaw: '00' },
  rssi: -88.5 }
T4D3F286924E2 { protocol: 'FHT',
  address: '4d3f',
  data:
   { cmdRaw: '28',
     addressCode: 7763,
     cmd: 'sat-from1',
     valueRaw: '24',
     value: '6:00' },
  rssi: -89 }
```

Until now for these devices data parsing and/or a command wrapper is implemented:

| protocol 	|         device        	| should work 	| tested 	|
|:---------	|:----------------------	|:-----------:	|:------:	|
| FS20     	| all Devices              	| :white_check_mark: | :white_check_mark:   |
| HMS      	| HMS100T               	| :white_check_mark: | :white_check_mark:   |
| HMS      	| HMS100TF              	| :white_check_mark: |        	            |
| EM       	| EM1000(-EM, -GZ, -WZ) 	| :white_check_mark: | :white_check_mark:   |
| WS       	| S300TH                	| :white_check_mark: | :white_check_mark:   |
| MORITZ   	| HeatingThermostat         | :white_check_mark: |                      |
| MORITZ   	| WallMountedThermostat     | :white_check_mark: |                      |
| MORITZ   	| ShutterContact            | :white_check_mark: | :white_check_mark:   |
| MORITZ   	| PushButton                | :white_check_mark: |                      |
| Uniroll  	| All Devices               | :white_check_mark: |                      |
| FHT  	    | FHT80b                    | :white_check_mark: | :white_check_mark:   |
| ESA  	    | ESA1000                   | :white_check_mark: | :white_check_mark:   |
| ESA  	    | ESA2000                   | :white_check_mark: | :white_check_mark:   |

More can be added easily: take a look at the files in the directory lib/ and find your inspiration on
https://svn.fhem.de/fhem/trunk/fhem/FHEM/

Pull requests welcome!


## further reading

* [culfw command reference](http://culfw.de/commandref.html)


## Todo

* configurable serialport auto reconnect
* more data parser modules
  * MORITZ (MAX!) (inprogress)
  * ESA
  * HMS: HMS100WD, RM100-2, HMS100TFK, HMS100MG, HMS100CO, HMS100FIT
  * ...
* more command modules
  * MORITZ (inprogress)
  * ...
* more tests

Pull requests welcome! :smile:

## Credits

* http://culfw.de
* http://fhem.de
* https://github.com/voodootikigod/node-serialport
* https://github.com/netAction/CUL_FS20
* https://github.com/katanapod/COC_FS20

## License

[Licensed under GPLv2](LICENSE)

Copyright (c) 2014-2020 Sebastian Raff <hobbyquaker@gmail.com> and Contributors

[gpl-badge]: https://img.shields.io/badge/License-GPL-blue.svg?style=flat
[gpl-url]: LICENSE
