// Revolt NC-5462 (and compatible) energy meter sockets.
//
// https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/19_Revolt.pm
// Needs a firmware that receives Revolt frames (a-culfw).
//
// Message layout (RSSI already stripped): r<22 hex digits>
//
//   raw[1..4]   device id
//   raw[5..6]   voltage in V
//   raw[7..10]  current, x 0.01 A
//   raw[11..12] frequency in Hz
//   raw[13..16] power, x 0.1 W
//   raw[17..18] power factor, x 0.01
//   raw[19..22] energy, x 0.01 kWh
//
// There is no checksum, so the values are sanity checked the way 19_Revolt.pm does it.

export function parse(raw) {
    const message = {};
    message.protocol = 'Revolt';
    message.device = 'NC-5462';
    message.data = {};

    if (raw.length !== 23 || !/^[\dA-Fa-f]{22}$/.test(raw.slice(1))) {
        message.data.error = 'unparsable';
        return message;
    }

    const hex = (from, to) => Number.parseInt(raw.slice(from, to), 16);

    message.address = raw.slice(1, 5).toUpperCase();

    const voltage = hex(5, 7);
    const current = hex(7, 11) * 0.01;
    const frequency = hex(11, 13);
    const power = hex(13, 17) * 0.1;
    const powerFactor = hex(17, 19) * 0.01;
    const energy = hex(19, 23) * 0.01;

    message.data.voltage = voltage;
    message.data.current = round(current, 2);
    message.data.frequency = frequency;
    message.data.power = round(power, 1);
    message.data.powerFactor = round(powerFactor, 2);
    message.data.energy = round(energy, 2);

    // Plausibility check, see http://www.sknorrell.de/blog/energiemesssung-mit-revolt-nc-5462/
    const pf = powerFactor === 0 ? 0.0001 : powerFactor;
    if (
        voltage < 80 ||
        frequency > 65 ||
        power > 3650 ||
        current > 16 ||
        (power / voltage / pf > 0.00999 && current === 0)
    ) {
        message.data.error = 'implausible values';
    }

    return message;
}

function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
}
