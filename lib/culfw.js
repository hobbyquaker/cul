'use strict';

// Responses culfw sends that are not RF messages.
//
// So far only the answer to a bare `X`, which culfw prints as two hex digits of the report flags
// followed by the remaining transmit credit right aligned in five characters:
//
//     set_txreport() in a-culfw/culfw/clib/rf_receive.c
//     DH2(TX_REPORT); DU(credit_10ms, 5); DNL();
//
// e.g. "21   900" -> flags 0x21 (known messages + RSSI), 900 * 10 ms of transmit credit left.

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
module.exports.parseReport = function (raw) {
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
};

module.exports.flags = flags;
