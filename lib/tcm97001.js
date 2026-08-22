'use strict';

// Cheap 433 MHz temperature / humidity sensors, received via culfw's Manchester decoder as
// s<hex>. There is no protocol id on the air - the model is guessed from the message length, a
// fixed nibble and, where the protocol has one, a checksum. Several models are only told apart by
// their checksum, so a message can legitimately match more than one decoder; the first match wins
// and `data.model` says which one it was.
//
// https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/14_CUL_TCM97001.pm
//
// The offsets below index the message *without* the leading 's', as in 14_CUL_TCM97001.pm.
//
// Lower case 's' is not part of the prefix list 00_CUL.pm strips the RSSI byte from, so the byte is
// still at the end of the payload here: a 12 character payload is 10 nibbles of data plus RSSI.
// That is why the decoders below never index past nibble 9, and why this module decodes the RSSI
// itself instead of leaving it to lib/parse.js.

const MIN_TEMPERATURE = -30;
const MAX_TEMPERATURE = 60;

/** nibble at index i */
function n(a, i) {
    return Number.parseInt(a[i], 16);
}

/** the nibbles at the given indexes read as one hex number */
function h(a, ...index) {
    return Number.parseInt(index.map((i) => a[i]).join(''), 16);
}

/**
 * Two's complement on a value of `bits` bits, the way 14_CUL_TCM97001.pm does it.
 *
 * @param {number} value raw value
 * @param {number} bits width of the negated value
 * @returns {number} negative value
 */
function negate(value, bits) {
    const mask = (1 << bits) - 1;
    return -((~value & mask) + 1);
}

/** reverse the bits of every nibble, needed by the KW901x family */
function reverseNibbles(a) {
    return a.map((c) => {
        const value = Number.parseInt(c, 16);
        let reversed = 0;
        for (let i = 0; i < 4; i++) {
            reversed = (reversed << 1) | ((value >> i) & 1);
        }

        return reversed.toString(16).toUpperCase();
    });
}

function plausible(data) {
    if (typeof data.temperature !== 'number' || Number.isNaN(data.temperature)) {
        return false;
    }

    if (data.temperature > MAX_TEMPERATURE || data.temperature < MIN_TEMPERATURE) {
        return false;
    }

    if (data.humidity !== undefined && (data.humidity < 0 || data.humidity > 100)) {
        return false;
    }

    return true;
}

// Checksums, ported from 14_CUL_TCM97001.pm

function crcMebus(a) {
    return ((h(a, 1) + h(a, 2) + h(a, 3) + h(a, 4) + h(a, 5) + h(a, 6) - 1) & 15) === n(a, 0);
}

function crcGtwt02(a) {
    const sum = n(a, 0) + n(a, 1) + n(a, 2) + n(a, 3) + n(a, 4) + n(a, 5) + n(a, 6) + (n(a, 7) & 0xe);
    return sum % 64 === (h(a, 7, 8, 9) & 0x1f8) >> 3;
}

function crcType1(a) {
    const sum = n(a, 0) + n(a, 1) + n(a, 2) + n(a, 3) + n(a, 4) + n(a, 5) + n(a, 6) + n(a, 7);
    return sum === (h(a, 7, 8, 9) & 0x1f8) >> 3;
}

function crcKw901x(a) {
    const r = reverseNibbles(a).map((c) => Number.parseInt(c, 16));
    const sum = (r[0] + r[1] + r[2] + r[3] + r[4] + r[5] + r[6] + r[7]) & 15;
    return sum === r[8];
}

// Decoders, most specific first. Every decoder returns the `data` object or undefined.

const decoders = [
    {
        model: 'Mebus',
        length: 10,
        detect: crcMebus,
        decode(a) {
            let temperature = h(a, 3, 4, 5) & 0x3ff;
            if ((n(a, 3) & 0xc) === 0xc) {
                temperature = negate(temperature, 10);
            }

            return {
                id: h(a, 1, 2),
                temperature: temperature / 10,
                battery: (n(a, 6) & 0x2) >> 1,
                mode: n(a, 6) & 0x1,
                channel: (n(a, 6) & 0xc) >> 2,
            };
        },
    },
    {
        model: 'GT_WT_02',
        length: 12,
        detect: crcGtwt02,
        decode: decodeGtwt02,
    },
    {
        model: 'Type1',
        length: 12,
        detect: crcType1,
        decode: decodeGtwt02,
    },
    {
        model: 'KW901x',
        length: 12,
        detect: crcKw901x,
        decode(a) {
            const r = reverseNibbles(a);
            let temperature = n(r, 3) + n(r, 4) * 16 + n(r, 5) * 256;
            if (n(r, 5) > 3) {
                temperature = negate(temperature, 10);
            }

            const rainHumidity = h(r, 7, 6);
            const channel = (n(a, 1) & 0xc) >> 2;
            const data = {
                id: h(a, 0, 1),
                temperature: temperature / 10,
                battery: ~((n(a, 2) & 0x8) >> 3) & 1,
                channel,
            };

            // KW9015 (TFA 30.3161) is a rain gauge and always sits on channel 0
            if (channel > 0) {
                data.model = 'KW9010';
                data.humidity = rainHumidity - 156;
            } else {
                data.model = 'KW9015';
                data.rain = rainHumidity * 0.45;
            }

            return data;
        },
    },
    {
        model: 'Prologue',
        length: 12,
        // Prologue frames always start with 1001
        detect: (a) => n(a, 0) === 0x9,
        decode(a) {
            let temperature = h(a, 4, 5, 6) & 0x3fff;
            if ((n(a, 4) & 0xc) === 0xc) {
                // 14_CUL_TCM97001.pm negates over 10 bits even though it extracted 14
                temperature = negate(temperature, 10);
            }

            const data = {
                id: h(a, 1, 2),
                temperature: temperature / 10,
                channel: (n(a, 3) & 0x3) + 1,
                battery: ~((n(a, 3) & 0x8) >> 3) & 1,
                mode: (n(a, 3) & 0x4) >> 2,
            };

            // CC in both nibbles means "no humidity sensor"
            if (!(n(a, 7) === 0xc && n(a, 8) === 0xc)) {
                data.humidity = h(a, 7, 8);
            }

            return data;
        },
    },
    {
        model: 'NC_WS',
        length: 12,
        // PEARL NC7159 / LogiLink WS0002, frames always start with 0101
        detect: (a) => n(a, 0) === 0x5,
        decode(a) {
            let temperature = h(a, 4, 5, 6) & 0x7fff;
            if ((n(a, 4) & 0x8) === 0x8) {
                temperature = negate(temperature, 11);
            }

            return {
                id: h(a, 1, 2),
                temperature: temperature / 10,
                humidity: h(a, 7, 8) & 0x7f,
                channel: (n(a, 3) & 0x3) + 1,
                battery: (n(a, 3) & 0x8) >> 3,
                mode: (n(a, 3) & 0x4) >> 2,
            };
        },
    },
    {
        model: 'Eurochron',
        length: 12,
        // EAS 800: nibble G is always 1111
        detect: (a) => n(a, 6) === 0xf,
        decode(a) {
            let temperature = h(a, 3, 4, 5) & 0x7ff;
            if ((n(a, 3) & 0x8) === 0x8) {
                temperature = negate(temperature, 11);
            }

            return {
                id: h(a, 0, 1),
                temperature: temperature / 10,
                humidity: h(a, 7, 8) & 0x7f,
                battery: (n(a, 2) & 0x8) >> 3,
                mode: (n(a, 2) & 0x4) >> 2,
                channel: (n(a, 2) & 0x3) + 1,
            };
        },
    },
    {
        model: 'Rubicson',
        length: 12,
        // nibble C is always 1000
        detect: (a) => n(a, 2) === 0x8,
        decode(a) {
            let temperature = h(a, 3, 4, 5) & 0x3ff;
            if ((n(a, 3) & 0xc) === 0xc) {
                temperature = negate(temperature, 10);
            }

            return {
                id: h(a, 0, 1),
                temperature: temperature / 10,
                channel: 0,
            };
        },
    },
    {
        model: 'AURIOL',
        length: 10,
        // No checksum - last resort for 10 nibble messages
        detect: () => true,
        decode(a) {
            let temperature = h(a, 3, 4, 5) & 0x7ff;
            if ((n(a, 3) & 0x8) === 0x8) {
                temperature = negate(temperature, 11);
            }

            return {
                id: h(a, 0, 1),
                temperature: temperature / 10,
                battery: (n(a, 2) & 0x8) >> 3,
                mode: (n(a, 2) & 0x4) >> 2,
                trend: n(a, 7) & 0x3,
            };
        },
    },
    {
        model: 'ABS700',
        length: 8,
        // No checksum - last resort for 8 nibble messages
        detect: () => true,
        decode(a) {
            let temperature = (h(a, 2, 3) & 0x7f) + n(a, 5) / 10;
            if ((n(a, 2) & 0x8) === 0x8) {
                temperature = -temperature;
            }

            return {
                id: h(a, 0, 1),
                temperature: Math.round(temperature * 10) / 10,
                battery: (n(a, 4) & 0x8) === 0x8 ? 0 : 1,
                mode: (n(a, 4) & 0x4) >> 2,
            };
        },
    },
];

function decodeGtwt02(a) {
    let temperature = h(a, 3, 4, 5) & 0x3ff;
    if ((n(a, 3) & 0xc) === 0xc) {
        temperature = negate(temperature, 10);
    }

    // Only the first 7 bits are the humidity; HH and LL are reported as the range limits
    let humidity = (h(a, 6, 7) & 0xfe) >> 1;
    if (humidity > 100) {
        humidity = 100;
    } else if (humidity < 20) {
        humidity = 20;
    }

    return {
        id: h(a, 0, 1),
        temperature: temperature / 10,
        humidity,
        channel: (n(a, 2) & 0x3) + 1,
        battery: (n(a, 2) & 0x8) === 0x8 ? 0 : 1,
        mode: (n(a, 2) & 0x4) >> 2,
    };
}

module.exports.parse = function (raw) {
    const message = {};
    message.protocol = 'TCM97001';
    message.data = {};

    const payload = raw.slice(1).toUpperCase();
    if (!/^[\dA-F]+$/.test(payload) || ![8, 10, 12, 14].includes(payload.length)) {
        message.data.error = 'unsupported length';
        return message;
    }

    const a = payload.split('');

    // The last byte is the signal strength, culfw reports 00 when it has none
    const rssi = payload.slice(-2);
    if (rssi !== '00') {
        const value = Number.parseInt(rssi, 16);
        message.rssi = value >= 128 ? (value - 256) / 2 - 74 : value / 2 - 74;
    }

    for (const decoder of decoders) {
        if (decoder.length !== payload.length || !decoder.detect(a)) {
            continue;
        }

        const data = decoder.decode(a);
        if (!plausible(data)) {
            continue;
        }

        const model = data.model || decoder.model;
        delete data.model;

        message.device = model;
        message.address = String(data.id);
        delete data.id;
        message.data = data;
        return message;
    }

    message.data.error = 'no matching decoder';
    return message;
};

module.exports.decoders = decoders;
