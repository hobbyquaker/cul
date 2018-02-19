/*jshint expr: true*/
'use strict';

const chai = require('chai');
const expect = chai.expect;
const Cul = require('../cul');
// Load Serialport with mock bindings
// const SerialPort = require('../test'); // from inside the serialport repo
const SerialPort = require('serialport/test'); // when installed as a package
const MockBinding = SerialPort.Binding;

const portPath = 'COM_MOCK';

var port;
var cul;
var onOpen;
var onData;

describe('test FS20 with mocked serialport', function() {

    before('Init mocked serialport', function(done) {
        MockBinding.createPort(portPath, { echo: false, record: false, readyData: new Buffer('') });
        port = new SerialPort(portPath, function() {
            onOpen = function() {
                console.log('Serialport opened');
            }

            onData = function(data) {
                console.log('Received: ' + data.toString('utf8'));
            }

            port.on('open', onOpen);

            // log received data
            port.on('data', onData);

            cul = new Cul({
                'connectionMode': 'serial',
                'serialport': portPath,
                //'mode': 'SlowRF',
                'debug': true
            });

            // ready event is emitted after serial connection is established and culfw acknowledged data reporting
            cul.on('ready', function () {
                console.log('READY CUL');
                // send arbitrary commands to culfw
                //cul.write('V');
                port.binding.emitData(Buffer.from('F6C480111'));
                done();
            });

            cul.on('data', function (raw) {
                // show raw incoming messages
                console.log('CUL DATA: ' + raw);
            });

        });
    });

    it('check output of two D0 messages', function(done){
        this.timeout(600000); // because of first install from npm

        onData = function(data) {
            console.log('Received: ' + data.toString('utf8'));
            expect(data.toString('utf8')).to.be.equal('F6C480111');
            done();
        }
        cul.write('F6C480111'); // Raw command


    /*    // Write data and confirm it was written
        const message = Buffer.from('Lets write data!');
        port.write(message, () => {
          console.log('Write:\t\t Complete!');
          console.log('Last write:\t', port.binding.lastWrite.toString('utf8'));
        });

        port.on('open', () => {
          // To pretend to receive data (only works on open ports)
          port.binding.emitData(Buffer.from('Hi from my test!'));
      });*/

    });

    after('remove mocked serialport', function(done) {
        // When you're done you can destroy all ports with
        MockBinding.reset();
    });
});
