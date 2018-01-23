/**
 *      CUL/COC / culfw Node.js module
 *      https://github.com/hobbyquaker/cul
 *
 *      Licensed under GPL v2
 *      Copyright (c) 2014 hobbyquaker <hq@ccu.io>
 *
 */

const util = require('util');
const EventEmitter = require('events').EventEmitter;

const SerialPort = require('serialport');

const protocol = {
    em: require('./lib/em.js'),
    fs20: require('./lib/fs20.js'),
    hms: require('./lib/hms.js'),
    moritz: require('./lib/moritz.js'),
    uniroll: require('./lib/uniroll.js'),
    ws: require('./lib/ws.js')
};

// http://culfw.de/commandref.html
const commands = {
    F: 'FS20',
    T: 'FHT',
    E: 'EM',
    W: 'WS',
    H: 'HMS',
    S: 'ESA',
    R: 'Hoermann',
    A: 'AskSin',
    V: 'MORITZ',
    Z: 'MORITZ',
    o: 'Obis',
    t: 'TX',
    U: 'Uniroll',
    K: 'WS'
};

const modes = {
    slowrf: {},
    moritz: {start: 'Zr', stop: 'Zx'},
    asksin: {start: 'Ar', stop: 'Ax'}
};

const Cul = function (options) {
    const that = this;
    options = options || {};
    options.initCmd = 0x01;
    options.mode = options.mode || 'SlowRF';
    options.init = options.init || true;
    options.parse = options.parse || true;
    options.coc = options.coc || false;
    options.scc = options.scc || false;
    options.rssi = options.rssi || true;

    if (options.coc) {
        options.baudrate = options.baudrate || 38400;
        options.serialport = options.serialport || '/dev/ttyACM0';
    } else if (options.scc) {
        options.baudrate = options.baudrate || 38400;
        options.serialport = options.serialport || '/dev/ttyAMA0';
    } else {
        options.baudrate = options.baudrate || 9600;
        options.serialport = options.serialport || '/dev/ttyAMA0';
    }

    if (options.rssi) {
        // Set flag, binary or
        options.initCmd |= 0x20;
    }
    options.initCmd = 'X' + ('0' + options.initCmd.toString(16)).slice(-2);

    const modeCmd = modes[options.mode.toLowerCase()] ? modes[options.mode.toLowerCase()].start : undefined;
    let stopCmd;

    if (modes[options.mode.toLowerCase()] && modes[options.mode.toLowerCase()].stop) {
        stopCmd = modes[options.mode.toLowerCase()].stop;
    }

    const Readline = SerialPort.parsers.Readline;
    const spOptions = {
        baudrate: options.baudrate,
        parser: new Readline({delimiter: '\r\n'})
    };
    const serialPort = new SerialPort(options.serialport, spOptions);

    this.close = function (callback) {
        if (options.init && stopCmd) {
            that.write(stopCmd, () => {
                serialPort.close(callback);
            });
        } else {
            serialPort.close(callback);
        }
    };

    serialPort.on('close', () => {
        that.emit('close');
    });

    serialPort.on('open', () => {
        if (options.init) {
            that.write(options.initCmd, err => {
                if (err) {
                    throw err;
                }
            });
            serialPort.drain(() => {
                if (modeCmd) {
                    that.write(modeCmd, err => {
                        if (err) {
                            throw err;
                        }
                    });
                    serialPort.drain(err => {
                        if (err) {
                            throw err;
                        }
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
            serialPort.on('data', parse);
            that.emit('ready');
        }
    });

    this.write = function (data, callback) {
        // Console.log('->', data)
        serialPort.write(data + '\r\n');
        serialPort.drain(callback);
    };

    this.cmd = function () {
        let args = Array.prototype.slice.call(arguments);
        let callback;
        if (typeof args[args.length - 1] === 'function') {
            callback = args.pop();
        }

        let c = args[0].toLowerCase();
        args = args.slice(1);

        if (commands[c.toUpperCase()]) {
            c = commands[c.toUpperCase()].toLowerCase();
        }

        if (protocol[c] && typeof protocol[c].cmd === 'function') {
            const msg = protocol[c].cmd.apply(null, args);
            if (msg) {
                that.write(msg, callback);
                return true;
            }
            if (typeof callback === 'function') {
                callback('cmd ' + c + ' ' + JSON.stringify(args) + ' failed');
            }
            return false;
        }
        if (typeof callback === 'function') {
            callback('cmd ' + c + ' not implemented');
        }
        return false;
    };

    function parse(data) {
        if (!data) {
            return;
        }
        data = data.toString();

        let message;
        let command;
        let p;
        let rssi;

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
                message.rssi = (rssi >= 128 ? (((rssi - 256) / 2) - 74) : ((rssi / 2) - 74));
            }
        }
        that.emit('data', data, message);
    }

    return this;
};

util.inherits(Cul, EventEmitter);

module.exports = Cul;
