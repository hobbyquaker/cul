import {EventEmitter} from 'node:events';

declare namespace Cul {
    type Callback<T = any> = (err: Error | null | undefined, result?: T) => void;

    type ConnectionMode = 'serial' | 'telnet';
    type Mode = 'SlowRF' | 'MORITZ' | 'AskSin' | 'slowrf' | 'moritz' | 'asksin';

    interface Options {
        /** `serial` (CUL/COC/SCC) or `telnet` (CUNO/CUNO2), default `serial` */
        connectionMode?: ConnectionMode;
        /** serial device, default `/dev/ttyAMA0` (`/dev/ttyACM0` with `coc`) */
        serialport?: string;
        /** default 9600, 38400 with `coc` or `scc` */
        baudrate?: number;
        /** RF mode, default `SlowRF`. An unknown value throws */
        mode?: Mode;
        /** try to parse received messages, default true */
        parse?: boolean;
        /** send the "enable data reporting" command on connect, default true */
        init?: boolean;
        /** COC defaults: baudrate 38400, serialport /dev/ttyACM0 */
        coc?: boolean;
        /** SCC defaults: baudrate 38400, serialport /dev/ttyAMA0 */
        scc?: boolean;
        /** request and decode the signal strength byte, default true */
        rssi?: boolean;
        /** log every command that is sent through `logger`, default false */
        debug?: boolean;
        /** report every repetition of a message instead of filtering them, default false */
        repeat?: boolean;
        /** IP address of the CUNO, required in telnet mode */
        host?: string;
        /** telnet port, default 2323 */
        port?: number | string;
        /** send keep-alive commands to the telnet server, default true */
        networkTimeout?: boolean;
        /** ms the CUL gets to wake up before the init command is written, default 2000 */
        initTimeout?: number;
        /** reconnect delay in ms, default 10000. `false` or `0` disables reconnecting */
        reconnect?: number | false;
        /** open the connection from the constructor, default true */
        autoOpen?: boolean;
        /** close the connection when the signal is aborted */
        signal?: AbortSignal;
        /** function used for the `debug` output, default console.log */
        logger?: (...args: any[]) => void;
        /** serialport binding, mainly for tests (`SerialPortMock.binding`) */
        binding?: unknown;
    }

    /** The parsed representation of a received message */
    interface Message {
        /** `FS20`, `FHT`, `FHTTK`, `HMS`, `EM`, `WS`, `TX`, `MORITZ`, `IT`, `Somfy`, `culfw`, ... */
        protocol?: string;
        /** unique address within the protocol */
        address?: string;
        /** device type name, where the protocol identifies one */
        device?: string;
        /** signal strength in dBm */
        rssi?: number;
        /** true for a prefix culfw uses that has no parser yet; there is no `data` then */
        unknown?: boolean;
        /** the parsed values, protocol specific */
        data?: MessageData;
    }

    interface MessageData {
        /** set when the message could not be decoded */
        error?: string;
        temperature?: number;
        humidity?: number;
        pressure?: number;
        /** true when the device reports a low battery */
        batteryLow?: boolean;
        /** `ok`, `low`, `empty` or `replaced`, depending on what the protocol reports */
        batteryState?: string;
        /** true when a window/door contact is open */
        open?: boolean;
        cmd?: string;
        cmdRaw?: string;
        [key: string]: any;
    }

    interface Events {
        /** connection established and, unless `init` is false, data reporting enabled */
        ready: () => void;
        /** connection closed */
        close: () => void;
        /** a message was received */
        data: (raw: string, message: Message) => void;
        /** the transport reported an error */
        error: (error: Error) => void;
    }
}

/** Parse a message received from culfw without opening a connection */
declare function parseMessage(data: string, rssi?: boolean): Cul.Message;
/** Which protocol module handles a message, given the payload without the RSSI byte */
declare function resolveProtocol(payload: string): string | undefined;
/** culfw message prefix -> protocol name */
declare const commands: Record<string, string>;
/** protocol name -> module with `parse` and/or `cmd` */
declare const protocol: Record<string, {parse?: (raw: string) => Cul.Message; cmd?: (...args: any[]) => any}>;
/** Messages culfw appends an RSSI byte to */
declare const rssiPattern: RegExp;

declare class Cul extends EventEmitter {
    constructor(options?: Cul.Options);

    /** the resolved options, including the defaults */
    readonly options: Required<Pick<Cul.Options, 'connectionMode' | 'mode'>> & Cul.Options & {initCmd: string};
    /** true between `ready` and `close` */
    readonly connected: boolean;
    /** true after `close()` was called; stops the reconnect loop */
    readonly closing: boolean;

    /** Open the connection. Resolves on `ready` */
    open(): Promise<void>;

    /** Close the connection and stop reconnecting */
    close(): Promise<void>;
    close(cb: Cul.Callback<void>): Promise<void>;

    /** Write a raw message, without the trailing CRLF */
    write(data: string): Promise<void>;
    write(data: string, cb: Cul.Callback<void>): Promise<void>;

    /**
     * Build a command with one of the protocol modules and send it.
     * Rejects when the protocol is unknown or the arguments do not produce a message.
     */
    cmd(name: string, ...args: any[]): Promise<string | string[]>;

    /** Parse a message and emit `data`. Normally called internally */
    parse(data: string): void;

    on<E extends keyof Cul.Events>(event: E, listener: Cul.Events[E]): this;
    once<E extends keyof Cul.Events>(event: E, listener: Cul.Events[E]): this;
    off<E extends keyof Cul.Events>(event: E, listener: Cul.Events[E]): this;
}

export default Cul;
export {Cul, commands, protocol, parseMessage, resolveProtocol, rssiPattern};
