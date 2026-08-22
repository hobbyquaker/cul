'use strict';

// Intertechno / classic 433 MHz tri-state remotes.
//
// https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/10_IT.pm
// https://github.com/heliflieger/a-culfw/blob/master/culfw/clib/intertechno.c
//
// culfw commands:
//   it<us>      set the pulse width in microseconds (ITClock, default 420)
//   isr<n>      set the number of repetitions
//   is<data>    send. Every character of <data> is one tri-state digit:
//               '0' -> 0, '1' -> 1, 'D' -> dim, anything else (by convention 'F') -> floating.
//               12 digits are protocol V1, 32 (36 with dim) digits are V3.
//
// V1 frame: 4 digits house code + 4 digits unit + 2 fixed digits + 2 digits command.
// FHEM splits that into a 10 digit "housecode" and a 2 digit on/off code, and so do we.

const TRISTATE = /^[01FD]+$/;

// House code of the A..P rotary switch -> 4 tri-state digits
const houseCodes = {
    A: '0000',
    B: 'F000',
    C: '0F00',
    D: 'FF00',
    E: '00F0',
    F: 'F0F0',
    G: '0FF0',
    H: 'FFF0',
    I: '000F',
    J: 'F00F',
    K: '0F0F',
    L: 'FF0F',
    M: '00FF',
    N: 'F0FF',
    O: '0FFF',
    P: 'FFFF',
};

// Unit 1..16 of the rotary switch -> 4 tri-state digits
const unitCodes = [
    '0000',
    'F000',
    '0F00',
    'FF00',
    '00F0',
    'F0F0',
    '0FF0',
    'FFF0',
    '000F',
    'F00F',
    '0F0F',
    'FF0F',
    '00FF',
    'F0FF',
    '0FFF',
    'FFFF',
];

// FLS 100 rotary switches (I..IV / 1..4)
const flsCodes = {I: '0FFF', II: 'F0FF', III: 'FF0F', IV: 'FFF0'};

// Defaults of the A..P rotary switches, see IT_Define in 10_IT.pm
const commandCodes = {
    on: 'FF',
    off: 'F0',
    dimup: '0F',
    dimdown: '00',
};

/**
 * Build the 10 digit house code of a rotary switch device.
 *
 * @param {string} house 'A'..'P', or 'I'..'IV' for FLS 100
 * @param {number|string} unit 1..16 (1..4 for FLS 100)
 * @returns {string|false} 10 tri-state digits
 */
function code(house, unit) {
    if (typeof house !== 'string') {
        return false;
    }

    const number = Number.parseInt(unit, 10);
    const upper = house.toUpperCase();

    // Intertechno wins over FLS 100 for 'I', like 10_IT.pm does - 'I1' is house I, unit 1
    if (houseCodes[upper]) {
        if (!(number >= 1 && number <= 16)) {
            return false;
        }

        return houseCodes[upper] + unitCodes[number - 1] + '0F';
    }

    // FLS 100 has four positions on both wheels
    const fls = ['I', 'II', 'III', 'IV'];
    if (fls.includes(upper)) {
        if (!(number >= 1 && number <= 4)) {
            return false;
        }

        return flsCodes[upper] + flsCodes[fls[number - 1]] + '0F';
    }

    return false;
}

/**
 * it.cmd
 *
 * @param {string} housecode 10 tri-state digits, a rotary switch position ('A1', 'P16', 'III2'),
 *                           or a complete V3 payload (32 or 36 digits)
 * @param {string} command   'on', 'off', 'dimup', 'dimdown' or an explicit 2 digit tri-state code.
 *                           Omitted for a complete V3 payload.
 * @returns {string|false} the raw culfw message
 */
module.exports.cmd = function (housecode, command) {
    if (typeof housecode !== 'string') {
        return false;
    }

    let payload = housecode.toUpperCase();

    // Rotary switch position, e.g. 'A1' or 'III2'
    const rotary = /^([A-P]|I{1,3}|IV)(\d{1,2})$/i.exec(payload);
    if (rotary) {
        const resolved = code(rotary[1], rotary[2]);
        if (!resolved) {
            return false;
        }

        payload = resolved;
    }

    // A complete V3 payload is passed through
    if (command === undefined) {
        if ((payload.length === 32 || payload.length === 36) && TRISTATE.test(payload)) {
            return 'is' + payload;
        }

        return false;
    }

    if (payload.length !== 10 || !TRISTATE.test(payload)) {
        return false;
    }

    let suffix = String(command).toUpperCase();
    if (commandCodes[String(command).toLowerCase()]) {
        suffix = commandCodes[String(command).toLowerCase()];
    }

    if (suffix.length !== 2 || !TRISTATE.test(suffix)) {
        return false;
    }

    return 'is' + payload + suffix;
};

/**
 * Set the pulse width culfw uses for Intertechno frames.
 *
 * @param {number} microseconds typically 250 ... 470, culfw default 420
 * @returns {string|false} the raw culfw message
 */
module.exports.clock = function (microseconds) {
    const value = Number.parseInt(microseconds, 10);
    if (!(value > 0)) {
        return false;
    }

    return 'it' + value;
};

/**
 * Set how often culfw repeats an Intertechno frame.
 *
 * @param {number} count repetitions
 * @returns {string|false} the raw culfw message
 */
module.exports.repetition = function (count) {
    const value = Number.parseInt(count, 10);
    if (!(value > 0)) {
        return false;
    }

    return 'isr' + value;
};

// Bit pairs to tri-state digits, IT_Parse in 10_IT.pm
const binToTristate = {'00': '0', '01': 'F', 10: 'D', 11: '1'};
const binToTristateV3 = {10: '1', '01': '0', '00': 'D', 11: '2'};

function bits(hex, width) {
    return Number.parseInt(hex, 16).toString(2).padStart(width, '0');
}

module.exports.parse = function (raw) {
    const message = {};
    message.protocol = 'IT';
    message.data = {};

    const payload = raw.slice(1);

    if (raw.length === 7 && /^[\dA-Fa-f]{6}$/.test(payload)) {
        return parseV1(message, bits(payload, 24));
    }

    if (raw.length === 17 && /^[\dA-Fa-f]{16}$/.test(payload)) {
        return parseV3(message, bits(payload.slice(0, 8), 32) + bits(payload.slice(8, 16), 32));
    }

    // 19 characters is IT V3 with a dim level, HomeEasy uses 'ish' / 'ise'
    message.data.error = 'unsupported length';
    return message;
};

function parseV1(message, binary) {
    let msgcode = '';

    for (let i = 0; i + 2 <= binary.length; i += 2) {
        const pair = binary.slice(i, i + 2);
        if (pair !== '10') {
            msgcode += binToTristate[pair];
            continue;
        }

        // '10' is the dim digit and does not occur in a plain V1 frame. 10_IT.pm keeps the house
        // code and takes the last two digits verbatim, or gives up and treats it as EV1527.
        msgcode =
            msgcode.length >= 10
                ? msgcode.slice(0, 10) + binToTristate[binary.slice(20, 22)] + binToTristate[binary.slice(22, 24)]
                : '';
        break;
    }

    if (msgcode) {
        message.device = 'ITv1';
        message.address = msgcode.slice(0, 10);
        message.data.housecode = msgcode.slice(0, 10);
        message.data.cmdRaw = msgcode.slice(-2);
        message.data.cmd = nameOf(message.data.cmdRaw);
        return message;
    }

    // EV1527 sensors (PIR, door contacts, ...) use a plain 20 bit id
    message.device = 'EV1527';
    message.address = '1527x' + Number.parseInt(binary.slice(0, 20), 2).toString(16).padStart(5, '0');
    message.data.housecode = message.address;
    message.data.cmdRaw = binary.slice(20);
    return message;
}

function parseV3(message, binary) {
    let msgcode = '';
    for (let i = 0; i + 2 <= binary.length; i += 2) {
        msgcode += binToTristateV3[binary.slice(i, i + 2)];
    }

    const groupBit = msgcode.slice(26, 27);
    const unit = msgcode.slice(28, 32);

    message.device = 'ITv3';
    message.address = msgcode.slice(0, 26) + groupBit + unit;
    message.data.housecode = message.address;
    message.data.group = groupBit;
    message.data.unit = unit;
    message.data.cmdRaw = msgcode.slice(27, 28);
    message.data.cmd = message.data.cmdRaw === '1' ? 'on' : 'off';

    return message;
}

function nameOf(cmdRaw) {
    for (const [name, value] of Object.entries(commandCodes)) {
        if (value === cmdRaw.toUpperCase()) {
            return name;
        }
    }

    return undefined;
}

module.exports.code = code;
module.exports.commandCodes = commandCodes;
