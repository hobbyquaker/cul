/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

/**
 *      CUL/COC / culfw Node.js module
 *      https://github.com/hobbyquaker/cul
 *
 *      Licensed under GPL v2
 *      Copyright (c) 2014-2018 hobbyquaker <hq@ccu.io>
 *
 */

const util = require('util');
const {EventEmitter} = require('events');

const protocol = {
    em: require('./lib/em.js'),
    fs20: require('./lib/fs20.js'),
    hms: require('./lib/hms.js'),
    moritz: require('./lib/moritz.js'),
    uniroll: require('./lib/uniroll.js'),
    ws: require('./lib/ws.js'),
    fht: require('./lib/fht.js'),
    esa: require('./lib/esa.js')
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
    slowrf: {
    },
    moritz: {
        start: 'Zr',
        stop: 'Zx'
    },
    asksin: {
        start: 'Ar',
        stop: 'Ax'
    }
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
    options.debug = options.debug || false;
    options.repeat = options.repeat || false;
    options.connectionMode = options.connectionMode || 'serial';
    options.networkTimeout = options.networkTimeout || true;
    options.logger = options.logger || console.log;

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

    if (options.repeat) {
        // Set flag, binary or
        options.initCmd |= 0x02;
    }

    options.initCmd = 'X' + ('0' + options.initCmd.toString(16)).slice(-2);

    const modeCmd = modes[options.mode.toLowerCase()] ? modes[options.mode.toLowerCase()].start : undefined;
    let stopCmd;

    if (modes[options.mode.toLowerCase()] && modes[options.mode.toLowerCase()].stop) {
        stopCmd = modes[options.mode.toLowerCase()].stop;
    }

    // Serial connection
    if (options.connectionMode === 'serial') {
        const SerialPort = require('serialport');
        const {Readline} = SerialPort.parsers;
        const parser = new Readline({
            delimiter: '\r\n'
        });
        const spOptions = {
            baudRate: options.baudrate
        };
        const serialPort = new SerialPort(options.serialport, spOptions);
        serialPort.pipe(parser);
        this.close = function (callback) {
            if (!serialPort.isOpen) {
                return;
            }

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
                setTimeout(() => { // Give CUL enough time to wakeup
                    that.write(options.initCmd, err => {
                        if (err) {
                            that.emit('error', err);
                        }
                    });
                    serialPort.drain(() => {
                        if (modeCmd) {
                            that.write(modeCmd, err => {
                                if (err) {
                                    that.emit('error', err);
                                }
                            });
                            serialPort.drain(err => {
                                if (err) {
                                    that.emit('error', err);
                                } else {
                                    ready();
                                }
                            });
                        } else {
                            ready();
                        }
                    });
                }, 2000);
            } else {
                ready();
            }

            function ready() {
                parser.on('data', parse);
                that.emit('ready');
            }
        });

        serialPort.on('error', ex => {
            that.emit('error', ex);
        });

        this.write = function (data, callback) {
            if (options.debug) {
                options.logger('->', data);
            }

            serialPort.write(data + '\r\n');
            serialPort.drain(callback);
        };
    } else if (options.connectionMode === 'telnet') {
        // Telnet connection
        const net = require('net');

        if (!options.host) {
            throw new Error('no host defined!');
        }

        options.port = options.port || '2323';

        const telnet = net.createConnection(Number.parseInt(options.port, 10), options.host);

        if (options.networkTimeout) {
            // WATCHDOG
            this.telnetWatchdog = Date.now(); // Setup watchdog
            this.telnetWatchdogSecondTry = false; // We try to times before the watchdog bites
            setInterval(() => {
                if (Date.now() - that.telnetWatchdog > 5000) { // Watchdog bites
                    if (that.telnetWatchdogSecondTry) { // Second time
                        // the answer to the command we have written has not arrived
                        // so we throw an error
                        that.emit('error', new Error('Connection Timeout!'));
                    } else { // First time
                        // if its the first time we are writing a
                        // simple command to the server and wait for an answer
                        that.telnetWatchdogSecondTry = true;
                        that.telnetWatchdog = Date.now();
                        that.write('V');
                    }
                }
            }, 2500);

            this.patWatchdog = function () {
                that.telnetWatchdog = Date.now(); // Save new time
                that.telnetWatchdogSecondTry = false;
            };
        }

        telnet.on('connect', () => {
            options.logger('Connected');

            if (options.init) {
                that.write(options.initCmd);

                if (modeCmd) {
                    that.write(modeCmd);
                }
            }

            telnet.on('data', data => {
                data.toString().split(/\r?\n/).forEach(parse);
                that.patWatchdog(); // Pat Watchdog
            });

            that.emit('ready');
        });

        telnet.on('close', () => {
            options.logger('Disconnected');
            that.emit('close');
        });

        telnet.on('error', ex => {
            that.emit('error', ex);
        });

        this.write = function (data, callback) {
            if (options.debug) {
                options.logger('->', data);
            }

            telnet.write(data + '\r\n');

            if (callback) {
                callback(false);
            }
        };
    } else {
        // If an unknown connection is defined
        throw new Error('connection mode \'' + options.connectionMode + '\' is unknown!\nplease use \'serial\' or \'telnet\'');
    }

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
            const message = protocol[c].cmd.apply(null, args);
            if (message) {
                that.write(message, callback);
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
        let dataRaw;

        if (options.parse) {
            if (options.rssi) {
                dataRaw = data.slice(0,-2); // remove RSSI byte
            } else {
                dataRaw = data;
            }

            command = dataRaw[0];
            message = {};
            if (commands[command]) {
                p = commands[command].toLowerCase();
                if (protocol[p] && typeof protocol[p].parse === 'function') {
                    message = protocol[p].parse(dataRaw);
                }
            }

            if (options.rssi) {
                rssi = Number.parseInt(data.slice(-2), 16);
                message.rssi = (rssi >= 128 ? (((rssi - 256) / 2) - 74) : ((rssi / 2) - 74));
            }
        }

        that.emit('data', data, message);
    }

    return this;
};

util.inherits(Cul, EventEmitter);

module.exports = Cul;
