/**
 *      CUL/COC / culfw Node.js module
 *      https://github.com/hobbyquaker/cul
 *
 *      Licensed under GPL v2
 *      Copyright (c) 2014 hobbyquaker <hq@ccu.io>
 *
 */

var util =                      require('util');
var EventEmitter =              require('events').EventEmitter;

var SerialPort =                require("serialport");

var protocol = {
    em:                         require('./lib/em.js'),
    //esa:                      require('./lib/esa.js'),
    //fht:                      require('./lib/fht.js'),
    fs20:                       require('./lib/fs20.js'),
    hms:                        require('./lib/hms.js'),
    moritz:                     require('./lib/moritz.js'),
    //tx:                       require('./lib/tx.js'),
    //uniroll:                  require('./lib/uniroll.js'),
    ws:                         require('./lib/ws.js')
};

// http://culfw.de/commandref.html
var commands = {
    'F':                        'FS20',
    'T':                        'FHT',
    'E':                        'EM',
    'W':                        'WS',
    'H':                        'HMS',
    'S':                        'ESA',
    'R':                        'Hoermann',
    'A':                        'AskSin',
    'V':                        'MORITZ',
    'Z':                        'MORITZ',
    'o':                        'Obis',
    't':                        'TX',
    'U':                        'Uniroll',
    'K':                        'WS'
};

var modes = {
    'slowrf':                   {},
    'moritz':                   {start: 'Zr',       stop: 'Zx'},
    'asksin':                   {start: 'Ar',       stop: 'Ax'}
};


var Cul = function (options) {
    var that = this;

    options.initCmd =                                       0x01;
    options.mode =              options.mode        ||      'SlowRF';
    options.init =              options.init        ||      true;
    options.parse =             options.parse       ||      true;
    options.coc =               options.coc         ||      false;
    options.scc =               options.scc         ||      false;
    options.rssi =              options.rssi        ||      true;

    if (options.coc) {
        options.baudrate =      options.baudrate    ||      38400;
        options.serialport =    options.serialport  ||      '/dev/ttyACM0';
    } else if (options.scc) {
        options.baudrate =      options.baudrate    ||      38400;
        options.serialport =    options.serialport  ||      '/dev/ttyAMA0';
    } else {
        options.baudrate =      options.baudrate    ||      9600;
        options.serialport =    options.serialport  ||      '/dev/ttyAMA0';
    }

    if (options.rssi) {
        // Set flag, binary or
        options.initCmd = options.initCmd | 0x20;
    }
    options.initCmd = 'X' + ('0' + options.initCmd.toString(16)).slice(-2);

    var modeCmd = modes[options.mode.toLowerCase()] ? modes[options.mode.toLowerCase()].start : undefined;
    var stopCmd;

    if (modes[options.mode.toLowerCase()] && modes[options.mode.toLowerCase()].stop) {
        stopCmd = modes[options.mode.toLowerCase()].stop;
    }

    var spOptions = {baudrate: options.baudrate};
    if (options.coc || options.scc) spOptions.parser = SerialPortModule.parsers.readline('\r\n');
    var serialPort = new SerialPort(options.serialport, spOptions);

    this.close = function (callback) {
        if (options.init && stopCmd) {
            that.write(stopCmd, function () {
                serialPort.close(callback);
            });
        } else {
            serialPort.close(callback);
        }
    };

    serialPort.on('close', function () {
        that.emit('close');
    });

    serialPort.on("open", function () {

        if (options.init) {
            that.write(options.initCmd, function (err) {
                if (err) throw err;
            });
            serialPort.drain(function(err){
                if (modeCmd) {
                    that.write(modeCmd, function (err) {
                        if (err) throw err;
                    });
                    serialPort.drain(function(err){
                        if (err) throw err;
                        ready();
                    });
                } else {
                    ready();
                }
            });
        } else {
            ready();
        }

        function ready() {
            var buff = '';

            serialPort.on('data', function (data) {
                buff += data.toString();
                if (buff.indexOf('\n') !== -1) {
                    var tmp = buff.split('\r\n');
                    buff = tmp.pop(); // store the start of next command
                    for (var i = 0, l = tmp.length; i < l; i++) {
                        if (typeof tmp[i] === 'string' && tmp[i] !== '') parse(tmp[i]);
                    }
                }
            });
            that.emit('ready');
        }

    });


    this.write = function send(data, callback) {
        //console.log('->', data)
        serialPort.write(data + '\r\n');
        serialPort.drain(callback);
    };

    this.cmd = function cmd() {
        var args = Array.prototype.slice.call(arguments);

        if (typeof args[args.length-1] === 'function') {
            var callback = args.pop();
        }

        var c = args[0].toLowerCase();
        args = args.slice(1);

        if (commands[c.toUpperCase()]) c = commands[c.toUpperCase()].toLowerCase();

        if (protocol[c] && typeof protocol[c].cmd === 'function') {
            var msg = protocol[c].cmd.apply(null, args);
            if (msg) {
                that.write(msg, callback);
                return true;
            } else {
                if (typeof callback === 'function') callback('cmd ' + c + ' ' + JSON.stringify(args) + ' failed');
                return false;
            }
        } else {
            if (typeof callback === 'function') callback('cmd ' + c + ' not implemented');
            return false;
        }

    };

    function parse(data) {

        var message;
        var command;
        var p;
        var rssi;

        if (options.parse) {
            command = data[0];
            message = {};
            if (commands[command]) {
                p = commands[command].toLowerCase();
                if (protocol[p] && typeof protocol[p].parse === 'function') {
                    message = protocol[p].parse(data);
                }
            }
            if (options.rssi) {
                rssi = parseInt(data.slice(-2), 16);
                message.rssi =  (rssi >= 128 ? ((rssi - 256) / 2 - 74) : (rssi / 2 - 74));
            }
        }
        that.emit('data', data, message);
    }

    return this;
};

util.inherits(Cul, EventEmitter);

module.exports = Cul;
