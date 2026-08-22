'use strict';

// https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/09_CUL_FHTTK.pm
//
// FHT80 TF window/door sensors.
// Message layout (RSSI already stripped): T<6 hex digits id><2 hex digits state>
//
// The sensors repeat their telegram, the repetition sets bit 7 of the state byte.

const states = {
    '01': {state: 'Window Open', window: true},
    '02': {state: 'Window Closed', window: false},
    '0c': {state: 'Sync', sync: true},
    '0f': {state: 'Test Success', test: true},
    11: {state: 'Window Open, Low Batt', window: true, battery: 1},
    12: {state: 'Window Closed, Low Batt', window: false, battery: 1},
};

module.exports.parse = function (raw) {
    const message = {};
    message.protocol = 'FHTTK';
    message.device = 'FHT80TF';
    message.address = raw.slice(1, 7).toLowerCase();
    message.data = {};

    const raw_ = raw.slice(7, 9).toLowerCase();
    // Bit 7 marks a repetition of the previous telegram
    const code = ('0' + (Number.parseInt(raw_, 16) & 0x7f).toString(16)).slice(-2);

    message.data.stateRaw = raw_;
    message.data.repetition = Boolean(Number.parseInt(raw_, 16) & 0x80);

    const known = states[code];
    if (!known) {
        message.data.state = 'UNKNOWN';
        return message;
    }

    message.data.state = known.state;
    message.data.battery = known.battery === undefined ? 0 : known.battery;

    if (known.window !== undefined) {
        message.data.window = known.window;
    }

    if (known.sync) {
        message.data.sync = true;
    }

    if (known.test) {
        message.data.test = true;
    }

    return message;
};
