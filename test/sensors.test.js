'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {parseMessage} = require('../lib/parse.js');
const ws = require('../lib/ws.js');
const hms = require('../lib/hms.js');
const tx = require('../lib/tx.js');

test('WS / S300 family', async (t) => {
    await t.test('S300TH temperature and humidity', () => {
        const message = parseMessage('K1145525828');
        assert.equal(message.protocol, 'WS');
        assert.equal(message.device, 'S300TH');
        assert.equal(message.data.temperature, 24.5);
        assert.equal(message.data.humidity, 58.5);
        assert.equal(message.data.addressCode, 2);
    });

    await t.test('negative temperature', () => {
        // First nibble 9 -> address 1, sign bit set
        const message = ws.parse('K91455258');
        assert.equal(message.device, 'S300TH');
        assert.equal(message.data.temperature, -24.5);
    });

    await t.test('WS7000 brightness sensor', () => {
        // First nibble 7 -> WS7000 family, type byte 5 -> brightness, factor nibble 0
        const message = ws.parse('K7512300');
        assert.equal(message.device, 'WS7000-Brightness');
        assert.equal(message.data.brightness, 0x321);
    });

    await t.test('WS7000 rain sensor', () => {
        const message = ws.parse('K72123');
        assert.equal(message.device, 'WS7000-Rain');
        assert.equal(message.data.rain, 0x312);
    });

    await t.test('KS300 weather station', () => {
        const message = ws.parse('K11455258901234');
        assert.equal(message.device, 'KS300');
        assert.equal(message.data.temperature, 24.5);
        assert.equal(message.data.isRaining, false);
        assert.equal(typeof message.data.wind, 'number');
        assert.equal(typeof message.data.rain, 'number');
    });

    await t.test('garbage yields no data', () => {
        assert.deepEqual(ws.parse('KZ'), {protocol: 'WS'});
    });
});

test('HMS family', async (t) => {
    await t.test('HMS100T temperature', () => {
        const message = hms.parse('H123401150200');
        assert.equal(message.protocol, 'HMS');
        assert.equal(message.address, '1234');
        assert.equal(message.device, 'HMS100T');
        assert.equal(message.data.temperature, 21.5);
        assert.equal(message.data.battery, 0);
        assert.equal(message.data.batteryState, 'ok');
        assert.equal(message.data.humidity, undefined);
    });

    await t.test('HMS100TF adds humidity', () => {
        const message = hms.parse('H123400150245');
        assert.equal(message.device, 'HMS100TF');
        assert.equal(message.data.temperature, 21.5);
        assert.equal(message.data.humidity, 45.0);
    });

    await t.test('HMS100T low battery and negative temperature', () => {
        const message = hms.parse('H1234A1150200');
        assert.equal(message.data.temperature, -21.5);
        assert.equal(message.data.battery, 1);
        assert.equal(message.data.batteryState, 'empty');
    });

    await t.test('HMS100TFK reports a switch contact, not a temperature', () => {
        const message = hms.parse('HABCD04010000');
        assert.equal(message.device, 'HMS100TFK');
        assert.equal(message.data.switchDetect, true);
        assert.equal(message.data.temperature, undefined);
    });

    await t.test('HMS100WD water detector', () => {
        assert.equal(hms.parse('HABCD02010000').data.waterDetect, true);
        assert.equal(hms.parse('HABCD02000000').data.waterDetect, false);
    });

    await t.test('RM100-2 smoke detector', () => {
        assert.equal(hms.parse('HABCD03010000').data.smokeDetect, true);
    });

    await t.test('HMS100FIT is found via the lower case type nibble', () => {
        assert.equal(hms.parse('HABCD0E010000').device, 'HMS100FIT');
        assert.equal(hms.parse('HABCD0E010000').data.fiTriggered, true);
    });
});

test('LaCrosse TX2/TX3', async (t) => {
    await t.test('temperature', () => {
        const message = tx.parse('t0012680680');
        assert.equal(message.protocol, 'TX');
        assert.equal(message.address, '9');
        assert.equal(message.data.temperature, 18);
    });

    await t.test('humidity', () => {
        const message = tx.parse('t0E12450450');
        assert.equal(message.data.humidity, 45);
        assert.equal(message.data.temperature, undefined);
    });

    await t.test('detects a corrupt repetition', () => {
        const message = tx.parse('t0012680990');
        assert.equal(message.data.error, 'data error');
    });
});
