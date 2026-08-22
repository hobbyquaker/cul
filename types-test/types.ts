// Type-level test for index.d.ts - compiled with `tsc --noEmit`, never executed.
import Cul, {parseMessage, resolveProtocol, commands, protocol, rssiPattern} from '../index.js';

const cul = new Cul({
    serialport: '/dev/ttyACM0',
    mode: 'SlowRF',
    coc: true,
    rssi: true,
    initTimeout: 2000,
    reconnect: 5000,
    autoOpen: false,
    signal: new AbortController().signal,
    logger: (...args: any[]) => console.log(...args),
});

cul.on('ready', async () => {
    const connected: boolean = cul.connected;
    console.log(connected);

    await cul.write('V');
    cul.write('V', (err) => {
        if (err) console.error(err.message);
    });

    // FS20: housecode, address, command, optional time
    const sent = await cul.cmd('FS20', '6C48', '01', 'on');
    console.log(sent);
    await cul.cmd('FS20', '6C48', '01', 'on-for-timer', 30);

    // Intertechno and Somfy
    await cul.cmd('it', 'A1', 'on');
    await cul.cmd('somfy', 'A29842', 'up', '0AE3', 'AD');

    // FHT returns two messages
    const fht = await cul.cmd('FHT', '1234', '0102', 'desired-temp', '21.5');
    console.log(fht);
});

cul.on('data', (raw: string, message) => {
    const protocolName: string | undefined = message.protocol;
    const address: string | undefined = message.address;
    const rssi: number | undefined = message.rssi;
    console.log(protocolName, address, rssi, raw);

    if (message.data) {
        const temperature: number | undefined = message.data.temperature;
        const batteryLow: boolean | undefined = message.data.batteryLow;
        console.log(temperature, batteryLow, message.data.cmd);
    }

    if (message.unknown) {
        console.log('no parser for', message.protocol);
    }
});

cul.on('error', (error: Error) => console.error(error.message));
cul.on('close', () => console.log('closed'));

async function lifecycle(): Promise<void> {
    await cul.open();
    await cul.close();
    cul.close(() => console.log('closed via callback'));
}

// Parsing without a connection
const parsed = parseMessage('F6C480011E5');
const cmd: string | undefined = parsed.data?.cmd;
console.log(cmd, parseMessage('F6C480011', false));

const key: string | undefined = resolveProtocol('T12345602');
console.log(key, commands.F, rssiPattern.test('F6C480011E5'));
console.log(protocol.fs20?.cmd?.('6C48', '01', 'on'));

void lifecycle();
