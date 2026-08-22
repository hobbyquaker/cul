// https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/12_HMS.pm
// Message layout (RSSI already stripped): H<address:4><status:1><type:1><values:6>
//
//   raw[1..4]  address (changes with every battery change)
//   raw[5]     status nibble - battery for HMS100T/TF, battery source for the other devices
//   raw[6]     device type
//   raw[7..8]  state byte for the binary sensors (water/switch/smoke/gas/CO/FI)
//   raw[5..12] temperature / humidity nibbles for HMS100T and HMS100TF

const devices = {
    0: 'HMS100TF',
    1: 'HMS100T',
    2: 'HMS100WD',
    3: 'RM100-2',
    4: 'HMS100TFK', // Depending on the onboard jumper it is 4 or 5
    5: 'HMS100TFK',
    6: 'HMS100MG',
    8: 'HMS100CO',
    e: 'HMS100FIT',
};

// The binary sensors report their state in a single field, named like the FHEM reading
const binarySensors = {
    HMS100WD: 'waterDetect',
    'RM100-2': 'smokeDetect',
    HMS100TFK: 'switchDetect',
    HMS100MG: 'gasDetect',
    HMS100CO: 'gasDetect',
    HMS100FIT: 'fiTriggered',
};

const batteryStates = ['ok', 'empty', 'replaced'];

export function parse(raw) {
    const message = {};
    message.protocol = 'HMS';
    message.address = raw.slice(1, 5);

    const value = raw.slice(5);
    message.data = {};

    if (value.length < 8) {
        message.data.error = 'message too short';
        return message;
    }

    const type = Number.parseInt(value[1], 16);
    message.device = devices[value[1].toLowerCase()];

    if (type > 1) {
        // Water/smoke/switch/gas/CO/FI detectors: state in raw[7..8], battery in raw[5]
        const state = Number.parseInt(value.slice(2, 4), 16);
        const battery = (Number.parseInt(value[0], 16) + 1) & 0x0f;

        message.data.batteryState = batteryStates[battery & 8 ? 2 : battery & 4 ? 1 : 0];
        message.data.batteryLow = message.data.batteryState === 'empty';

        const field = binarySensors[message.device];
        if (field) {
            message.data[field] = Boolean(state & 0x0f);
        } else {
            message.data.state = state;
        }

        return message;
    }

    // HMS100T / HMS100TF
    const status1 = Number.parseInt(value[0], 16);
    const sign = status1 & 8 ? -1 : 1;

    message.data.batteryState = batteryStates[status1 & 4 ? 2 : status1 & 2 ? 1 : 0];
    message.data.batteryLow = message.data.batteryState === 'empty';
    message.data.temperature = sign * Number.parseFloat(value[5] + value[2] + '.' + value[3]);

    if (message.device === 'HMS100TF') {
        message.data.humidity = Number.parseFloat(value[6] + value[7] + '.' + value[4]);
    }

    return message;
}
