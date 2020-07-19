'use strict';

// http://sourceforge.net/p/fhem/code/HEAD/tree/trunk/fhem/FHEM/12_HMS.pm

const devices = {
    0: 'HMS100TF',
    1: 'HMS100T',
    2: 'HMS100WD',
    3: 'RM100-2',
    4: 'HMS100TFK', // Depending on the onboard jumper it is 4 or 5
    5: 'HMS100TFK',
    6: 'HMS100MG',
    8: 'HMS100CO',
    e: 'HMS100FIT'
};

module.exports.parse = function (raw) {
    const message = {};
    message.protocol = 'HMS';
    message.address = raw.slice(1, 5);

    const value = raw.slice(5);

    // TODO make sure that val[1] really contains the device type! (I can't test, only got one HMS100T)
    message.device = devices[value[1]];

    const status1 = Number.parseInt(value[0], 16);
    const sign = status1 & 8 ? -1 : 1;

    message.data = {};
    message.data.battery = 0;
    if (status1 & 2) {
        message.data.battery = 1;
    }

    if (status1 & 4) {
        message.data.battery = 2;
    }

    if (message.device === 'HMS100WD') {
        const waterDetect = Number.parseFloat(value[3]) === 1;
        message.data.waterDetect = waterDetect;
    } else {
        message.data.temperature = sign * Number.parseFloat(value[5] + value[2] + '.' + value[3]);
    }

    if (message.device === 'HMS100TF') {
        message.data.humidity = Number.parseFloat(value[6] + value[7] + '.' + value[4]);
    }

    return message;
};
