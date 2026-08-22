import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {SerialPortMock} from 'serialport';

// serialport ships its mock binding, so the serial path can be tested without hardware
const MockBinding = SerialPortMock.binding;

import Cul from '../index.js';

/** Let the event loop run so writes reach the other side */
const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

/** Start a local server that plays CUNO, and hand back what it received */
async function culServer(onConnect) {
    const received = [];
    const sockets = new Set();
    const server = net.createServer((socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
        socket.setEncoding('utf8');
        let buffer = '';
        socket.on('data', (chunk) => {
            buffer += chunk;
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop();
            received.push(...lines);
        });
        onConnect?.(socket);
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

    // Always tear down, otherwise a failed assertion leaves the event loop alive
    const stop = async (cul) => {
        await cul?.close().catch(() => {});
        for (const socket of sockets) {
            socket.destroy();
        }

        await new Promise((resolve) => server.close(resolve));
    };

    return {server, received, port: server.address().port, stop};
}

test('telnet transport', async (t) => {
    await t.test('writes the init command and emits ready, data and close', async () => {
        let socket;
        const {received, port, stop} = await culServer((s) => {
            socket = s;
        });

        const cul = new Cul({
            connectionMode: 'telnet',
            host: '127.0.0.1',
            port,
            initTimeout: 10,
            reconnect: false,
        });

        const messages = [];
        cul.on('data', (raw, message) => messages.push([raw, message]));

        try {
            await cul.open();
            assert.equal(cul.connected, true);
            await settle();
            assert.deepEqual(received, ['X21']);

            // Two messages in one chunk, and one split across chunks
            socket.write('F6C480011E5\r\nK114552');
            await settle();
            socket.write('5828\r\n');
            await settle();

            assert.equal(messages.length, 2);
            assert.equal(messages[0][1].protocol, 'FS20');
            assert.equal(messages[1][1].device, 'S300TH');

            const closed = new Promise((resolve) => cul.once('close', resolve));
            await cul.close();
            await closed;
            assert.equal(cul.connected, false);
        } finally {
            await stop(cul);
        }
    });

    await t.test('cmd() writes the built message', async () => {
        const {received, port, stop} = await culServer();
        const cul = new Cul({connectionMode: 'telnet', host: '127.0.0.1', port, initTimeout: 5, reconnect: false});
        try {
            await cul.open();

            await cul.cmd('FS20', '6C48', '01', 'on');
            await cul.cmd('it', 'A1', 'on');
            // FHT needs two messages: the central code first, then the command
            await cul.cmd('FHT', '1234', '0102', 'desired-temp', '21.5');
            await settle();

            assert.deepEqual(received, ['X21', 'F6C480111', 'is000000000FFF', 'T011234', 'T0102412B']);
        } finally {
            await stop(cul);
        }
    });

    await t.test('cmd() rejects for an unknown protocol and an unbuildable message', async () => {
        const {port, stop} = await culServer();
        const cul = new Cul({connectionMode: 'telnet', host: '127.0.0.1', port, initTimeout: 5, reconnect: false});
        try {
            await cul.open();
            await assert.rejects(() => cul.cmd('nope', 1), /not implemented/);
            await assert.rejects(() => cul.cmd('FS20', 'ZZZZ', '01', 'on'), /failed/);
        } finally {
            await stop(cul);
        }
    });

    await t.test('reconnects after the connection drops', async () => {
        let connections = 0;
        const {port, stop} = await culServer((socket) => {
            connections++;
            if (connections === 1) {
                // Drop the first connection once it is established
                setTimeout(() => socket.destroy(), 20);
            }
        });

        const cul = new Cul({
            connectionMode: 'telnet',
            host: '127.0.0.1',
            port,
            initTimeout: 5,
            reconnect: 20,
        });

        cul.on('error', () => {}); // the drop surfaces as an error on some platforms
        try {
            await cul.open();
            const readyAgain = new Promise((resolve) => cul.once('ready', resolve));
            await readyAgain;
            assert.ok(connections >= 2, 'expected a reconnect, got ' + connections + ' connections');
            assert.equal(cul.connected, true);
        } finally {
            await stop(cul);
        }
    });

    await t.test('close() stops the reconnect timer', async () => {
        const {port, stop} = await culServer();
        const cul = new Cul({connectionMode: 'telnet', host: '127.0.0.1', port, initTimeout: 5, reconnect: 20});
        try {
            await cul.open();
            await cul.close();

            let reconnected = false;
            cul.on('ready', () => {
                reconnected = true;
            });
            await settle(60);
            assert.equal(reconnected, false);
        } finally {
            await stop(cul);
        }
    });
});

test('serial transport', async (t) => {
    await t.test('writes the init command and parses incoming lines', async () => {
        MockBinding.createPort('/dev/culmock', {echo: false, record: true});

        const cul = new Cul({
            serialport: '/dev/culmock',
            binding: MockBinding,
            initTimeout: 10,
            reconnect: false,
        });

        const messages = [];
        cul.on('data', (raw, message) => messages.push(message));
        await cul.open();

        assert.equal(cul.transport.port.recording.toString(), 'X21\r\n');

        cul.transport.port.emitData(Buffer.from('F6C480011E5\r\n'));
        await settle();
        assert.equal(messages.length, 1);
        assert.equal(messages[0].protocol, 'FS20');
        assert.equal(messages[0].data.cmd, 'on');

        await cul.close();
        MockBinding.reset();
    });

    await t.test('MORITZ mode sends the mode command and the stop command on close', async () => {
        MockBinding.createPort('/dev/culmock2', {echo: false, record: true});

        const cul = new Cul({
            serialport: '/dev/culmock2',
            binding: MockBinding,
            mode: 'MORITZ',
            initTimeout: 10,
            reconnect: false,
        });

        await cul.open();
        const port = cul.transport.port;
        assert.equal(port.recording.toString(), 'X21\r\nZr\r\n');

        await cul.close();
        assert.equal(port.recording.toString(), 'X21\r\nZr\r\nZx\r\n');
        MockBinding.reset();
    });

    await t.test('write() rejects when there is no connection', async () => {
        const cul = new Cul({autoOpen: false, reconnect: false});
        await assert.rejects(() => cul.write('V'), /not connected/);
    });
});

test('option validation', async (t) => {
    await t.test('an unknown mode throws', () => {
        assert.throws(() => new Cul({mode: 'nope', autoOpen: false}), /mode "nope" is unknown/);
    });

    await t.test('an unknown connection mode throws', () => {
        assert.throws(() => new Cul({connectionMode: 'carrier-pigeon', autoOpen: false}), /connection mode/);
    });

    await t.test('telnet without a host throws', () => {
        assert.throws(() => new Cul({connectionMode: 'telnet', autoOpen: false}), /no host/);
    });

    await t.test('the known modes are accepted', () => {
        for (const mode of ['SlowRF', 'slowrf', 'MORITZ', 'AskSin']) {
            assert.doesNotThrow(() => new Cul({mode, autoOpen: false}));
        }
    });
});

test('AbortSignal', async () => {
    const {port, stop} = await culServer();
    const controller = new AbortController();
    const cul = new Cul({
        connectionMode: 'telnet',
        host: '127.0.0.1',
        port,
        initTimeout: 5,
        reconnect: 20,
        signal: controller.signal,
    });

    try {
        await cul.open();
        assert.equal(cul.connected, true);

        controller.abort();
        await settle(40);
        assert.equal(cul.connected, false);
        assert.equal(cul.closing, true);
    } finally {
        await stop(cul);
    }
});

test('SerialPortMock is available for consumers', () => {
    assert.equal(typeof SerialPortMock, 'function');
});
