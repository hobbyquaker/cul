'use strict';

/**
 *      CUL/COC/SCC/CUNO / culfw Node.js module
 *      https://github.com/hobbyquaker/cul
 *
 *      Licensed under GPL v2
 *      Copyright (c) 2014-2026 hobbyquaker <hq@ccu.io> and contributors
 */

const {EventEmitter} = require('node:events');
const {commands, protocol, parseMessage} = require('./lib/parse.js');

const modes = {
    slowrf: {},
    moritz: {
        start: 'Zr',
        stop: 'Zx',
    },
    asksin: {
        start: 'Ar',
        stop: 'Ax',
    },
};

const defaultOptions = {
    connectionMode: 'serial',
    mode: 'SlowRF',
    init: true,
    parse: true,
    coc: false,
    scc: false,
    rssi: true,
    debug: false,
    repeat: false,
    networkTimeout: true,
    // Time the CUL gets to wake up before the init command is written. 1500 ms is not always
    // enough, see https://github.com/hobbyquaker/cul/pull/35
    initTimeout: 2000,
};

class Cul extends EventEmitter {
    constructor(options) {
        super();

        options = {...defaultOptions, ...options};
        options.logger = options.logger || console.log;

        if (options.coc) {
            options.baudrate = options.baudrate || 38_400;
            options.serialport = options.serialport || '/dev/ttyACM0';
        } else if (options.scc) {
            options.baudrate = options.baudrate || 38_400;
            options.serialport = options.serialport || '/dev/ttyAMA0';
        } else {
            options.baudrate = options.baudrate || 9600;
            options.serialport = options.serialport || '/dev/ttyAMA0';
        }

        let initCmd = 0x01;

        if (options.rssi) {
            // Set flag, binary or
            initCmd |= 0x20;
        }

        if (options.repeat) {
            // Set flag, binary or
            initCmd |= 0x02;
        }

        options.initCmd = 'X' + ('0' + initCmd.toString(16)).slice(-2);

        const mode = modes[String(options.mode).toLowerCase()];
        const modeCmd = mode ? mode.start : undefined;
        const stopCmd = mode ? mode.stop : undefined;

        this.options = options;

        switch (options.connectionMode) {
            case 'serial':
                this.initSerial(options, modeCmd, stopCmd);
                break;
            case 'telnet':
                this.initTelnet(options, modeCmd, stopCmd);
                break;
            default:
                throw new Error(
                    'connection mode "' + options.connectionMode + '" is unknown!\nplease use "serial" or "telnet"',
                );
        }
    }

    initSerial(options, modeCmd, stopCmd) {
        const that = this;
        const SerialPort = require('serialport');
        const {Readline} = SerialPort.parsers;
        const parser = new Readline({
            delimiter: '\r\n',
        });
        const serialPort = new SerialPort(options.serialport, {
            baudRate: options.baudrate,
        });
        serialPort.pipe(parser);

        this.close = function (callback) {
            if (!serialPort.isOpen) {
                if (typeof callback === 'function') {
                    callback();
                }

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
                setTimeout(() => {
                    // Give CUL enough time to wakeup
                    that.write(options.initCmd, (err) => {
                        if (err) {
                            that.emit('error', err);
                        }
                    });
                    serialPort.drain(() => {
                        if (modeCmd) {
                            that.write(modeCmd, (err) => {
                                if (err) {
                                    that.emit('error', err);
                                }
                            });
                            serialPort.drain((err) => {
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
                }, options.initTimeout);
            } else {
                ready();
            }

            function ready() {
                parser.on('data', (data) => {
                    that.parse(data);
                });
                that.emit('ready');
            }
        });

        serialPort.on('error', (ex) => {
            that.emit('error', ex);
        });

        this.write = function (data, callback) {
            if (options.debug) {
                options.logger('->', data);
            }

            serialPort.write(data + '\r\n');
            serialPort.drain(callback);
        };
    }

    initTelnet(options, modeCmd, stopCmd) {
        const that = this;
        const net = require('node:net');

        if (!options.host) {
            throw new Error('no host defined!');
        }

        options.port = options.port || 2323;

        const telnet = net.createConnection(Number.parseInt(options.port, 10), options.host);
        let watchdogTimer;
        let closing = false;

        this.patWatchdog = function () {
            that.telnetWatchdog = Date.now();
            that.telnetWatchdogSecondTry = false;
        };

        if (options.networkTimeout) {
            this.telnetWatchdog = Date.now();
            this.telnetWatchdogSecondTry = false;
            watchdogTimer = setInterval(() => {
                if (Date.now() - that.telnetWatchdog > 5000) {
                    // Watchdog bites
                    if (that.telnetWatchdogSecondTry) {
                        // The answer to the command we have written has not arrived, so we report an error
                        that.emit('error', new Error('Connection Timeout!'));
                    } else {
                        // First time: write a simple command to the server and wait for an answer
                        that.telnetWatchdogSecondTry = true;
                        that.telnetWatchdog = Date.now();
                        that.write('V');
                    }
                }
            }, 2500);
            // Do not keep the process alive just for the watchdog
            if (typeof watchdogTimer.unref === 'function') {
                watchdogTimer.unref();
            }
        }

        telnet.on('connect', () => {
            if (options.debug) {
                options.logger('Connected');
            }

            if (options.init) {
                that.write(options.initCmd);

                if (modeCmd) {
                    that.write(modeCmd);
                }
            }

            telnet.on('data', (data) => {
                for (const line of data.toString().split(/\r?\n/)) {
                    that.parse(line);
                }

                that.patWatchdog();
            });

            that.emit('ready');
        });

        telnet.on('close', () => {
            if (watchdogTimer) {
                clearInterval(watchdogTimer);
                watchdogTimer = null;
            }

            if (options.debug) {
                options.logger('Disconnected');
            }

            that.emit('close');
        });

        telnet.on('error', (ex) => {
            that.emit('error', ex);
        });

        this.close = function (callback) {
            if (closing || telnet.destroyed) {
                if (typeof callback === 'function') {
                    callback();
                }

                return;
            }

            closing = true;

            if (options.init && stopCmd) {
                that.write(stopCmd);
            }

            telnet.end(callback);
        };

        this.write = function (data, callback) {
            if (options.debug) {
                options.logger('->', data);
            }

            telnet.write(data + '\r\n');

            if (typeof callback === 'function') {
                callback(null);
            }
        };
    }

    cmd(...args) {
        let callback;
        if (typeof args[args.length - 1] === 'function') {
            callback = args.pop();
        }

        let c = String(args[0]).toLowerCase();
        args = args.slice(1);

        if (commands[c.toUpperCase()]) {
            c = commands[c.toUpperCase()].toLowerCase();
        }

        if (protocol[c] && typeof protocol[c].cmd === 'function') {
            const message = protocol[c].cmd(...args);
            if (message) {
                this.write(message, callback);
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
    }

    parse(data) {
        if (!data) {
            return;
        }

        data = data.toString();

        const message = this.options.parse ? parseMessage(data, this.options.rssi) : {};

        this.emit('data', data, message);
    }
}

module.exports = Cul;
