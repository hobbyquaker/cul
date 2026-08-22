'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {parseMessage, resolveProtocol} = require('../lib/parse.js');

test('rssi handling', async (t) => {
    await t.test('decodes the trailing rssi byte', () => {
        assert.equal(parseMessage('F6C480011E5').rssi, -87.5);
        assert.equal(parseMessage('K1145525828').rssi, -54);
    });

    await t.test('does not invent an rssi for non rf messages', () => {
        const message = parseMessage('V 1.66 CSM868');
        assert.equal(message.rssi, undefined);
        assert.equal(message.protocol, 'MORITZ');
    });

    await t.test('does not strip anything when rssi reporting is off', () => {
        const message = parseMessage('F6C480011', false);
        assert.equal(message.rssi, undefined);
        assert.equal(message.data.cmd, 'on');
    });

    await t.test('unknown message prefixes yield an empty object', () => {
        assert.deepEqual(parseMessage('nonsense'), {});
    });
});

test('protocol resolution', async (t) => {
    await t.test('T with 8 hex digits is an FHT80 TF sensor', () => {
        assert.equal(resolveProtocol('T12345602'), 'fhttk');
    });

    await t.test('T with 10 hex digits is an FHT80b', () => {
        assert.equal(resolveProtocol('T4C5300AA00'), 'fht');
    });

    await t.test('K is the WS/S300 family', () => {
        assert.equal(resolveProtocol('K11455258'), 'ws');
    });
});

test('FS20 through the dispatcher', () => {
    const message = parseMessage('F6C480011E5');
    assert.equal(message.protocol, 'FS20');
    assert.equal(message.address, '6C4800');
    assert.equal(message.data.cmd, 'on');
    assert.equal(message.data.addressCodeElv, '2341 2131');
});

test('EM1000', () => {
    const message = parseMessage('E020563037A01000200EC');
    assert.equal(message.protocol, 'EM');
    assert.equal(message.address, '0205');
    assert.equal(message.device, 'EM1000-EM');
    assert.equal(message.data.seq, 99);
    assert.equal(message.data.total, 31_235);
    assert.equal(message.data.peak, 2);
});

test('FHT80b', () => {
    const message = parseMessage('T4C5300AA00E3');
    assert.equal(message.protocol, 'FHT');
    assert.equal(message.address, '4c53');
    assert.equal(message.data.cmd, 'actuator');
    assert.equal(message.data.valueRaw, '00');
});

test('MORITZ (MAX!)', async (t) => {
    await t.test('wall thermostat control', () => {
        const message = parseMessage('Z0C000442113AD30C4F0D001CB41D');
        assert.equal(message.protocol, 'MORITZ');
        assert.equal(message.address, '113ad3');
        assert.equal(message.device, 'WallMountedThermostat');
        assert.equal(message.data.error, undefined);
        assert.equal(message.data.msgType, 'WallThermostatControl');
        // the payload must not contain the rssi byte
        assert.equal(message.data.payload, '1CB4');
        assert.equal(message.data.desiredTemperature, 14);
        assert.equal(message.data.measuredTemperature, 18);
        assert.equal(message.rssi, -59.5);
    });

    await t.test('shutter contact', () => {
        const message = parseMessage('Z0B4F06300E3F3C1234560012F7');
        assert.equal(message.device, 'ShutterContact');
        assert.equal(message.data.error, undefined);
        assert.equal(message.data.isopen, 1);
        assert.equal(message.data.battery, 'ok');
    });

    await t.test('a truncated message is reported, not decoded', () => {
        assert.equal(parseMessage('Z0C000442113AD30C4F0D00A5').data.error, 'len mismatch');
    });

    await t.test('the culfw version response', () => {
        const message = parseMessage('V 1.66 CSM868');
        assert.equal(message.data.culfw.version, '1.66');
        assert.equal(message.data.culfw.hardware, 'CSM868');
    });
});

test('FHT80 TF window sensor', async (t) => {
    await t.test('window closed', () => {
        const message = parseMessage('T12345602E5');
        assert.equal(message.protocol, 'FHTTK');
        assert.equal(message.device, 'FHT80TF');
        assert.equal(message.address, '123456');
        assert.equal(message.data.window, false);
        assert.equal(message.data.state, 'Window Closed');
        assert.equal(message.data.repetition, false);
        assert.equal(message.data.battery, 0);
    });

    await t.test('window open, retransmission', () => {
        const message = parseMessage('T12345681E5');
        assert.equal(message.data.window, true);
        assert.equal(message.data.repetition, true);
    });

    await t.test('low battery', () => {
        const message = parseMessage('T12345611E5');
        assert.equal(message.data.window, true);
        assert.equal(message.data.battery, 1);
    });
});
