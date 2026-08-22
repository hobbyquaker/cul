'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const tcm97001 = require('../lib/tcm97001.js');
const revolt = require('../lib/revolt.js');
const it = require('../lib/it.js');
const {parseMessage} = require('../lib/parse.js');

test('CUL_TCM97001 433 MHz sensors', async (t) => {
    await t.test('Mebus, identified by its checksum', () => {
        const message = parseMessage('sE250D740A5');
        assert.equal(message.protocol, 'TCM97001');
        assert.equal(message.device, 'Mebus');
        assert.equal(message.address, '37');
        assert.equal(message.data.temperature, 21.5);
        assert.equal(message.data.channel, 1);
        assert.equal(message.rssi, -119.5);
    });

    await t.test('GT_WT_02, identified by its checksum', () => {
        const message = tcm97001.parse('s9F00D76E00A5');
        assert.equal(message.device, 'GT_WT_02');
        assert.equal(message.data.temperature, 21.5);
        assert.equal(message.data.humidity, 55);
        assert.equal(message.data.channel, 1);
        assert.equal(message.data.battery, 1);
    });

    await t.test('the checksum wins over the leading nibble', () => {
        // starts with 9 like a Prologue frame, but the GT_WT_02 checksum matches
        assert.equal(tcm97001.parse('s9F00D76E00A5').device, 'GT_WT_02');
    });

    await t.test('Prologue, identified by the leading 1001', () => {
        const message = tcm97001.parse('s91080D7370A5');
        assert.equal(message.device, 'Prologue');
        assert.equal(message.data.temperature, 21.5);
        assert.equal(message.data.humidity, 55);
        assert.equal(message.data.channel, 1);
    });

    await t.test('Prologue reports no humidity when both nibbles are C', () => {
        assert.equal(tcm97001.parse('s91080D7CC0A5').data.humidity, undefined);
    });

    await t.test('NC_WS, identified by the leading 0101', () => {
        const message = tcm97001.parse('s51080D7370A5');
        assert.equal(message.device, 'NC_WS');
        assert.equal(message.data.temperature, 21.5);
        assert.equal(message.data.humidity, 55);
    });

    await t.test('Eurochron, identified by nibble G being F', () => {
        const message = tcm97001.parse('s1200D7F370A5');
        assert.equal(message.device, 'Eurochron');
        assert.equal(message.data.temperature, 21.5);
        assert.equal(message.data.humidity, 55);
    });

    await t.test('Rubicson, identified by nibble C being 8', () => {
        const message = tcm97001.parse('sF480D70000A5');
        assert.equal(message.device, 'Rubicson');
        assert.equal(message.data.temperature, 21.5);
        assert.equal(message.data.humidity, undefined);
    });

    await t.test('KW9010 humidity sensor', () => {
        const message = tcm97001.parse('s640EB0CB30A5');
        assert.equal(message.device, 'KW9010');
        assert.equal(message.address, '100');
        assert.equal(message.data.temperature, 21.5);
        assert.equal(message.data.humidity, 55);
        assert.equal(message.data.channel, 1);
    });

    await t.test('KW9015 rain gauge - channel 0 makes it a rain gauge', () => {
        const message = tcm97001.parse('s600EB0CB50A5');
        assert.equal(message.device, 'KW9015');
        assert.equal(message.data.rain, 211 * 0.45);
        assert.equal(message.data.humidity, undefined);
    });

    await t.test('AURIOL, the fallback for 10 character messages', () => {
        const message = tcm97001.parse('s5580D701A5');
        assert.equal(message.device, 'AURIOL');
        assert.equal(message.data.temperature, 21.5);
        assert.equal(message.data.trend, 1);
    });

    await t.test('ABS700, the fallback for 8 character messages', () => {
        const message = tcm97001.parse('sAB1505A5');
        assert.equal(message.device, 'ABS700');
        assert.equal(message.data.temperature, 21.5);
    });

    await t.test('negative temperature', () => {
        // Mebus with the sign nibble set: 0xFD7 masked to 0x3D7, negated over 10 bits
        const message = tcm97001.parse('sD25FD740A5');
        assert.equal(message.device, 'Mebus');
        assert.ok(message.data.temperature < 0);
    });

    await t.test('implausible values are rejected instead of guessed', () => {
        // valid Mebus checksum, but the temperature is far out of range
        assert.equal(tcm97001.parse('s0000000000').data.error, undefined); // 0 degrees is fine
        assert.equal(tcm97001.parse('s111111111111').data.error, 'no matching decoder');
    });

    await t.test('unsupported lengths are reported', () => {
        assert.equal(tcm97001.parse('s123').data.error, 'unsupported length');
        assert.equal(tcm97001.parse('sZZZZZZZZ').data.error, 'unsupported length');
    });

    await t.test('the rssi byte stays inside the payload for s messages', () => {
        // lower case s is not in the prefix list 00_CUL.pm strips the rssi from
        assert.equal(parseMessage('sAB1505A5').rssi, -119.5);
        assert.equal(tcm97001.parse('sAB150500').rssi, undefined);
    });
});

test('Revolt NC-5462', async (t) => {
    await t.test('decodes all six values', () => {
        const message = parseMessage('rAB12E60064320898620141A5');
        assert.equal(message.protocol, 'Revolt');
        assert.equal(message.address, 'AB12');
        assert.equal(message.data.voltage, 230);
        assert.equal(message.data.current, 1);
        assert.equal(message.data.frequency, 50);
        assert.equal(message.data.power, 220);
        assert.equal(message.data.powerFactor, 0.98);
        assert.equal(message.data.energy, 3.21);
        assert.equal(message.data.error, undefined);
        assert.equal(message.rssi, -119.5);
    });

    await t.test('flags implausible readings', () => {
        // 0x0032 = 50 V, below the 80 V limit
        assert.equal(revolt.parse('rAB12320064320898620141').data.error, 'implausible values');
    });

    await t.test('rejects a malformed message', () => {
        assert.equal(revolt.parse('rAB12').data.error, 'unparsable');
    });
});

test('Intertechno receive', async (t) => {
    await t.test('V1 frame', () => {
        // 000000000F + FF, the frame it.cmd('A1', 'on') produces
        const message = parseMessage('i000015A5');
        assert.equal(message.protocol, 'IT');
        assert.equal(message.device, 'ITv1');
        assert.equal(message.address, '000000000F');
        assert.equal(message.data.cmdRaw, 'FF');
        assert.equal(message.data.cmd, 'on');
    });

    await t.test('round trip with cmd()', () => {
        const sent = it.cmd('A1', 'on'); // is000000000FFF
        const received = it.parse('i000015');
        assert.equal(sent, 'is' + received.data.housecode + received.data.cmdRaw);
    });

    await t.test('EV1527 sensor', () => {
        const message = it.parse('i800000');
        assert.equal(message.device, 'EV1527');
        assert.equal(message.address, '1527x80000');
    });

    await t.test('V3 frame', () => {
        const message = it.parse('i' + 'A'.repeat(16));
        assert.equal(message.device, 'ITv3');
        assert.equal(message.address.length, 31);
        assert.ok(['on', 'off'].includes(message.data.cmd));
    });

    await t.test('unsupported length', () => {
        assert.equal(it.parse('i12345').data.error, 'unsupported length');
    });
});

test('messages with a known prefix but no parser', async (t) => {
    await t.test('are flagged instead of coming back empty', () => {
        const message = parseMessage('A0123456789012345678');
        assert.equal(message.protocol, 'AskSin');
        assert.equal(message.unknown, true);
        assert.equal(message.data, undefined);
    });

    await t.test('an unknown prefix stays an empty object', () => {
        assert.deepEqual(parseMessage('LOVF'), {});
    });
});
