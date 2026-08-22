// Responses culfw sends that are not RF messages.
//
// `V`  the firmware version, e.g. "V 1.66 CSM868". Until 1.0.0 this was parsed by lib/moritz.js,
//      because `V` shares its prefix with the MORITZ send command.
// `X`  with no argument, culfw answers with two hex digits of the report flags followed by the
//      remaining transmit credit right aligned in five characters:
//
//          set_txreport() in a-culfw/culfw/clib/rf_receive.c
//          DH2(TX_REPORT); DU(credit_10ms, 5); DNL();
//
//      e.g. "21   900" -> flags 0x21 (known messages + RSSI), 900 * 10 ms of credit left.

// REP_* in a-culfw/culfw/clib/rf_receive.h
const flags = [
    'known', // REP_KNOWN    report known messages
    'repeated', // REP_REPEATED do not filter repeated messages
    'bits', // REP_BITS     report the raw bit data
    'monitor', // REP_MONITOR  monitor mode
    'bintime', // REP_BINTIME  binary time in monitor mode
    'rssi', // REP_RSSI     append the rssi byte
    'fhtproto', // REP_FHTPROTO report FHT protocol messages
    'lcdmon', // REP_LCDMON   LCD monitor
];

const reportPattern = /^([\dA-Fa-f]{2}) +(\d+)$/;

/**
 * Parse the answer to a bare `X`.
 *
 * @param {string} raw the line received from culfw
 * @returns {object|undefined} the parsed message, or undefined if this is not a report
 */
export function parseReport(raw) {
    const match = reportPattern.exec(raw);
    if (!match) {
        return undefined;
    }

    const value = Number.parseInt(match[1], 16);
    const report = {};
    for (const [bit, name] of flags.entries()) {
        report[name] = Boolean(value & (1 << bit));
    }

    return {
        protocol: 'culfw',
        data: {
            reportRaw: match[1].toUpperCase(),
            report,
            // culfw enforces the 1 % duty cycle with this budget, in units of 10 ms
            credit10ms: Number.parseInt(match[2], 10),
        },
    };
}

/**
 * Parse the firmware version response, e.g. `V 1.66 CSM868`.
 *
 * @param {string} raw the line received from culfw
 * @returns {object} the parsed message
 */
export function parse(raw) {
    const message = {protocol: 'culfw', data: {}};
    const parts = raw.split(' ').filter(Boolean);

    if (parts[0] !== 'V' || parts.length < 2) {
        message.data.error = 'unparsable';
        return message;
    }

    message.data.version = parts[1];
    if (parts[2]) {
        message.data.hardware = parts[2];
    }

    return message;
}

export {flags};
