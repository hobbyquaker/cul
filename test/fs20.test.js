'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs20 = require('../lib/fs20.js');

test('fs20.cmd', async (t) => {
    await t.test('hex housecode, hex address, hex command', () => {
        assert.equal(fs20.cmd('1A10', '01', '00'), 'F1A100100');
    });

    await t.test('text command without percent sign', () => {
        assert.equal(fs20.cmd('1A10', '01', 'dim06'), 'F1A100101');
    });

    await t.test('text command with percent sign', () => {
        assert.equal(fs20.cmd('1A10', '01', 'dim12%'), 'F1A100102');
    });

    await t.test('elv notation housecode and address', () => {
        assert.equal(fs20.cmd('1112 1314', '1114', 'on'), 'F01230311');
    });

    await t.test('elv notation without space', () => {
        assert.equal(fs20.cmd('32324444', '1112', 'off'), 'F99FF0100');
    });

    await t.test('invalid elv digit returns false', () => {
        assert.equal(fs20.cmd('32524444', '1112', 'off'), false);
    });

    await t.test('invalid hex housecode returns false', () => {
        assert.equal(fs20.cmd('G721', '01', 'off'), false);
    });

    await t.test('numeric address and command', () => {
        assert.equal(fs20.cmd('A721', 0x12, 0x00), 'FA7211200');
    });

    await t.test('bidirectional and response flags', () => {
        // 'on' = 0x11, bidirectional sets bit 6, response sets bit 7
        assert.equal(fs20.cmd('1A10', '01', 'on', 0, true), 'F1A100151');
        assert.equal(fs20.cmd('1A10', '01', 'on', 0, false, true), 'F1A100191');
    });

    await t.test('timer sets the extended flag and appends the time byte', () => {
        const cmd = fs20.cmd('1A10', '01', 'on', 30);
        assert.equal(cmd.slice(0, 7), 'F1A1001');
        // 0x11 | 0x20 = 0x31
        assert.equal(cmd.slice(7, 9), '31');
        assert.equal(cmd.length, 11);
        assert.ok(fs20.time2seconds(cmd.slice(9, 11)) >= 30);
    });
});

test('fs20 time encoding', async (t) => {
    await t.test('0 seconds encodes to 00', () => {
        assert.equal(fs20.seconds2time(0), '00');
    });

    await t.test('round trip stays >= the requested time', () => {
        for (const seconds of [1, 4, 15, 60, 300, 3600, 15_360]) {
            const encoded = fs20.seconds2time(seconds);
            assert.match(encoded, /^[\dA-F]{2}$/);
            assert.ok(
                fs20.time2seconds(encoded) >= seconds,
                seconds + ' s encoded to ' + encoded + ' = ' + fs20.time2seconds(encoded) + ' s',
            );
        }
    });

    await t.test('decodes the FHEM formula (2**i) * j * 0.25', () => {
        // 0x41 -> i = 4, j = 1 -> 16 * 1 * 0.25 = 4
        assert.equal(fs20.time2seconds('41'), 4);
        // 0x0F -> i = 0, j = 15 -> 1 * 15 * 0.25 = 3.75
        assert.equal(fs20.time2seconds('0F'), 3.75);
    });
});

test('fs20.parse', async (t) => {
    await t.test('returns protocol and address', () => {
        const message = fs20.parse('F99FF0100');
        assert.equal(message.protocol, 'FS20');
        assert.equal(message.address, '99FF01');
    });

    await t.test('returns the data properties', () => {
        const message = fs20.parse('F99FF0100');
        assert.deepEqual(message.data, {
            addressCode: '99FF',
            addressCodeElv: '3232 4444',
            addressDevice: '01',
            addressDeviceElv: '1112',
            extended: false,
            bidirectional: false,
            response: false,
            cmd: 'off',
            cmdRaw: '00',
        });
    });

    await t.test('masks the flag bits when looking up the command name', () => {
        // 0x91 = response flag + on
        const message = fs20.parse('F99FF0191');
        assert.equal(message.data.cmd, 'on');
        assert.equal(message.data.response, true);
        assert.equal(message.data.bidirectional, false);
    });

    await t.test('0x16 is "timer", 0x17 is "sendstate"', () => {
        assert.equal(fs20.parse('F99FF0116').data.cmd, 'timer');
        assert.equal(fs20.parse('F99FF0117').data.cmd, 'sendstate');
        assert.equal(fs20.parse('F99FF011F').data.cmd, 'on-100-for-timer-prev');
    });

    await t.test('decodes the extended time byte', () => {
        // 0x39 = extended + on-for-timer(0x19), time byte 0x41 -> 4 s
        const message = fs20.parse('F99FF013941');
        assert.equal(message.data.extended, true);
        assert.equal(message.data.cmd, 'on-for-timer');
        assert.equal(message.data.time, 4);
        assert.equal(message.data.cmdRaw, '3941');
    });
});
