# CUL module for Node.js

[![NPM version](https://badge.fury.io/js/cul.svg)](http://badge.fury.io/js/cul)

This is a Node.js module that can be used to interact with a [Busware CUL (USB)](http://busware.de/tiki-index.php?page=CUL) or
[COC (RaspberryPi)](http://busware.de/tiki-index.php?page=COC) running [culfw](http://culfw.de). With CUL/COC and culfw
many RF devices can be controlled, like [FS20](http://www.elv.de/fs20-funkschaltsystem.html),
[Max](http://www.elv.de/max-imale-kontrolle.html), different temperature sensors, weather stations and more.
[Click here for a full list of supported Devices](http://culfw.de/culfw.html#Features)

#### Purpose

This module provides a thin abstraction for the serial port communication with CUL/COC and lightweight parse and command
wrappers. It's intended to be used in different Node.js based Home Automation software.

This module is also used by an "adapter" of the Home Automation project "[ioBroker](https://github.com/iobroker/ioBroker.nodejs)".

#### Credits

based on the work of Rudolf Koenig, Author of [culfw](http://culfw.de) and [fhem](http://fhem.de) (both licensed under GPLv2)


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

* **serialport** (default: ```"/dev/ttyAMA0"```)
* **baudrate** (default: ```9600```)
* **mode** (default: ```"SlowRF"```)    
    possible values:
    * SlowRF (FS20, HMS, FHT, EM, ...)
    * MORITZ (MAX! devices)
    * AskSin (HomeMatic devices)
* **parse** (default: true)    
    try to parse received messages
* **init** (default: true)    
    auto send "enable datareporting" command when connection is established (depends on chosen mode)
* **coc** (default: false)    
    has to be enabled for usage with [COC](http://busware.de/tiki-index.php?page=COC)), changes default baudrate to 38400 and default serialport to /dev/ttyACM0
* **rssi** (default: true)
    receive rssi (signal strength) value with every message (works only if init is true)

pass options when creating a new cul object:
```javascript
var options = {
    serialport: '/dev/ttyACM1'
};
var Cul = require('cul');
var cul = new Cul(options);
```

## Methods

    
* **close( )**    
close the serialport connection
* **write(raw)**    
send message to cul. writes directly to the serialport
* **cmd(protocol, arg1, arg2, ...)**    
generate a command and send it to cul (see chapter "predefined commands" below)

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

(until now only FS20 is implemented)

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
FS20, EM, HMS, WS, ...
* **address**    
a unique address in this protocol
* **device**  
device type name
* **data**    
a object with the parsed data

### Examples:

#### FS20
```
F6C480011, {
    protocol: 'FS20',
    address: '6C4800',
    device: 'FS20',
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
E020563037A01000200, {
    protocol: 'EM',
    address: '0205',
    device: 'EM1000-EM',
    data: { seq: 99, total: 31235, current: 1, peak: 2 }
}
```

#### S300TH
```
K11455258, {
    protocol: 'WS',
    address: 1,
    device: 'S300TH',
    data: { temperature: 24.5, humidity: 58.5 },
}
```



Until now only for a few selected devices data parsing is implemented.

| protocol 	|         device        	| should work 	| tested 	|
|:--------:	|:---------------------:	|:-----------:	|:------:	|
| FS20     	| all Devices              	| :white_check_mark: | :white_check_mark:   |
| HMS      	| HMS100T               	| :white_check_mark: | :white_check_mark:   |
| HMS      	| HMS100TF              	| :white_check_mark: |        	            |
| EM       	| EM1000(-EM, -GZ, -WZ) 	| :white_check_mark: | :white_check_mark:   |
| WS       	| S300TH                	| :white_check_mark: | :white_check_mark:   |


More can be added easily: take a look at the files in the directory lib/ and find your inspiration on
http://sourceforge.net/p/fhem/code/HEAD/tree/trunk/fhem/FHEM/

Pull requests welcome!

## further reading

* [culfw command reference](http://culfw.de/commandref.html)



## Todo

* configurable serialport auto reconnect
* more data parser modules ...
* more command modules ...
* more tests ...
* [CUNO](http://busware.de/tiki-index.php?page=CUNO) support

Pull requests welcome! :)

## Credits

* http://culfw.de
* http://fhem.de
* https://github.com/voodootikigod/node-serialport
* https://github.com/netAction/CUL_FS20
* https://github.com/katanapod/COC_FS20

## License

[Licensed under GPLv2](LICENSE)

Copyright (c) 2014 hobbyquaker <hq@ccu.io>
