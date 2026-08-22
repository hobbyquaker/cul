/**
 * MORITZ / MAX! (eQ-3) radiator valves, wall thermostats, shutter contacts and push buttons.
 *
 * Originally by Michel Verbraak (https://github.com/1stsetup), rewritten for 1.0.0.
 * GPL v2
 *
 * based on https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/14_CUL_MAX.pm and 10_MAX.pm
 *
 * Message layout (RSSI already stripped):
 *   Z<len:2><msgcnt:2><flag:2><type:2><src:6><dst:6><groupid:2><payload>
 *   len counts the bytes after the len field itself, so the message is 2 * len + 3 characters.
 */

const deviceTypes = {
    0: 'Cube',
    1: 'HeatingThermostat',
    2: 'HeatingThermostatPlus',
    3: 'WallMountedThermostat',
    4: 'ShutterContact',
    5: 'PushButton',
};

const messageTypes = {
    '00': 'PairPing',
    '01': 'PairPong',
    '02': 'Ack',
    '03': 'TimeInformation',

    10: 'ConfigWeekProfile',
    11: 'ConfigTemperatures', // like eco/comfort etc
    12: 'ConfigValve',

    20: 'AddLinkPartner',
    21: 'RemoveLinkPartner',
    22: 'SetGroupId',
    23: 'RemoveGroupId',

    30: 'ShutterContactState',

    40: 'SetTemperature', // to thermostat
    42: 'WallThermostatControl', // by WallMountedThermostat
    // Sending 43/44 without payload to a thermostat sets desiredTemperature to the comfort/eco
    // temperature. We do not use it, we just do SetTemperature.
    43: 'SetComfortTemperature',
    44: 'SetEcoTemperature',

    50: 'PushButtonState',

    60: 'ThermostatState', // by HeatingThermostat

    70: 'WallThermostatState',

    82: 'SetDisplayActualTemperature',

    F1: 'WakeUp',
    F0: 'Reset',
};

const controlModes = {
    0: 'auto',
    1: 'manual',
    2: 'temporary',
    3: 'boost',
};

const weekdays = {0: 'Sat', 1: 'Sun', 2: 'Mon', 3: 'Tue', 4: 'Wed', 5: 'Thu', 6: 'Fri'};

// The device type is only known once a device has sent a message that identifies it. This is
// process wide state, see ROADMAP.md - it moves onto the instance in 1.1.0.
const seenDevices = new Map();

function rememberDevice(address, messageType) {
    switch (messageType) {
        case 'ShutterContactState':
            seenDevices.set(address, deviceTypes[4]);
            break;
        case 'WallThermostatConfig':
        case 'WallThermostatState':
        case 'WallThermostatControl':
        case 'SetTemperature':
            seenDevices.set(address, deviceTypes[3]);
            break;
        case 'HeatingThermostatConfig':
        case 'ThermostatState':
            seenDevices.set(address, deviceTypes[1]);
            break;
        default:
            break;
    }
}

function byte(hex) {
    const result = Number.parseInt(hex, 16);
    return Number.isNaN(result) ? null : result;
}

function bits(value, offset, length) {
    return (value >> offset) & ((1 << length) - 1);
}

function parseDateTime(byte1, byte2, byte3) {
    const result = {};
    result.day = byte1 & 0x1f;
    result.month = ((byte1 & 0xe0) >> 4) | (byte2 >> 7);
    result.year = byte2 & 0x3f;
    const time = byte3 & 0x3f;
    result.time = Math.floor(time / 2) + (time % 2 > 0 ? ':30' : ':00');
    result.str = result.day + '.' + result.month + '.' + result.year + ' ' + result.time;
    return result;
}

/** The status byte every battery powered MAX! device shares */
function statusBits(data, value) {
    data.mode = bits(value, 0, 2);
    data.modeStr = controlModes[data.mode] ?? data.mode;
    data.dstSetting = bits(value, 3, 1); // automatically switching to DST activated
    data.lanGateway = bits(value, 4, 1);
    data.panel = bits(value, 5, 1); // 1 if the device is locked for manual operation
    data.rfError = bits(value, 6, 1); // communication with the link partner failed
    data.batteryLow = Boolean(bits(value, 7, 1));
    data.batteryState = data.batteryLow ? 'low' : 'ok';
}

export function parse(raw) {
    const message = {data: {}};
    const data = message.data;
    message.protocol = 'MORITZ';

    if (raw.charAt(0) !== 'Z') {
        data.error = 'not a MORITZ message';
        return message;
    }

    data.len = byte(raw.slice(1, 3));
    if (2 * data.len + 3 !== raw.length) {
        data.error = 'len mismatch';
        data.strlen = raw.length;
        data.expectedlen = 2 * data.len + 3;
        return message;
    }

    data.msgcnt = byte(raw.slice(3, 5));
    data.msgFlag = raw.slice(5, 7);
    data.msgTypeRaw = raw.slice(7, 9);
    data.msgType = messageTypes[data.msgTypeRaw] || data.msgTypeRaw;
    data.src = raw.slice(9, 15).toLowerCase();
    message.address = data.src;
    data.dst = raw.slice(15, 21).toLowerCase();
    data.groupid = byte(raw.slice(21, 23));
    data.payload = raw.slice(23, 23 + (2 * data.len - 2));

    rememberDevice(data.src, data.msgType);
    if (seenDevices.has(data.src)) {
        message.device = seenDevices.get(data.src);
    }

    if (seenDevices.has(data.dst)) {
        data.dstDevice = seenDevices.get(data.dst);
    }

    let desiredTemperatureRaw = null;
    let measuredTemperature = null;

    switch (data.msgType) {
        case 'RemoveLinkPartner':
        case 'AddLinkPartner':
            data.linkPartner = {
                address: data.payload.slice(0, 6).toLowerCase(),
                device: deviceTypes[byte(data.payload.slice(6, 8))],
            };
            break;

        case 'PairPing': {
            // ($firmware, $type, $testresult, $serial) = unpack("CCCa*", pack("H*", $payload))
            data.firmware = byte(data.payload.slice(0, 2));
            data.type = byte(data.payload.slice(2, 4));
            data.testresult = byte(data.payload.slice(4, 6));
            data.serial = data.payload.slice(6);
            const type = deviceTypes[data.type];
            if (type) {
                message.device = type;
                seenDevices.set(message.address, type);
            }

            break;
        }

        case 'TimeInformation':
            if (data.payload.length === 12) {
                data.year = 2000 + byte(data.payload.slice(0, 2));
                data.day = byte(data.payload.slice(2, 4));
                data.hour = byte(data.payload.slice(4, 6)) & 0x1f;
                data.min = byte(data.payload.slice(6, 8)) & 0x3f;
                data.sec = byte(data.payload.slice(8, 10)) & 0x3f;
                // Guessed the same way FHEM does it
                data.month = ((byte(data.payload.slice(6, 8)) >> 6) << 2) | (byte(data.payload.slice(8, 10)) >> 6);
            }

            break;

        case 'SetTemperature': {
            const value = byte(data.payload.slice(0, 2));
            data.mode = value >> 6;
            data.modeStr = controlModes[data.mode] ?? data.mode;
            const desired = (value & 0x3f) / 2;
            if (desired !== 0) {
                data.desiredTemperature = desired;
            }

            break;
        }

        case 'ConfigTemperatures':
            data.comfortTemperature = byte(data.payload.slice(0, 2)) / 2;
            data.ecoTemperature = byte(data.payload.slice(2, 4)) / 2;
            data.maximumTemperature = byte(data.payload.slice(4, 6)) / 2;
            data.minimumTemperature = byte(data.payload.slice(6, 8)) / 2;
            data.offset = byte(data.payload.slice(8, 10)) / 2 - 3.5;
            data.windowOpenTemperature = byte(data.payload.slice(10, 12)) / 2;
            data.windowOpenTime = byte(data.payload.slice(12, 14)) * 5;
            break;

        case 'WallThermostatControl':
            desiredTemperatureRaw = byte(data.payload.slice(0, 2));
            measuredTemperature = byte(data.payload.slice(2, 4));
            break;

        case 'WallThermostatState': {
            const status = byte(data.payload.slice(0, 2));
            data.displayActualTemperature = byte(data.payload.slice(2, 4));
            desiredTemperatureRaw = byte(data.payload.slice(4, 6));
            const until1 = byte(data.payload.slice(6, 8));
            let heaterTemperature = byte(data.payload.slice(8, 10));
            const until3 = byte(data.payload.slice(10, 12));
            measuredTemperature = byte(data.payload.slice(12, 14));

            statusBits(data, status);

            if ((until3 !== null && until1 > 0) || until3 > 0) {
                data.until = parseDateTime(until1, heaterTemperature, until3);
                heaterTemperature = null;
            }

            if (heaterTemperature !== null) {
                data.heaterTemperature = heaterTemperature;
            }

            break;
        }

        case 'ThermostatState': {
            const status = byte(data.payload.slice(0, 2));
            data.valvePosition = byte(data.payload.slice(2, 4));
            desiredTemperatureRaw = byte(data.payload.slice(4, 6));
            const until1 = byte(data.payload.slice(6, 8));
            const until2 = byte(data.payload.slice(8, 10));
            const until3 = byte(data.payload.slice(10, 12));

            statusBits(data, status);

            if (until3 > 0) {
                data.until = parseDateTime(until1, until2, until3);
            }

            measuredTemperature = until2 > 0 ? ((until1 & 0x01) << 8) + until2 : 0;
            // Outside "temporary" mode the device sends the current temperature instead of an until
            if (data.mode === 2 || measuredTemperature === 0) {
                measuredTemperature = null;
            }

            if (data.mode !== 2) {
                delete data.until;
            }

            break;
        }

        case 'ShutterContactState': {
            const status = byte(data.payload.slice(0, 2));
            data.open = bits(status, 0, 2) !== 0;
            data.unknownBits = bits(status, 2, 4);
            data.rfError = bits(status, 6, 1);
            data.batteryLow = Boolean(bits(status, 7, 1));
            data.batteryState = data.batteryLow ? 'low' : 'ok';
            break;
        }

        case 'PushButtonState': {
            const status = byte(data.payload.slice(0, 2));
            data.onoff = data.payload.slice(2, 4);
            // Guessed from the similarity to the other devices, TODO confirm
            data.lanGateway = bits(status, 4, 1);
            data.rfError = bits(status, 6, 1);
            data.batteryLow = Boolean(bits(status, 7, 1));
            data.batteryState = data.batteryLow ? 'low' : 'ok';
            break;
        }

        case 'ConfigWeekProfile':
            parseWeekProfile(data);
            break;

        default:
            break;
    }

    if (desiredTemperatureRaw !== null) {
        data.desiredTemperature = (desiredTemperatureRaw & 0x7f) / 2;
    }

    if (measuredTemperature !== null) {
        data.measuredTemperature = (((desiredTemperatureRaw & 0x80) << 1) + measuredTemperature) / 10;
    }

    return message;
}

/**
 * Week profile control points.
 *
 * The device stores the time a control point is valid *until*. Since 1.0.0 `hour`/`minute` is the
 * time the control point starts, which is what a schedule normally means, and the raw value is
 * kept as `untilHour`/`untilMinute`. See https://github.com/hobbyquaker/cul/pull/34.
 *
 * payload: <setId:1><weekday:1> then 7 (setId 0) or 6 (setId 1) control points of 4 hex digits,
 * each `(temperature * 2) << 9 | (minutes since midnight / 5)`.
 *
 * @param {object} data the message data object, modified in place
 */
function parseWeekProfile(data) {
    data.setId = data.payload.slice(0, 1);
    const count = data.setId === '0' ? 7 : 6;

    if (data.payload.length < 2 + count * 4) {
        data.error = 'Not enough data for week profile';
        data.expectedlen = 2 + count * 4;
        return;
    }

    data.weekday = data.payload.slice(1, 2);
    data.weekdayStr = weekdays[data.weekday];
    data.controlpoints = [];

    let startHour = 0;
    let startMinute = 0;

    for (let i = 0; i < count; i++) {
        const controlpoint = byte(data.payload.slice(2 + i * 4, 6 + i * 4));
        const temperature = ((controlpoint >> 9) & 0x3f) / 2;
        const time = (controlpoint & 0x1ff) * 5;
        const hour = Math.floor((time / 60) % 24);
        const minute = time % 60;

        data.controlpoints.push({
            temperature,
            hour: startHour,
            minute: startMinute,
            untilHour: hour,
            untilMinute: minute,
        });

        if (hour === 0 && minute === 0) {
            // Midnight ends the day, the remaining slots are unused
            break;
        }

        startHour = hour;
        startMinute = minute;
    }
}

export {deviceTypes, messageTypes, controlModes, seenDevices};
