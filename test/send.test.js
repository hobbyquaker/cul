'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const it = require('../lib/it.js');
const somfy = require('../lib/somfy.js');
const hoermann = require('../lib/hoermann.js');
const uniroll = require('../lib/uniroll.js');
const {parseMessage} = require('../lib/parse.js');

test('Intertechno', async (t) => {
    await t.test('rotary switch position to house code', () => {
        // 10_IT.pm: house A..P and unit 1..16, followed by the two fixed digits
        assert.equal(it.code('A', 1), '000000000F');
        assert.equal(it.code('P', 16), 'FFFFFFFF0F');
        assert.equal(it.code('L', 12), 'FF0FFF0F0F');
        assert.equal(it.code('A', 17), false);
        assert.equal(it.code('Q', 1), false);
    });

    await t.test('FLS 100 rotary switches', () => {
        assert.equal(it.code('II', 3), 'F0FFFF0F0F');
        assert.equal(it.code('IV', 4), 'FFF0FFF00F');
        assert.equal(it.code('II', 5), false);
    });

    await t.test('sends the culfw default codes for on and off', () => {
        assert.equal(it.cmd('A1', 'on'), 'is000000000FFF');
        assert.equal(it.cmd('A1', 'off'), 'is000000000FF0');
        assert.equal(it.cmd('A1', 'dimup'), 'is000000000F0F');
    });

    await t.test('accepts an explicit house code and an explicit command code', () => {
        assert.equal(it.cmd('FFFFFF0FFF', '0F'), 'isFFFFFF0FFF0F');
        assert.equal(it.cmd('ffffff0fff', 'f0'), 'isFFFFFF0FFFF0');
    });

    await t.test('rejects malformed input', () => {
        assert.equal(it.cmd('FFFFFF0FF', 'on'), false); // too short
        assert.equal(it.cmd('FFFFFF0FFG', 'on'), false); // not tri-state
        assert.equal(it.cmd('FFFFFF0FFF', 'XYZ'), false);
        assert.equal(it.cmd(42, 'on'), false);
    });

    await t.test('passes a complete V3 payload through', () => {
        const v3 = '0'.repeat(32);
        assert.equal(it.cmd(v3), 'is' + v3);
        assert.equal(it.cmd('0'.repeat(31)), false);
    });

    await t.test('clock and repetition', () => {
        assert.equal(it.clock(420), 'it420');
        assert.equal(it.repetition(6), 'isr6');
        assert.equal(it.clock('nope'), false);
    });
});

test('Somfy RTS', async (t) => {
    await t.test('builds the frame documented in 10_SOMFY.pm', () => {
        // Ys key ctrl+cks rollcode a0 a1 a2
        assert.equal(somfy.cmd('A29842', 'up', '0AE3', 'AD'), 'YsAD200AE3A29842');
    });

    await t.test('command aliases', () => {
        assert.equal(somfy.cmd('A29842', 'down', '0001', 'A1').slice(4, 6), '40');
        assert.equal(somfy.cmd('A29842', 'stop', '0001', 'A1').slice(4, 6), '11');
        assert.equal(somfy.cmd('A29842', 'prog', '0001', 'A1').slice(4, 6), '80');
        assert.equal(somfy.cmd('A29842', 'B0', '0001', 'A1').slice(4, 6), 'B0');
    });

    await t.test('rejects a malformed address', () => {
        assert.equal(somfy.cmd('A2984', 'up', '0001', 'A1'), false);
        assert.equal(somfy.cmd('A29842', 'nope', '0001', 'A1'), false);
    });

    await t.test('counters are incremented the way FHEM does', () => {
        assert.equal(somfy.nextRollingCode('0AE3'), '0AE4');
        assert.equal(somfy.nextRollingCode('FFFF'), '0000');
        // the encryption key is masked with 0xAF
        assert.equal(somfy.nextEncKey('A0'), 'A1');
        assert.equal(somfy.nextEncKey('AF'), 'A0');
    });

    await t.test('parses the echo of a sent frame, address bytes swapped back', () => {
        // culfw reverses the address while building the frame and prints the frame
        const message = somfy.parse('Ysad2c0ae34298a2');
        assert.equal(message.protocol, 'Somfy');
        assert.equal(message.address, 'A29842');
        assert.equal(message.data.encKey, 'AD');
        assert.equal(message.data.rollingCode, '0AE3');
        assert.equal(message.data.cmd, 'off');
        assert.equal(message.data.cmdRaw, '2C');
    });

    await t.test('reaches the parser through the dispatcher', () => {
        assert.equal(parseMessage('Ysad2c0ae34298a2').address, 'A29842');
        assert.equal(parseMessage('Ysad2c0ae34298a2').rssi, undefined);
    });

    await t.test('settings commands', () => {
        assert.equal(somfy.symbolWidth(1240), 'Yt1240');
        assert.equal(somfy.repetition(6), 'Yr6');
        assert.equal(somfy.parse('Yr:6').data.echo, 'r:6');
    });
});

test('Hoermann', async (t) => {
    await t.test('sends a toggle', () => {
        assert.equal(hoermann.cmd('0123456789'), 'hn0123456789');
        assert.equal(hoermann.cmd('012345678'), false);
    });

    await t.test('parses a received code', () => {
        const message = parseMessage('R0123456789E5');
        assert.equal(message.protocol, 'Hoermann');
        assert.equal(message.address, '0123456789');
        assert.equal(message.data.cmd, 'toggle');
        assert.equal(message.rssi, -87.5);
    });
});

test('UNIRoll', async (t) => {
    await t.test('builds the send command', () => {
        assert.equal(uniroll.cmd('1234', '0', 'down'), 'U12340B');
        assert.equal(uniroll.cmd(0x1234, 0, 'up'), 'U12340E');
        assert.equal(uniroll.cmd('1234', 'F', 'stop'), 'U1234FD');
    });

    await t.test('unknown commands stop the shutter', () => {
        assert.equal(uniroll.cmd('1234', '0', 'wat'), 'U12340D');
    });

    await t.test('rejects an out of range address', () => {
        assert.equal(uniroll.cmd('12345', '0', 'up'), false);
        assert.equal(uniroll.cmd('1234', '10', 'up'), false);
    });

    await t.test('parses the echo', () => {
        const message = uniroll.parse('U12340B');
        assert.equal(message.protocol, 'UNIRoll');
        assert.equal(message.address, '12340');
        assert.equal(message.data.cmd, 'down');
    });
});
