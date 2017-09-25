/* global describe, it */

require('should'); // eslint-disable-line import/no-unassigned-import
const fs20 = require('./../lib/fs20.js');

describe('fs20.cmd', () => {
    it('(\'1A10\', \'01\', \'00\') should return the command string \'F1A100100\'', () => {
        const cmd = fs20.cmd('1A10', '01', '00');
        cmd.should.equal('F1A100100');
    });

    it('(\'1A10\', \'01\', \'dim06\') should return the command string \'F1A100100\'', () => {
        const cmd = fs20.cmd('1A10', '01', 'dim06');
        cmd.should.equal('F1A100101');
    });

    it('(\'1A10\', \'01\', \'dim12%\') should return the command string \'F1A100100\'', () => {
        const cmd = fs20.cmd('1A10', '01', 'dim12%');
        cmd.should.equal('F1A100102');
    });

    it('(\'1A10\', \'01\', \'00\') should return the command string \'F1A100100\'', () => {
        const cmd = fs20.cmd('1A10', '01', '00');
        cmd.should.equal('F1A100100');
    });

    it('(\'1112 1314\', \'1114\', \'on\') should return the command string \'F01230311\'', () => {
        const cmd = fs20.cmd('1112 1314', '1114', 'on');
        cmd.should.equal('F01230317');
    });

    it('(\'32324444\', \'1112\', \'off\') should return the command string \'F99FF0100\'', () => {
        const cmd = fs20.cmd('32324444', '1112', 'off');
        cmd.should.equal('F99FF0100');
    });

    it('(\'32524444\', \'1112\', \'off\') should return false', () => {
        const cmd = fs20.cmd('32524444', '1112', 'off');
        cmd.should.equal(false);
    });

    it('(\'G721\', \'01\', \'off\') should return false', () => {
        const cmd = fs20.cmd('G721', '01', 'off');
        cmd.should.equal(false);
    });
    it('(\'A721\', 0x12, 0x00) should return \'FA7210C00\'', () => {
        const cmd = fs20.cmd('A721', 0x12, 0x00);
        cmd.should.equal('FA7211200');
    });
});

describe('fs20.parse', () => {
    it('(\'F99FF0100\') should return have several mandatory properties', () => {
        const obj = fs20.parse('F99FF0100');
        obj.should.have.property('protocol', 'FS20');
        obj.should.have.property('address', '99FF01');
    });

    it('(\'F99FF0100\') should have several data properties', () => {
        const obj = fs20.parse('F99FF0100');

        obj.should.have.property('data');
        obj.data.should.have.properties({
            addressCode: '99FF',
            addressCodeElv: '3232 4444',
            addressDevice: '01',
            addressDeviceElv: '1112',
            extended: false,
            bidirectional: false,
            response: false,
            cmd: 'off',
            cmdRaw: '00'
        });
    });
});
