// https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/14_CUL_WS.pm
//
// Message layout (RSSI already stripped): K<nibbles>
//
//   raw[1]  first byte - lower 3 bits select the sensor address, bit 3 is the sign / a flag
//   raw[2]  type byte (only meaningful for the WS7000 family, i.e. when raw[1] & 7 === 7)
//
// The message length decides the family when raw[1] & 7 !== 7:
//   9 characters  -> S300TH (temperature + humidity)
//  15 characters  -> KS300/2 weather station (temperature, humidity, wind, rain)
//   otherwise     -> WS7000 temperature/humidity sensor

// WS7000 type byte -> device name
const ws7000Devices = {
    0: 'WS7000-Temp',
    1: 'PS50',
    2: 'WS7000-Rain',
    3: 'WS7000-Wind',
    4: 'WS7000-Indoor',
    5: 'WS7000-Brightness',
    6: 'WS7000-Pyro',
    7: 'WS7000-TempHum',
};

function temperature(raw, sign) {
    return sign * Number.parseFloat(raw[6] + raw[3] + '.' + raw[4]);
}

function humidity(raw) {
    return Number.parseFloat(raw[7] + raw[8] + '.' + raw[5]);
}

export function parse(raw) {
    const message = {};
    message.protocol = 'WS';

    const firstByte = Number.parseInt(raw[1], 16);
    if (Number.isNaN(firstByte)) {
        return message;
    }

    const addressBits = firstByte & 7;
    const sign = firstByte & 8 ? -1 : 1;

    // FHEM numbers these sensors 1..8
    message.address = String(addressBits + 1);
    message.data = {};

    if (addressBits === 7) {
        // WS7000 family, the type byte selects the sensor
        const typeByte = Number.parseInt(raw[2], 16) & 7;
        message.device = ws7000Devices[typeByte];

        switch (typeByte) {
            case 0: // Temperature
                if (raw.length > 6) {
                    message.data.temperature = temperature(raw, sign);
                }

                break;
            case 1: // Temperature + humidity (PS50)
            case 7: // Temperature + humidity
                if (raw.length > 8) {
                    message.data.temperature = temperature(raw, sign);
                    message.data.humidity = humidity(raw);
                }

                break;
            case 2: // Rain
                if (raw.length > 5) {
                    message.data.rain = Number.parseInt(raw[5] + raw[3] + raw[4], 16);
                }

                break;
            case 3: // Wind
                if (raw.length > 8) {
                    message.data.wind = Number.parseFloat(raw[6] + raw[3] + '.' + raw[4]) + (firstByte & 8 ? 100 : 0);
                    message.data.windDirection = Number.parseFloat((Number.parseInt(raw[7], 16) & 3) + raw[8] + raw[5]);
                    message.data.windSwing = (Number.parseInt(raw[7], 16) & 6) >> 2;
                }

                break;
            case 4: // Temperature + humidity + pressure (Indoor)
                if (raw.length > 10) {
                    message.data.temperature = temperature(raw, sign);
                    message.data.humidity = humidity(raw);
                    let pressure = Number.parseInt(raw[9] + raw[10], 10) + 900;
                    if (pressure < 930) {
                        pressure += 100;
                    }

                    message.data.pressure = pressure;
                }

                break;
            case 5: {
                // Brightness
                if (raw.length > 6) {
                    const factor = 10 ** (Number.parseInt(raw[6], 10) || 0);
                    message.data.brightness = Number.parseInt(raw[5] + raw[4] + raw[3], 16) * factor;
                }

                break;
            }

            default:
                // 6 = Pyro, was never built
                break;
        }

        return message;
    }

    if (raw.length === 9) {
        message.device = 'S300TH';
        message.data.temperature = temperature(raw, sign);
        message.data.humidity = humidity(raw);
        return message;
    }

    if (raw.length === 15) {
        message.device = 'KS300';
        message.data.temperature = (firstByte & 0xc ? -1 : 1) * Number.parseFloat(raw[6] + raw[3] + '.' + raw[4]);
        message.data.humidity = Number.parseFloat(raw[8] + raw[5]);
        message.data.wind = Number.parseFloat(raw[9] + raw[10] + '.' + raw[7]);
        message.data.rain = (Number.parseInt(raw[14] + raw[11] + raw[12], 16) * 255) / 1000;
        message.data.isRaining = Boolean(firstByte & 2);
        return message;
    }

    if (raw.length > 8) {
        message.device = 'WS7000-TH' + addressBits;
        message.data.temperature = temperature(raw, sign);
        message.data.humidity = humidity(raw);
    }

    return message;
}
