# cul module for Node.js

This is a Node.js module that can be used to interact with a [Busware CUL USB](http://busware.de/tiki-index.php?page=CUL)
running [culfw](http://culfw.de). With CUL and culfw many 866MHz and 433MHz RF devices can be controlled,
like FS20, Max!, different temperature sensors and weather stations and many more. [Click here for a full list of supported
RF-Protocols](http://culfw.de/culfw.html#Features)

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

cul.on('data', function (raw, obj) {

    // show incoming messages
    console.log(raw, obj);

});

```


## Reference

### options

* serialport (default: ```"/dev/ttyACM0"```)
* baudrate (default: ```9600```)
* mode (default: ```"SlowRF"```)

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
* close()

### events

* ready()
* close()
* data(raw, obj)

## Data parsing

The optional 2nd param ```obj``` of the data event contains a object representation of the parsed data, examples:

```
E020563037A01000200, {
    protocol: 'EM',
    address: '0205',
    device: 'EM1000-EM',
    type: '02',
    data: { seq: 99, total: 31235, current: 1, peak: 2 }
}

K11455258, {
    protocol: 'KS',
    address: 1,
    device: 'S300TH',
    data: { temperature: 24.5, humidity: 58.5 },
}
```

Until now only for a few devices that I own myself data parsing is implemented.

* S300TH
* EM1000/EM1000-EM/EM1000-GZ
* HMS100T

More can be added easily: take a look at the files in the lib dir and find your inspiration on
http://sourceforge.net/p/fhem/code/HEAD/tree/trunk/fhem/FHEM/


## Todo

Contributors welcome!

* FS20, sending commands (see https://github.com/netAction/CUL_FS20)
* finish HMS
* many more devices


## License

[Licensed under GPLv2](LICENSE) Copyright (c) 2014 hobbyquaker