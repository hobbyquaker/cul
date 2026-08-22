'use strict';

// Somfy RTS roller shutters and awnings.
//
// https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/10_SOMFY.pm
// Needs a firmware with Somfy support (a-culfw, or culfw built with HAS_SOMFY_RTS).
//
// culfw commands:
//   Yt<us>      symbol width in microseconds (culfw default 1240)
//   Yr<n>       number of repetitions (FHEM default 6)
//   Ys<KK><CC><RRRR><AAAAAA>
//               KK   encryption key, incremented with every frame
//               CC   command, upper nibble carries the command, lower nibble is 0
//               RRRR rolling code, incremented with every frame
//               AAAAAA address
//
// Somfy is a rolling code protocol: the receiver only accepts a frame whose rolling code is ahead
// of the last one it saw. This module is stateless - the caller keeps the counters and uses
// nextRollingCode()/nextEncKey() before every send, exactly like FHEM does.
//
// Note the byte order: culfw reverses the three address bytes while building the frame, and prints
// the frame as it goes on air. parse() therefore swaps them back so that the address it reports is
// the one cmd() takes - the same convention 10_SOMFY.pm uses, so addresses from a FHEM
// configuration can be used as they are.

const commands = {
    10: 'go-my',
    11: 'stop',
    20: 'off', // up
    40: 'on', // down
    80: 'prog',
    90: 'wind_sun',
    a0: 'wind_only',
    b0: 'blind',
};

const commandCodes = {
    'go-my': '10',
    my: '10',
    stop: '11',
    off: '20',
    up: '20',
    on: '40',
    down: '40',
    prog: '80',
    wind_sun: '90',
    wind_only: 'A0',
    blind: 'B0',
};

/**
 * somfy.cmd
 *
 * @param {string} address     6 hex digits
 * @param {string} command     'up'/'off', 'down'/'on', 'stop', 'go-my', 'prog', 'wind_sun',
 *                             'wind_only', 'blind', or an explicit 2 digit hex code
 * @param {string|number} rollingCode the rolling code to send, see nextRollingCode()
 * @param {string|number} encKey      the encryption key to send, see nextEncKey(). Default 'A1'
 * @returns {string|false} the raw culfw message
 */
module.exports.cmd = function (address, command, rollingCode, encKey) {
    if (typeof address !== 'string' || !/^[\dA-Fa-f]{6}$/.test(address)) {
        return false;
    }

    let code = String(command).toUpperCase();
    const named = commandCodes[String(command).toLowerCase()];
    if (named) {
        code = named;
    }

    if (!/^[\dA-F]{2}$/.test(code)) {
        return false;
    }

    const rolling = hex(rollingCode === undefined ? 1 : rollingCode, 4);
    const key = hex(encKey === undefined ? 0xa1 : encKey, 2);
    if (rolling === false || key === false) {
        return false;
    }

    return 'Ys' + key + code + rolling + address.toUpperCase();
};

/**
 * Increment the rolling code. Call before every send and persist the result.
 *
 * @param {string|number} rollingCode the previous value
 * @returns {string} 4 hex digits
 */
module.exports.nextRollingCode = function (rollingCode) {
    const value = typeof rollingCode === 'number' ? rollingCode : Number.parseInt(rollingCode || '0', 16);
    return hex((value + 1) & 0xffff, 4);
};

/**
 * Increment the encryption key the way 10_SOMFY.pm does.
 *
 * @param {string|number} encKey the previous value, default 'A0'
 * @returns {string} 2 hex digits
 */
module.exports.nextEncKey = function (encKey) {
    const value = typeof encKey === 'number' ? encKey : Number.parseInt(encKey || 'A0', 16);
    return hex((value + 1) & 0xaf, 2);
};

/**
 * Set the symbol width culfw uses for Somfy frames.
 *
 * @param {number} microseconds culfw default 1240
 * @returns {string|false} the raw culfw message
 */
module.exports.symbolWidth = function (microseconds) {
    const value = Number.parseInt(microseconds, 10);
    if (!(value > 0)) {
        return false;
    }

    return 'Yt' + value;
};

/**
 * Set how often culfw repeats a Somfy frame.
 *
 * @param {number} count repetitions
 * @returns {string|false} the raw culfw message
 */
module.exports.repetition = function (count) {
    const value = Number.parseInt(count, 10);
    if (!(value > 0)) {
        return false;
    }

    return 'Yr' + value;
};

module.exports.parse = function (raw) {
    const message = {};
    message.protocol = 'Somfy';
    message.data = {};

    // Yt / Yr are echoes of a settings command, not a received frame
    if (raw[1] !== 's' && raw[1] !== 'S') {
        message.data.echo = raw.slice(1);
        return message;
    }

    if (raw.length !== 16) {
        message.data.error = 'wrong length';
        return message;
    }

    // The address bytes arrive in reverse order
    message.address = (raw.slice(14, 16) + raw.slice(12, 14) + raw.slice(10, 12)).toUpperCase();
    message.data.encKey = raw.slice(2, 4).toUpperCase();
    message.data.rollingCode = raw.slice(6, 10).toUpperCase();

    // The lower nibble of the control byte is a checksum, only the upper nibble is the command.
    // 'stop' (0x11) and 'go-my' (0x10) are therefore indistinguishable on the receive side.
    message.data.cmdRaw = raw.slice(4, 6).toUpperCase();
    const code = (Number.parseInt(raw.slice(4, 6), 16) & 0xf0).toString(16).padStart(2, '0');
    message.data.cmd = commands[code] || 'UNKNOWN';

    return message;
};

function hex(value, digits) {
    const number = typeof value === 'number' ? value : Number.parseInt(value, 16);
    if (Number.isNaN(number)) {
        return false;
    }

    return number.toString(16).toUpperCase().padStart(digits, '0').slice(-digits);
}

module.exports.commands = commands;
module.exports.commandCodes = commandCodes;
