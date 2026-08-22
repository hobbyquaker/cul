// Message dispatching: culfw message -> protocol module -> parsed object.
// Kept separate from index.js so it can be used (and tested) without a connection.

import * as culfw from './culfw.js';
import * as em from './em.js';
import * as esa from './esa.js';
import * as fht from './fht.js';
import * as fhttk from './fhttk.js';
import * as fs20 from './fs20.js';
import * as hms from './hms.js';
import * as hoermann from './hoermann.js';
import * as it from './it.js';
import * as moritz from './moritz.js';
import * as revolt from './revolt.js';
import * as somfy from './somfy.js';
import * as tcm97001 from './tcm97001.js';
import * as tx from './tx.js';
import * as uniroll from './uniroll.js';
import * as ws from './ws.js';

const protocol = {
    culfw,
    em,
    esa,
    fht,
    fhttk,
    fs20,
    hms,
    hoermann,
    intertechno: it, // alias, cul.cmd('intertechno', ...)
    it,
    moritz,
    revolt,
    somfy,
    tcm97001,
    tx,
    uniroll,
    ws,
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
    V: 'culfw',
    Z: 'MORITZ',
    Y: 'Somfy',
    i: 'IT',
    o: 'Obis',
    r: 'Revolt',
    s: 'TCM97001',
    t: 'TX',
    U: 'UNIRoll',
    K: 'WS',
};

// culfw appends an RSSI byte to RF messages when data reporting is enabled with the RSSI flag (X21).
// Detection is the same as in FHEM's 00_CUL.pm: a known message prefix followed by an even number
// of hex digits. Note that lower case 's' is deliberately not in the list - CUL_TCM97001 messages
// carry the byte inside the payload, see lib/tcm97001.js.
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

    // The answer to a bare `X` has no message prefix, it is recognised by its shape
    const report = culfw.parseReport(data);
    if (report) {
        return report;
    }

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
    } else if (p) {
        // A prefix culfw uses, but no parser for it yet. Reported so that consumers can log what a
        // user's CUL actually receives. There is no `data`, so generic consumers stay quiet.
        message = {protocol: commands[payload[0]], unknown: true};
    }

    if (value !== undefined) {
        message.rssi = value;
    }

    return message;
}

export {commands, protocol, parseMessage, resolveProtocol, rssiPattern};
