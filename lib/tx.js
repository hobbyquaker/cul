'use strict';

// https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/14_CUL_TX.pm
// http://www.f6fbb.org/domo/sensors/tx3_th.php
//
// LaCrosse TX2/TX3 temperature and humidity sensors.
// Message layout (RSSI already stripped): t<10 hex digits>
//
//   raw[2]     type: '0' = temperature, 'E' = humidity
//   raw[3..4]  sensor id, id = (hex(raw[3]) << 3) + (hex(raw[4]) >> 1)
//   raw[5..7]  value, hex(raw[5]) . raw[6] . '.' . raw[7]
//   raw[8..9]  repetition of raw[5..6], used as a plausibility check

module.exports.parse = function (raw) {
    const message = {};
    message.protocol = 'TX';
    message.device = 'TX2';
    message.data = {};

    if (raw.length < 10) {
        message.data.error = 'message too short';
        return message;
    }

    message.address = String((Number.parseInt(raw[3], 16) << 3) + (Number.parseInt(raw[4], 16) >> 1));

    if (raw[5] !== raw[8] || raw[6] !== raw[9]) {
        message.data.error = 'data error';
        return message;
    }

    const value = Number.parseFloat(Number.parseInt(raw[5], 16) + raw[6] + '.' + raw[7]);

    switch (raw[2].toUpperCase()) {
        case '0':
            message.data.temperature = Math.round((value - 50) * 10) / 10;
            break;
        case 'E':
            message.data.humidity = value;
            break;
        default:
            message.data.error = 'unknown type ' + raw[2];
    }

    return message;
};
