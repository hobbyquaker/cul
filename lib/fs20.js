/**
 *
 *    FS20 parse and cmd
 *  https://github.com/hobbyquaker/cul
 *
 *  8'2014 hobbyquaker <hq@ccu.io>
 *  GPL v2
 *
 *  based on
 *      http://fhem.de (GPL v2 License)
 *      https://github.com/netAction/CUL_FS20 (MIT License) Copyright (c) 2013 Thomas Schmidt (netaction.de)
 *      Uwe Langhammers Javascript implementation of hex2elv() and elv2hex()
 *
 */

// https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/10_FS20.pm

// List of commands
// http://fhz4linux.info/tiki-index.php?page=FS20%20Protocol
// http://www.eecs.iu-bremen.de/archive/bsc-2008/stefanovIvan.pdf
const commands = [
    'off', // 0x00   0
    'dim06%', // 0x01   1
    'dim12%', // 0x02   2
    'dim18%', // 0x03   3
    'dim25%', // 0x04   4
    'dim31%', // 0x05   5
    'dim37%', // 0x06   6
    'dim43%', // 0x07   7
    'dim50%', // 0x08   8
    'dim56%', // 0x09   9
    'dim62%', // 0x0A  10
    'dim68%', // 0x0B  11
    'dim75%', // 0x0C  12
    'dim81%', // 0x0D  13
    'dim87%', // 0x0E  14
    'dim93%', // 0x0F  15
    'dim100%', // 0x10  16
    'on', // 0x11  17     Set to previous dim value (before switching it off)
    'toggle', // 0x12  18     between off and previous dim val
    'dimup', // 0x13  19
    'dimdown', // 0x14  20
    'dimupdown', // 0x15  21
    'timer', // 0x16  22
    'sendstate', // 0x17  23
    'off-for-timer', // 0x18  24
    'on-for-timer', // 0x19  25
    'on-old-for-timer', // 0x1A  26
    'reset', // 0x1B  27
    'ramp-on-time', // 0x1C  28     time to reach the desired dim value on dimmers
    'ramp-off-time', // 0x1D  29     time to reach the off state on dimmers
    'on-old-for-timer-prev', // 0x1E  30     old val for timer, then go to prev. state
    'on-100-for-timer-prev', // 0x1F  31     100% for timer, then go to previous state
];

export function parse(raw) {
    const message = {};
    message.protocol = 'FS20';

    let command = raw.slice(7, 9);

    message.address = raw.slice(1, 7);
    message.data = {};
    message.data.addressCode = message.address.slice(0, 4);
    message.data.addressCodeElv = hex2elv(message.data.addressCode);
    message.data.addressDevice = message.address.slice(4, 6);
    message.data.addressDeviceElv = hex2elv(message.data.addressDevice);

    const commandNumber = Number.parseInt(command, 16);

    message.data.extended = Boolean(commandNumber & 32);
    message.data.bidirectional = Boolean(commandNumber & 64);
    message.data.response = Boolean(commandNumber & 128);

    // The upper three bits are flags, the command itself is in the lower five bits
    message.data.cmd = commands[commandNumber & 0x1f];

    if (message.data.extended && raw.length >= 11) {
        message.data.time = time2seconds(raw.slice(9, 11));
        command = raw.slice(7, 11);
    }

    message.data.cmdRaw = command;

    return message;
}

/**
 *
 * Fs20.cmd
 *
 * @param code          string, the 'house code' - 4 digits hex string or 8 digits elv-notation string
 * @param address       string, device address - 2 digits hex string or 4 digits elv-notation string
 * @param command       string, cmd text or 2 or 4 digits hex string
 * @param time          integer, optional, seconds, automatically sets extended flag
 * @param bidi          boolean, optional, bidirectional flag
 * @param res           boolean, optional, bidirectional response flag
 * @returns object      string (the raw message) or boolean false (on error)
 *
 */
export function cmd(code, address, command, time, bidi, res) {
    if (typeof code === 'number') {
        // Code given as number, convert to 4 digit hexstring
        code = ('000' + code.toString(16)).slice(-4);
    } else if (typeof code !== 'string') {
        return false;
    }

    if (code.length > 4) {
        code = elv2hex(code);
        if (!code) {
            return false;
        }
    }

    code = code.toUpperCase();

    if (!/^[A-F\d]{4}$/.test(code)) {
        return false;
    }

    if (typeof address === 'number') {
        address = ('0' + address.toString(16)).slice(-2);
    } else if (typeof address !== 'string') {
        return false;
    }

    address = address.toUpperCase();

    if (address.length > 2) {
        address = elv2hex(address);
        if (!address) {
            return false;
        }
    }

    if (!/^[A-F\d]{2}$/.test(address)) {
        return false;
    }

    if (typeof command === 'number') {
        command = ('0' + command.toString(16)).slice(-2);
    } else if (typeof command === 'string') {
        // Text commands
        if (/^dim\d+$/.test(command)) {
            command += '%';
        }

        if (commands.includes(command)) {
            command = ('0' + commands.indexOf(command).toString(16)).slice(-2);
        }

        command = command.toUpperCase();
    } else {
        return false;
    }

    if (!/^[\dA-F]{2}$/.test(command)) {
        return false;
    }

    if (bidi) {
        command = byte2hex(Number.parseInt(command, 16) | 64);
    }

    if (res) {
        command = byte2hex(Number.parseInt(command, 16) | 128);
    }

    if (time) {
        // Set extended flag in first commandbyte
        command = byte2hex(Number.parseInt(command, 16) | 32);
        // Append 2nd byte
        command += seconds2time(time);
        if (!/^[\dA-F]{4}$/.test(command)) {
            return false;
        }
    }

    return 'F' + code + address + command;
}

function byte2hex(value) {
    return ('0' + (value & 0xff).toString(16)).slice(-2).toUpperCase();
}

/**
 * Decode the FS20 extended time byte.
 * FHEM 10_FS20.pm: i = (dur & 0xf0) / 16; j = dur & 0xf; dur = (2**i) * j * 0.25
 *
 * @param {string} hex 2 digit hex string
 * @returns {number} seconds
 */
function time2seconds(hex) {
    const value = Number.parseInt(hex, 16);
    if (Number.isNaN(value)) {
        return 0;
    }

    return 2 ** (value >> 4) * (value & 0x0f) * 0.25;
}

/**
 * Encode seconds into the FS20 extended time byte (smallest value >= sec).
 *
 * @param {number} sec seconds, 0 ... 15360
 * @returns {string} 2 digit hex string
 */
function seconds2time(sec) {
    if (!sec) {
        return '00';
    }

    if (sec > 15_360) {
        sec = 15_360;
    }

    for (let i = 0; i <= 12; i++) {
        for (let j = 0; j <= 15; j++) {
            if (0.25 * j * 2 ** i >= sec) {
                return (i.toString(16) + j.toString(16)).toUpperCase();
            }
        }
    }

    return 'FF';
}

// Elv2hex() by Uwe Langhammer
function elv2hex(value) {
    let i = 0;
    let returnValue = '';
    while (i < value.length) {
        let ch = value.substr(i, 1);
        if (ch === ' ') {
            i += 1;
        } else {
            let cl = value.substr(i + 1, 1);
            if (!(ch > 0 && ch < 5)) {
                return false;
            }

            if (cl === '') {
                cl = 1;
            }

            if (!(cl > 0 && cl < 5)) {
                return false;
            }

            ch -= 1;
            cl -= 1;
            const r = (ch << 2) + cl;
            returnValue += r.toString(16).toUpperCase();
            i += 2;
        }
    }

    return returnValue;
}

// Hex2elv() by Uwe Langhammer
function hex2elv(value) {
    let i = 0;
    let returnValue = '';
    while (i < value.length) {
        const h = value.substr(i, 1);
        const d = Number.parseInt(h, 16);
        if (d >= 0 && d <= 15) {
            let cl = d & 3;
            let ch = d >> 2;
            cl++;
            ch++;
            if (i && i % 2 === 0) {
                returnValue += ' ';
            }

            returnValue += ch.toString() + cl.toString();
        } else {
            return false;
        }

        i++;
    }

    return returnValue;
}

export {commands};
export {time2seconds};
export {seconds2time};
