'use strict';

const Cul = require('../cul');
// Load Serialport with mock bindings
// const SerialPort = require('../test'); // from inside the serialport repo
const SerialPort = require('serialport/test'); // when installed as a package
const MockBinding = SerialPort.Binding;

const portPath = 'COM_MOCK';

var port;
var cul;
var onOpen;
var onData;


MockBinding.createPort(portPath, { echo: false, record: false, readyData: new Buffer('') });

cul = new Cul({
    'connectionMode': 'serial',
    'serialport': portPath,
    'mode': 'SlowRF',
    'debug': true
});

// ready event is emitted after serial connection is established and culfw acknowledged data reporting
cul.on('ready', function () {
    console.log('READY CUL');
    // send arbitrary commands to culfw
    //cul.write('V');
    cul.getSerialPort().binding.emitData(Buffer.from('F6C480111\r\nF6C480111\r\n'));

//    done();
});

cul.on('data', function (raw, obj) {
    // show raw incoming messages
    console.log('CUL DATA: ' + raw + ', ' + JSON.stringify(obj));

    cul.cmd('FS20', '2341 2131', '1112', 'off', function(err) {
        console.log('WRITE RES: ' + err);
        console.log('READ: ' + cul.getSerialPort().binding.lastWrite.toString('utf8'));
    });

});

MockBinding.reset();
