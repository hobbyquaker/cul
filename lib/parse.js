'use strict';

// Message dispatching: culfw message -> protocol module -> parsed object.
// Kept separate from cul.js so it can be used (and tested) without a connection.

const protocol = {
    em: require('./em.js'),
    esa: require('./esa.js'),
    fht: require('./fht.js'),
    fhttk: require('./fhttk.js'),
    fs20: require('./fs20.js'),
    hms: require('./hms.js'),
    hoermann: require('./hoermann.js'),
    intertechno: require('./it.js'), // alias, cul.cmd('intertechno', ...)
    it: require('./it.js'),
    moritz: require('./moritz.js'),
    somfy: require('./somfy.js'),
    tx: require('./tx.js'),
    uniroll: require('./uniroll.js'),
    ws: require('./ws.js'),
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
    Y: 'Somfy',
    o: 'Obis',
    t: 'TX',
    U: 'UNIRoll',
    K: 'WS',
};

// culfw appends an RSSI byte to RF messages when data reporting is enabled with the RSSI flag (X21).
// Detection is the same as in FHEM's 00_CUL.pm: a known message prefix followed by an even number of hex digits.
const rssiPattern = /^[AFTKEHRStZrib]([\dA-Fa-f]{2})+$/;

/**
 * Pick the parser for a received message. Some culfw prefixes are shared by
 * several protocols and are told apart by the length of the message.
 *
 * @param {string} payload message without the trailing RSSI byte
 * @returns {string|undefined} key into the protocol map
 */
function resolveProtocol(payload) {
    const name = commands[payload[0]];
    if (!name) {
        return undefined;
    }

    // FHT80b sends T + 10 hex digits, the FHT80 TF window/door sensors send T + 8
    if (name === 'FHT' && payload.length === 9) {
        return 'fhttk';
    }

    return name.toLowerCase();
}

/**
 * Parse a message received from culfw.
 *
 * @param {string} data raw message, RSSI byte included
 * @param {boolean} rssi whether culfw appends the RSSI byte
 * @returns {object} parsed message, empty object for unknown messages
 */
function parseMessage(data, rssi = true) {
    let payload = data;
    let value;

    // Strip the RSSI byte before parsing - the protocol parsers work on the plain message
    if (rssi && rssiPattern.test(data)) {
        const raw = Number.parseInt(data.slice(-2), 16);
        value = raw >= 128 ? (raw - 256) / 2 - 74 : raw / 2 - 74;
        payload = data.slice(0, -2);
    }

    const p = resolveProtocol(payload);
    let message = {};

    if (p && protocol[p] && typeof protocol[p].parse === 'function') {
        message = protocol[p].parse(payload) || {};
    }

    if (value !== undefined) {
        message.rssi = value;
    }

    return message;
}

module.exports = {commands, protocol, parseMessage, resolveProtocol, rssiPattern};
