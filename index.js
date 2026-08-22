/**
 *      CUL/COC/SCC/CUNO / culfw Node.js module
 *      https://github.com/hobbyquaker/cul
 *
 *      Licensed under GPL v2
 *      Copyright (c) 2014-2026 hobbyquaker <hq@ccu.io> and contributors
 */

import {EventEmitter} from 'node:events';
import net from 'node:net';
import {SerialPort, ReadlineParser} from 'serialport';

import {commands, protocol, parseMessage, resolveProtocol, rssiPattern} from './lib/parse.js';

const modes = {
    slowrf: {},
    moritz: {start: 'Zr', stop: 'Zx'},
    asksin: {start: 'Ar', stop: 'Ax'},
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
    // Time the CUL gets to wake up before the init command is written, see
    // https://github.com/hobbyquaker/cul/pull/35
    initTimeout: 2000,
    // Reconnect delay in ms, false or 0 disables reconnecting
    reconnect: 10_000,
    // Open the connection from the constructor. false means open() has to be called
    autoOpen: true,
};

class Cul extends EventEmitter {
    constructor(options = {}) {
        super();

        const config = {...defaultOptions, ...options};
        config.logger = config.logger || console.log;

        if (!modes[String(config.mode).toLowerCase()]) {
            throw new Error(
                'mode "' +
                    config.mode +
                    '" is unknown, use one of ' +
                    Object.keys(modes)
                        .map((m) => '"' + m + '"')
                        .join(', '),
            );
        }

        if (config.connectionMode !== 'serial' && config.connectionMode !== 'telnet') {
            throw new Error('connection mode "' + config.connectionMode + '" is unknown, use "serial" or "telnet"');
        }

        if (config.connectionMode === 'telnet' && !config.host) {
            throw new Error('no host defined');
        }

        if (config.coc) {
            config.baudrate = config.baudrate || 38_400;
            config.serialport = config.serialport || '/dev/ttyACM0';
        } else if (config.scc) {
            config.baudrate = config.baudrate || 38_400;
            config.serialport = config.serialport || '/dev/ttyAMA0';
        } else {
            config.baudrate = config.baudrate || 9600;
            config.serialport = config.serialport || '/dev/ttyAMA0';
        }

        let initCmd = 0x01;
        if (config.rssi) {
            initCmd |= 0x20;
        }

        if (config.repeat) {
            initCmd |= 0x02;
        }

        config.initCmd = 'X' + initCmd.toString(16).padStart(2, '0');

        const mode = modes[String(config.mode).toLowerCase()];
        this.modeCmd = mode.start;
        this.stopCmd = mode.stop;

        this.options = config;
        this.connected = false;

        this.transport = null;
        this.reconnectTimer = null;
        this.initTimer = null;
        this.watchdogTimer = null;
        this.closing = false;

        if (config.signal) {
            if (config.signal.aborted) {
                this.closing = true;
            } else {
                config.signal.addEventListener('abort', () => this.close(), {once: true});
            }
        }

        if (config.autoOpen && !this.closing) {
            // Give the caller a chance to attach listeners before anything can be emitted
            queueMicrotask(() => {
                if (!this.closing) {
                    this.open().catch((error) => this.emit('error', error));
                }
            });
        }
    }

    /**
     * Open the connection. Resolves on `ready`, i.e. after culfw has acknowledged data reporting.
     *
     * @returns {Promise<void>}
     */
    open() {
        if (this.transport) {
            return this.connected ? Promise.resolve() : this.once_('ready');
        }

        this.closing = false;
        const ready = this.once_('ready');
        this.connect();
        return ready;
    }

    /** @returns {Promise<void>} resolves when the named event fires, rejects on `error` */
    once_(event) {
        return new Promise((resolve, reject) => {
            const onEvent = () => {
                this.off('error', onError);
                resolve();
            };

            const onError = (error) => {
                this.off(event, onEvent);
                reject(error);
            };

            this.once(event, onEvent);
            this.once('error', onError);
        });
    }

    connect() {
        if (this.options.connectionMode === 'serial') {
            this.connectSerial();
        } else {
            this.connectTelnet();
        }
    }

    connectSerial() {
        const {options} = this;
        const parser = new ReadlineParser({delimiter: '\r\n'});
        const port = new SerialPort(
            {
                path: options.serialport,
                baudRate: options.baudrate,
                ...(options.binding ? {binding: options.binding} : {}),
            },
            (error) => {
                if (error) {
                    this.handleError(error);
                }
            },
        );

        this.transport = port;
        port.pipe(parser);
        parser.on('data', (data) => this.parse(data));

        port.on('open', () => {
            this.initialise();
        });

        port.on('close', () => this.handleClose());
        port.on('error', (error) => this.handleError(error));
    }

    connectTelnet() {
        const {options} = this;
        const socket = net.createConnection(Number.parseInt(options.port || 2323, 10), options.host);
        this.transport = socket;

        let buffer = '';
        socket.setEncoding('utf8');

        socket.on('connect', () => {
            this.patWatchdog();
            if (options.networkTimeout) {
                this.startWatchdog();
            }

            this.initialise();
        });

        socket.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop();
            for (const line of lines) {
                this.parse(line);
            }

            this.patWatchdog();
        });

        socket.on('close', () => this.handleClose());
        socket.on('error', (error) => this.handleError(error));
    }

    /** Send the init command (and the mode command) and emit `ready` */
    initialise() {
        const {options} = this;

        if (!options.init) {
            this.ready();
            return;
        }

        // Give the CUL enough time to wake up
        this.initTimer = setTimeout(async () => {
            this.initTimer = null;
            try {
                await this.write(options.initCmd);
                if (this.modeCmd) {
                    await this.write(this.modeCmd);
                }

                this.ready();
            } catch (error) {
                this.handleError(error);
            }
        }, options.initTimeout);
    }

    ready() {
        this.connected = true;
        this.emit('ready');
    }

    startWatchdog() {
        this.stopWatchdog();
        this.watchdogTimer = setInterval(() => {
            if (Date.now() - this.watchdog <= 5000) {
                return;
            }

            if (this.watchdogSecondTry) {
                // The answer to the command we wrote has not arrived
                this.handleError(new Error('Connection Timeout!'));
                this.reset();
                this.scheduleReconnect();
            } else {
                // First time: write a simple command and wait for an answer
                this.watchdogSecondTry = true;
                this.watchdog = Date.now();
                this.write('V').catch(() => {});
            }
        }, 2500);
        this.watchdogTimer.unref?.();
    }

    stopWatchdog() {
        if (this.watchdogTimer) {
            clearInterval(this.watchdogTimer);
            this.watchdogTimer = null;
        }
    }

    patWatchdog() {
        this.watchdog = Date.now();
        this.watchdogSecondTry = false;
    }

    handleError(error) {
        this.emit('error', error);

        // A transport that never opened does not always emit 'close' afterwards
        if (!this.connected && this.transport && !this.transport.isOpen && !(this.transport instanceof net.Socket)) {
            this.handleClose();
        }
    }

    handleClose() {
        if (!this.transport) {
            // Already handled - a transport can report both 'error' and 'close'
            return;
        }

        this.reset();
        this.emit('close');
        this.scheduleReconnect();
    }

    reset() {
        this.connected = false;
        this.stopWatchdog();
        if (this.initTimer) {
            clearTimeout(this.initTimer);
            this.initTimer = null;
        }

        this.transport = null;
    }

    scheduleReconnect() {
        if (this.closing || !this.options.reconnect || this.reconnectTimer) {
            return;
        }

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (!this.closing) {
                this.connect();
            }
        }, this.options.reconnect);
        this.reconnectTimer.unref?.();
    }

    /**
     * Close the connection and stop reconnecting.
     *
     * @param {Function} [callback] optional, called when the connection is closed
     * @returns {Promise<void>}
     */
    close(callback) {
        const promise = (async () => {
            this.closing = true;

            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }

            const transport = this.transport;
            if (!transport) {
                this.reset();
                return;
            }

            if (this.options.init && this.stopCmd && this.connected) {
                await this.write(this.stopCmd).catch(() => {});
            }

            // Wait for the transport's own 'close' - that is what drives handleClose(), which
            // resets the state and emits our 'close' event
            await new Promise((resolve) => {
                let done = false;
                const finish = () => {
                    if (!done) {
                        done = true;
                        resolve();
                    }
                };

                transport.once('close', finish);

                if (transport instanceof net.Socket) {
                    transport.end();
                } else if (transport.isOpen) {
                    transport.close(() => {});
                } else {
                    finish();
                }

                // Never hang on a transport that refuses to close
                setTimeout(finish, 2000).unref?.();
            });

            this.reset();
        })();

        return withCallback(promise, callback);
    }

    /**
     * Write a raw message to the CUL.
     *
     * @param {string} data the message, without the trailing CRLF
     * @param {Function} [callback] optional
     * @returns {Promise<void>}
     */
    write(data, callback) {
        const promise = new Promise((resolve, reject) => {
            const transport = this.transport;
            if (!transport) {
                reject(new Error('not connected'));
                return;
            }

            if (this.options.debug) {
                this.options.logger('->', data);
            }

            if (transport instanceof net.Socket) {
                transport.write(data + '\r\n', (error) => (error ? reject(error) : resolve()));
                return;
            }

            transport.write(data + '\r\n', (error) => {
                if (error) {
                    reject(error);
                    return;
                }

                transport.drain((drainError) => (drainError ? reject(drainError) : resolve()));
            });
        });

        return withCallback(promise, callback);
    }

    /**
     * Build a command with one of the protocol modules and send it.
     *
     * @param {string} name protocol name or culfw prefix, e.g. 'FS20', 'it', 'somfy'
     * @param {...any} args protocol arguments, an optional callback last
     * @returns {Promise<string|string[]>} the raw message(s) that were written
     */
    cmd(name, ...args) {
        let callback;
        if (typeof args[args.length - 1] === 'function') {
            callback = args.pop();
        }

        const promise = (async () => {
            let key = String(name).toLowerCase();
            if (commands[String(name)]) {
                key = commands[String(name)].toLowerCase();
            }

            const module = protocol[key];
            if (!module || typeof module.cmd !== 'function') {
                throw new Error('cmd ' + key + ' not implemented');
            }

            const message = module.cmd(...args);
            if (!message) {
                throw new Error('cmd ' + key + ' ' + JSON.stringify(args) + ' failed');
            }

            // A protocol may need more than one message, e.g. FHT sets the central code first
            for (const line of Array.isArray(message) ? message : [message]) {
                await this.write(line);
            }

            return message;
        })();

        return withCallback(promise, callback);
    }

    /**
     * Parse a message and emit `data`. Normally called internally.
     *
     * @param {string} data the line received from culfw
     */
    parse(data) {
        if (!data) {
            return;
        }

        data = data.toString().trim();
        if (!data) {
            return;
        }

        const message = this.options.parse ? parseMessage(data, this.options.rssi) : {};
        this.emit('data', data, message);
    }
}

/** Bridge a promise to an optional node style callback without swallowing rejections */
function withCallback(promise, callback) {
    if (typeof callback !== 'function') {
        return promise;
    }

    promise.then(
        (result) => callback(null, result),
        (error) => callback(error),
    );
    return promise.catch(() => {});
}

export default Cul;
export {Cul, commands, protocol, parseMessage, resolveProtocol, rssiPattern, Cul as 'module.exports'};
