/**
 * FHT80b heating controls: parse and cmd.
 *
 * 11'2017 timroemisch https://github.com/timroemisch, rewritten for 1.0.0
 * GPL v2
 *
 * based on https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/11_FHT.pm
 *
 * Message layout (RSSI already stripped): T<housecode:4><cmd:2><confirm:2><value:2>
 * The FHT80 TF window sensors use the same prefix with 8 hex digits, see lib/fhttk.js.
 */

const codes = {
    '00': 'actuator',
    '01': 'actuator1',
    '02': 'actuator2',
    '03': 'actuator3',
    '04': 'actuator4',
    '05': 'actuator5',
    '06': 'actuator6',
    '07': 'actuator7',
    '08': 'actuator8',

    14: 'mon-from1',
    15: 'mon-to1',
    16: 'mon-from2',
    17: 'mon-to2',
    18: 'tue-from1',
    19: 'tue-to1',
    '1a': 'tue-from2',
    '1b': 'tue-to2',
    '1c': 'wed-from1',
    '1d': 'wed-to1',
    '1e': 'wed-from2',
    '1f': 'wed-to2',
    20: 'thu-from1',
    21: 'thu-to1',
    22: 'thu-from2',
    23: 'thu-to2',
    24: 'fri-from1',
    25: 'fri-to1',
    26: 'fri-from2',
    27: 'fri-to2',
    28: 'sat-from1',
    29: 'sat-to1',
    '2a': 'sat-from2',
    '2b': 'sat-to2',
    '2c': 'sun-from1',
    '2d': 'sun-to1',
    '2e': 'sun-from2',
    '2f': 'sun-to2',

    '3e': 'mode',
    '3f': 'holiday1', // Not verified
    40: 'holiday2', // Not verified
    41: 'desired-temp',
    42: 'measured-low',
    43: 'measured-high',
    44: 'warnings',
    45: 'manu-temp', // No clue what it does

    '4b': 'ack',
    53: 'can-xmit',
    54: 'can-rcv',

    60: 'year',
    61: 'month',
    62: 'day',
    63: 'hour',
    64: 'minute',
    65: 'report1',
    66: 'report2',
    69: 'ack2',

    '7d': 'start-xmit',
    '7e': 'end-xmit',

    82: 'day-temp',
    84: 'night-temp',
    85: 'lowtemp-offset', // Alarm temperature difference
    '8a': 'windowopen-temp',
};

const warnings = ['OK', 'BATT LOW', 'TEMP LOW', 'WINDOW OPEN', 'WINDOW ERR'];

// Values the FHT reports but does not accept
const readonly = new Set([
    'actuator',
    'actuator1',
    'actuator2',
    'actuator3',
    'actuator4',
    'actuator5',
    'actuator6',
    'actuator7',
    'actuator8',
    'ack',
    'ack2',
    'battery',
    'can-xmit',
    'can-rcv',
    'start-xmit',
    'end-xmit',
    'lowtemp',
    'measured-temp',
    'measured-high',
    'measured-low',
    'warnings',
    'window',
    'windowsensor',
]);

const temperatureCodes = new Set(['night-temp', 'day-temp', 'windowopen-temp', 'desired-temp', 'manu-temp']);

// The week program occupies 0x14 ... 0x2f
const WEEK_PROGRAM_FIRST = 0x14;
const WEEK_PROGRAM_LAST = 0x2f;

const codeByName = new Map(Object.entries(codes).map(([code, name]) => [name, code]));

function isWeekProgram(code) {
    return code >= WEEK_PROGRAM_FIRST && code <= WEEK_PROGRAM_LAST;
}

/**
 * The FHT stores a time of day as the number of 10 minute steps since midnight.
 *
 * @param {number} value 0 ... 143
 * @returns {string} 'HH:MM'
 */
function steps2time(value) {
    const hour = Math.floor(value / 6);
    const minute = (value % 6) * 10;
    return String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
}

/**
 * @param {string} time 'HH:MM'
 * @returns {number|false} number of 10 minute steps since midnight
 */
function time2steps(time) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(time));
    if (!match) {
        return false;
    }

    const hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);
    if (hour > 23 || minute > 59) {
        return false;
    }

    return hour * 6 + Math.floor(minute / 10);
}

export function parse(raw) {
    const message = {};
    message.protocol = 'FHT';
    raw = raw.toLowerCase();

    message.address = raw.slice(1, 5);
    message.data = {};
    message.data.addressCode =
        Number.parseInt(message.address.slice(0, 2), 16) * 100 + Number.parseInt(message.address.slice(2, 4), 16);
    message.data.cmdRaw = raw.slice(5, 7);
    message.data.cmd = codes[message.data.cmdRaw] || 'UNKNOWN';
    message.data.confirmRaw = raw.slice(7, 9);
    message.data.valueRaw = raw.slice(9, 11);

    const code = Number.parseInt(message.data.cmdRaw, 16);
    const value = Number.parseInt(message.data.valueRaw, 16);
    if (Number.isNaN(value)) {
        return message;
    }

    if (isWeekProgram(code)) {
        message.data.value = steps2time(value);
        return message;
    }

    switch (message.data.cmd) {
        case 'night-temp':
        case 'day-temp':
        case 'windowopen-temp':
        case 'desired-temp':
        case 'manu-temp':
            message.data.value = value / 2;
            break;
        case 'measured-low':
            message.data.value = value / 10;
            break;
        case 'measured-high':
            message.data.value = value * 25.5;
            break;
        case 'warnings':
            message.data.value = warnings[value] || 'UNKNOWN';
            message.data.batteryLow = Boolean(value & 1);
            break;
        case 'mode':
            message.data.value = value === 0 ? 'AUTO' : 'MANU';
            break;
        default:
            if (message.data.cmd.startsWith('actuator')) {
                // The FHT reports the valve position as 0 ... 255
                message.data.value = Math.round((value / 255) * 1000) / 10;
            }
    }

    return message;
}

/**
 * fht.cmd
 *
 * @param {string} centralCode the central code of the CUL, 4 hex digits
 * @param {string} device      the device code in ELV notation, 4 decimal digits
 * @param {string} command     a command name (see `commands`) or 2 hex digits
 * @param {string|number} value a formatted value ('21.5', 'AUTO', '06:00') or 2 hex digits
 * @returns {string[]|false} the raw culfw messages: setting the central code, then the command
 */
export function cmd(centralCode, device, command, value) {
    if (typeof centralCode !== 'string' || !/^[\dA-Fa-f]{4}$/.test(centralCode)) {
        return false;
    }

    if (typeof device !== 'string' || !/^\d{4}$/.test(device)) {
        return false;
    }

    // The device code is given in ELV notation (decimal), the message carries it as hex
    const deviceCode =
        Number.parseInt(device.slice(0, 2), 10).toString(16).padStart(2, '0') +
        Number.parseInt(device.slice(2, 4), 10).toString(16).padStart(2, '0');

    let code;
    let name;

    if (/^[\dA-Fa-f]{2}$/.test(String(command))) {
        code = String(command).toLowerCase();
        name = codes[code];
    } else {
        name = String(command);
        code = codeByName.get(name);
        if (!code || readonly.has(name)) {
            return false;
        }
    }

    const encoded = encodeValue(code, name, value);
    if (encoded === false) {
        return false;
    }

    return ['T01' + centralCode.toUpperCase(), 'T' + (deviceCode + code + encoded).toUpperCase()];
}

function encodeValue(code, name, value) {
    if (/^[\dA-Fa-f]{2}$/.test(String(value))) {
        return String(value).toLowerCase();
    }

    if (!name) {
        return false;
    }

    if (temperatureCodes.has(name)) {
        const temperature = Number.parseFloat(value);
        if (Number.isNaN(temperature)) {
            return false;
        }

        // The FHT works in half degrees
        return (Math.round(temperature * 2) & 0xff).toString(16).padStart(2, '0');
    }

    if (name === 'mode') {
        if (value === 'AUTO') {
            return '00';
        }

        if (value === 'MANU') {
            return '01';
        }

        return false;
    }

    if (isWeekProgram(Number.parseInt(code, 16))) {
        const steps = time2steps(value);
        if (steps === false) {
            return false;
        }

        return steps.toString(16).padStart(2, '0');
    }

    return false;
}

export {codes as commands, warnings, steps2time, time2steps};
