'use strict';

// Hoermann garage door openers.
//
// https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/18_CUL_HOERMANN.pm
//
// Receive: R<10 hex digits>. The structure of the signal is not understood and there is no
// checksum, so bogus messages are to be expected - treat the code as an opaque device id.
// Send: hn<10 hex digits>, needs culfw >= 1.67. The door toggles: open, close or stop depending
// on where it currently is.

module.exports.parse = function (raw) {
    const message = {};
    message.protocol = 'Hoermann';
    message.device = 'HoermannDoor';
    message.data = {};

    if (raw.length !== 11) {
        message.data.error = 'wrong length';
        return message;
    }

    message.address = raw.slice(1, 11).toUpperCase();
    message.data.cmd = 'toggle';

    return message;
};

/**
 * hoermann.cmd
 *
 * @param {string} address 10 hex digits, the code of the hand transmitter
 * @returns {string|false} the raw culfw message
 */
module.exports.cmd = function (address) {
    if (typeof address !== 'string' || !/^[\dA-Fa-f]{10}$/.test(address)) {
        return false;
    }

    return 'hn' + address.toUpperCase();
};
