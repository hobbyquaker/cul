# cul module for Node.js

This is a Node.js module that can be used to interact with a [Busware CUL (USB)](http://busware.de/tiki-index.php?page=CUL) or
[Busware COC (RaspberryPi)](http://busware.de/tiki-index.php?page=COC)
running [culfw](http://culfw.de). With CUL/COC and culfw many RF devices can be controlled,
like [FS20](http://www.elv.de/fs20-funkschaltsystem.html), [Max](http://www.elv.de/max-imale-kontrolle.html),
different temperature sensors, weather stations and more. [Click here for a full list of supported
RF-Protocols](http://culfw.de/culfw.html#Features)

#### Purpose

This module provides a thin abstraction for the serialport communication with CUL/COC and is intended to be used in
different Node.js based Home Automation projects.

Through parse- and command-modules (see files in lib directory) it offers an easy way to be extended
with protocol-specific data parsers and command builders.

This module is also used as an "Adapter" in the Home Automation Software "[ioBroker](https://github.com/iobroker/ioBroker.nodejs)".

#### Credits

based on the work of Rudolf Koenig, Author of [culfw](http://culfw.de) and [fhem](http://fhem.de) (both licensed under GPLv2)


## basic usage

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


## Reference

### options

* serialport (default: ```"/dev/ttyACM0"```)
* baudrate (default: ```9600```)
* mode (default: ```"SlowRF"```)
* parse (default: true)
* init (default: true)
* coc (default: false) (has to be enabled for usage with [COC](http://busware.de/tiki-index.php?page=COC))

pass options when creating a new cul object:
```javascript
var options = {
    serialport: '/dev/ttyACM1'
};
var Cul = require('cul');
var cul = new Cul(options);
```

### methods

* write(raw)
* cmd(protocol, arg1, arg2, ...)
* close( )

### events

* ready
* close
* data(raw, obj)

## COC usage

[Busware COC (RaspberryPi)](http://busware.de/tiki-index.php?page=COC)

```javascript
var Cul = require('cul');
var cul = new Cul({
    coc: true,
    baudrate: 38400,
    serialport: '/dev/ttyAMA0'
});

```

## Data parsing



The 2nd param ```obj``` of the data event contains a object representation of the parsed data.

Each object has the follwing attributes:

* protocol - FS20, EM, HMS, ...
* address - a unique address in this protocol
* device (optional) - device type name
* data - a object with the parsed data

### Examples:

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

#### FS20
```
F6C480011, {
    protocol: 'FS20',
    address: '6C4800',
    data: {
        addressCode: '6C48',
        addressCodeElv: '2341 2131',
        addressDevice: '00',
        extended: false,
        bidirectional: false,
        response: false,
        cmd: 'on',
        cmdRaw: '11'
    }
}
```

Until now only for a few selected devices data parsing is implemented.

| protocol 	|         device        	| should work 	| tested 	|
|:--------:	|:---------------------:	|:-----------:	|:------:	|
| FS20     	| all Devices              	| yes         	|        	|
| HMS      	| HMS100T               	| yes         	| yes    	|
| HMS      	| HMS100TF              	| yes         	|        	|
| EM       	| EM1000(-EM, -GZ, -WZ) 	| yes         	| yes    	|
| KS       	| S300TH                	| yes         	| yes    	|


More can be added easily: take a look at the files in the directory lib/parse/ and find your inspiration on
http://sourceforge.net/p/fhem/code/HEAD/tree/trunk/fhem/FHEM/

Pull requests welcome!

## Sending commands

### raw commands

example
```javascript
cul.write('F6C480111'); // Raw command
```
### predefined commands

Take a look at lib/command/fs20.js - it exports function cmd(housecode, address, command, time, bidi, res)

example
```javascript
cul.cmd('FS20', '2341 2131', '01', 'on'); // Housecode in ELV-Notation
cul.cmd('FS20', '6C48', '01', 'on'); // Housecode as hex string
```
(these examples result in the same message as the raw command example above.



## Todo

* more data parsers modules ...
* more command modules ...
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

Copyright (c) 2014 hobbyquaker