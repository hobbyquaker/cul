var util =          require('util');
var EventEmitter =  require('events').EventEmitter;
var SerialPort =    require("serialport").SerialPort;

var parse_em =      require('./parse/em.js');
var parse_ks =      require('./parse/ks.js');
var parse_hms =     require('./parse/hms.js');

var Cul = function (options) {
    var that = this;

    var baudrate =      options.baudrate ||     9600;
    var serialport =    options.serialport ||   '/dev/ttyACM0';
    var mode =          options.mode ||         'SlowRF';

    var cmds = {
        'SlowRF':   'X01'
    };

    var initCmd =       options.init || cmds[mode];

    var serialPort = new SerialPort(serialport, {
        baudrate: baudrate
    });

    this.write = function send(data, callback) {
        serialPort.write(data + '\r\n', callback);
    };

    this.close = function (callback) {
        serialPort.close();
    };

    serialPort.on('close', function () {
        that.emit('close');
    });


    serialPort.on("open", function () {

        that.write(initCmd, function (err, res) {
            if (err) throw err;
            if (res) that.emit('ready');
        });

        serialPort.on('data', function (data) {
            data = data.toString();
            var tmp = data.split('\r\n');
            for (var i = 0, l = tmp.length; i < l; i++) {
                if (typeof tmp[i] === 'string' && tmp[i] !== '') parse(tmp[i]);
            }
        });

    });

    function parse(data) {
        var command = data[0];
        var message = {};

        // http://culfw.de/commandref.html
        switch (command) {
            case "F":
                message.protocol = 'FS20';
                break;
            case "T":
                message.protocol = 'FHT';
                break;
            case "E":
                message = parse_em(data);
                message.protocol = 'EM';
                break;
            case "K":
                message = parse_ks(data);
                message.protocol = 'KS';
                break;
            case "H":
                message = parse_hms(data);
                message.protocol = 'HMS';
                break;
            case "S":
                message.protocol = 'ESA2000';
                break;
            case "R":
                message.protocol = 'Hoermann';
                break;
            case "A":
            case "a":
                message.protocol = 'AskSin';
                break;
            case "Z":
            case "z":
                message.protocol = 'MORITZ';
                break;
            case "o":
                message.protocol = 'Obis';
                break;
            case "t":
                message.protocol = 'TX2 / TX3';
                break;
            case "H":
                message.protocol = 'HM485';
                break;
            case "U":
                message.protocol = 'uniroll';
                break;
            default:

        }

        if (message.protocol) {
            that.emit('data', data, message);
        } else {
            that.emit('data', data);
        }

    }

    return this;

};

util.inherits(Cul, EventEmitter);

module.exports = Cul;
