// LoTT UNIRoll roller shutters.
//
// https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/10_UNIRoll.pm
// Needs culfw >= 1.58 for the 'U' send command; older firmware needs the raw 'G' command.
//
//   U<gggg><d><c>
//     gggg  16 bit group address (like a house code)
//     d      4 bit device/channel address, 0..F
//     c      command: B = down, D = stop, E = up
//
// FHEM's UNIRoll_Parse is empty - the protocol has no synchronisation preamble, so culfw does not
// report received frames as 'U' messages. parse() therefore only decodes the echo of a sent frame.

const commands = {
    B: 'down',
    D: 'stop',
    E: 'up',
};

const commandCodes = {
    down: 'B',
    stop: 'D',
    up: 'E',
};

export function parse(raw) {
    const message = {};
    message.protocol = 'UNIRoll';
    message.data = {};

    if (!/^U[\dA-Fa-f]{5}[BDEbde]$/.test(raw)) {
        message.data.error = 'unparsable';
        return message;
    }

    message.address = raw.slice(1, 6).toUpperCase();
    message.data.group = raw.slice(1, 5).toUpperCase();
    message.data.device = raw.slice(5, 6).toUpperCase();
    message.data.cmdRaw = raw.slice(6, 7).toUpperCase();
    message.data.cmd = commands[message.data.cmdRaw];

    return message;
}

/**
 * uniroll.cmd
 *
 * @param {string|number} group  16 bit group address, 4 hex digits or a number
 * @param {string|number} device 4 bit device address, 1 hex digit or a number 0..15
 * @param {string} command       'up', 'down' or 'stop'
 * @returns {string|false} the raw culfw message
 */
export function cmd(group, device, command) {
    const groupHex = hex(group, 4);
    const deviceHex = hex(device, 1);
    if (groupHex === false || deviceHex === false) {
        return false;
    }

    // Anything unknown stops the shutter, which is the safe default
    const code = commandCodes[String(command).toLowerCase()] || 'D';

    return 'U' + groupHex + deviceHex + code;
}

function hex(value, digits) {
    const number = typeof value === 'number' ? value : Number.parseInt(value, 16);
    if (Number.isNaN(number) || number < 0) {
        return false;
    }

    const string = number.toString(16).toUpperCase();
    if (string.length > digits) {
        return false;
    }

    return string.padStart(digits, '0');
}

export {commands};
export {commandCodes};
