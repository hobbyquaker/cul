'use strict';

// http://sourceforge.net/p/fhem/code/HEAD/tree/trunk/fhem/FHEM/14_CUL_WS.pm

module.exports.parse = function (raw) {
    const message = {};

    message.protocol = 'WS';

    const firstByte = parseInt(raw[1], 16);

    message.address = firstByte & 7;

    const typByte = parseInt(raw[2], 16) & 7;
    let sign = 1;

    if (firstByte & 7) {
        if (typByte === 0 && raw.length > 6) {
            message.device = 'Temp';
            sign = firstByte & 8 ? -1 : 1;
            message.data = {};
            message.data.temperature = sign * parseFloat(raw[6] + raw[3] + '.' + raw[4]);
        } else if (typByte === 1 && raw.length > 8) {
            message.device = 'WS300';
            sign = firstByte & 8 ? -1 : 1;
            message.data = {};
            message.data.temperature = sign * parseFloat(raw[6] + raw[3] + '.' + raw[4]);
            message.data.humidity = parseFloat(raw[7] + raw[8] + '.' + raw[5]);
        }
    } else if (raw.length > 8) {
        message.device = 'S300TH';
        sign = firstByte & 8 ? -1 : 1;
        message.data = {};
        message.data.temperature = sign * parseFloat(raw[6] + raw[3] + '.' + raw[4]);
        message.data.humidity = parseFloat(raw[7] + raw[8] + '.' + raw[5]);
    }

    return message;
};
