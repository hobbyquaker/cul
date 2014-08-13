/**
 *      CUL/COC / culfw Node.js module
 *      https://github.com/hobbyquaker/cul
 *
 *      Copyright (c) 2014 hobbyquaker <hq@ccu.io>
 *
 */

var util =                  require('util');
var EventEmitter =          require('events').EventEmitter;

var SerialPortModule =      require("serialport");
var SerialPort =            SerialPortModule.SerialPort;

var protocol = {
    em:                     require('./lib/em.js'),
    esa:                    require('./lib/esa.js'),
    fht:                    require('./lib/fht.js'),
    fs20:                   require('./lib/fs20.js'),
    hms:                    require('./lib/hms.js'),
    moritz:                 require('./lib/moritz.js'),
    tx:                     require('./lib/tx.js'),
    uniroll:                require('./lib/uniroll.js'),
    ws:                     require('./lib/ws.js')
};

// http://culfw.de/commandref.html
var commands = {
    'F': 'FS20',
    'T': 'FHT',
    'E': 'EM',
    'W': 'WS',
    'H': 'HMS',
    'S': 'ESA',
    'R': 'Hoermann',
    'A': 'AskSin',
    'Z': 'MORITZ',
    'o': 'Obis',
    't': 'TX',
    'U': 'Uniroll',
    'K': 'WS'
};


var Cul = function (options) {
    var that = this;

    options.baudrate =      options.baudrate ||     9600;
    options.serialport =    options.serialport ||   '/dev/ttyACM0';
    options.mode =          options.mode ||         'SlowRF';
    options.init =          options.init ||         true;
    options.parse =         options.parse ||        true;
    options.coc =           options.coc ||          false;

    var modes = {
        'slowrf':           {start: 'X01'},
        'moritz':           {start: 'X01\r\nZr',    stop: 'Zx'},
        'asksin':           {start: 'X01\r\nAr',    stop: 'Ax'}
    };

    var initCmd = modes[options.mode.toLowerCase()].start;
    var stopCmd;

    if (modes[options.mode.toLowerCase()] && modes[options.mode.toLowerCase()].stop) {
        stopCmd = modes[mode.toLowerCase()].stop;
    }
    var spOptions = {
        baudrate: options.baudrate
    };
    if (options.coc) spOptions.parser = SerialPortModule.parsers.readline('\r\n');

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
            that.write(initCmd, function (err, res) {
                if (err) throw err;
                ready();
            });
        } else {
            ready();
        }

        function ready() {
            serialPort.on('data', function (data) {
                data = data.toString();
                var tmp = data.split('\r\n');
                for (var i = 0, l = tmp.length; i < l; i++) {
                    if (typeof tmp[i] === 'string' && tmp[i] !== '') parse(tmp[i]);
                }
            });
            that.emit('ready');
        }

    });


    this.write = function send(data, callback) {
        serialPort.write(data + '\r\n', callback);
    };

    this.cmd = function cmd() {
        var args = Array.prototype.slice.call(arguments);
        if (typeof args[args.length-1] === 'function') {
            var callback = args.pop();
        }
        var c = args[0];
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

        if (options.parse) {
            command = data[0];
            message = {};

            if (commands[command]) {
                p = commands[command].toLowerCase();
                if (protocol[p] && typeof protocol[p].parse === 'function') {
                    message = protocol[p].parse(data);
                }
            }

        }

        that.emit('data', data, message);
    }

    return this;
};

util.inherits(Cul, EventEmitter);

module.exports = Cul;
