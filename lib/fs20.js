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

// http://sourceforge.net/p/fhem/code/HEAD/tree/trunk/fhem/FHEM/10_FS20.pm

// List of commands
// http://fhz4linux.info/tiki-index.php?page=FS20%20Protocol
'use strict';

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
    'sendstate', // 0x17  22
    'off-for-timer', // 0x18  23
    'on-for-timer', // 0x19  24
    'on-old-for-timer', // 0x1A  25
    'reset', // 0x1B  26
    'ramp-on-time', // 0x1C  27     time to reach the desired dim value on dimmers
    'ramp-off-time', // 0x1D  28     time to reach the off state on dimmers
    'on-old-for-timer-prev', // 0x1E  29     old val for timer, then go to prev. state
    'on-100-for-timer-prev' // 0x1F  30     100% for timer, then go to previous state
];

module.exports.parse = function (raw) {
    const message = {};
    message.protocol = 'FS20';

    let command = raw.slice(7, 9);

    message.address = raw.slice(1, 7);
    message.data = {};
    message.data.addressCode = message.address.slice(0, 4);
    message.data.addressCodeElv = hex2elv(message.data.addressCode);
    message.data.addressDevice = message.address.slice(4, 6);
    message.data.addressDeviceElv = hex2elv(message.data.addressDevice);

    const commandNum = parseInt(command, 16);

    message.data.extended = (Boolean(commandNum & 32));
    message.data.bidirectional = (Boolean(commandNum & 64));
    message.data.response = (Boolean(commandNum & 128));

    message.data.cmd = commands[parseInt(command, 16)];

    if (message.isExtended) {
        message.time = 0.25 * (parseInt(raw.slice(9, 11), 16) & 15) * ((2 ^ parseInt(raw.slice(9, 11), 16)) & 240);
        command = raw.slice(7, 11);
    }

    message.data.cmdRaw = command;

    return message;
};

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
module.exports.cmd = function (code, address, command, time, bidi, res) {
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

    if (!code.match(/^[A-F0-9]{4}$/)) {
        return false;
    }

    if (typeof address === 'number') {
        address = ('0' + address.toString(16)).slice(-2);
    }

    address = address.toUpperCase();

    if (address.length > 2) {
        address = elv2hex(address);
    }

    if (!address.match(/^[A-F0-9]{2}$/)) {
        return false;
    }

    if (typeof command === 'number') {
        command = ('0' + command.toString(16)).slice(-2);
    } else if (typeof command === 'string') {
        // Text commands
        if (command.match(/^dim\d+/) && command.slice(-1) !== '%') {
            command += '%';
        }

        if (commands.includes(command)) {
            command = ('0' + (commands.indexOf(command).toString(16))).slice(-2);
        }

        command = command.toUpperCase();
    } else {
        return false;
    }

    if (!command.match(/^[0-9A-F]{2}$/)) {
        return false;
    }

    if (bidi) {
        command = (parseInt(command, 16) | 64).toString(16).toUpperCase();
    }

    if (res) {
        command = (parseInt(command, 16) | 128).toString(16).toUpperCase();
    }

    if (time) {
        // Set extended flag in first commandbyte
        command = (parseInt(command, 16) | 32).toString(16).toUpperCase();
        // Append 2nd byte
        command += seconds2time(time);
        if (!command.match(/^[0-9A-F]{4}$/)) {
            return false;
        }
    }

    return 'F' + code + address + command;
};

function seconds2time(sec) {
    if (!sec) {
        return ('00');
    }

    if (sec > 15360) {
        sec = 15360;
    }

    let tmp;
    for (let i = 0; i <= 12; i++) {
        for (let j = 0; j <= 15; j++) {
            tmp = 0.25 * j * (2 ^ i);
            if (tmp >= sec) {
                return i.toString(16) + j.toString(16);
            }
        }
    }
}

// Elv2hex() by Uwe Langhammer
function elv2hex(val) {
    let i = 0;
    let ret = '';
    while (i < val.length) {
        let ch = val.substr(i, 1);
        if (ch === ' ') {
            i += 1;
        } else {
            let cl = val.substr(i + 1, 1);
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
            ret += r.toString(16).toUpperCase();
            i += 2;
        }
    }

    return ret;
}

// Hex2elv() by Uwe Langhammer
function hex2elv(val) {
    let i = 0;
    let ret = '';
    while (i < val.length) {
        const h = val.substr(i, 1);
        const d = parseInt(h, 16);
        if (d >= 0 && d <= 15) {
            let cl = d & 3;
            let ch = d >> 2;
            cl++;
            ch++;
            if (i && (i % 2 === 0)) {
                ret += ' ';
            }

            ret += ch.toString() + cl.toString();
        } else {
            return false;
        }

        i++;
    }

    return ret;
}
