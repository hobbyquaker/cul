'use strict';
// ESA2000 protocoll implementatation Michael Lorenz 3.3.2018 V0.1

module.exports.parse = function (raw) {
    //var message = {}
    const message = {};
    message.protocol = 'ESA';

    message.device = 'ESA2000'; // Gerätetyp
    message.address = raw.slice(3, 7); // Device

    message.data = {};
    message.data.seq = raw.slice(1, 3); // Sequenz
    message.data.dev = raw.slice(3, 7); // Device
    message.data.code = raw.slice(7, 11); // Code
    message.data.tictotal = parseInt(raw.slice(11, 19), 16);
    message.data.ticact = parseInt(raw.slice(19, 23), 16);
    message.data.ticzeit = parseInt(raw.slice(23, 29), 16);
    message.data.tickwh = parseInt(raw.slice(29, 33), 16);
    message.data.cmd = 1;

    return message;
};

// --------------- EXPORT FUNKTION ---------------------------------------------------
module.exports.cmd = function (code, address, command) {
    return 'S' + code + address + command;
};
