'use strict';
// ESA protocol implementation for ESA energy counter  @Michael Lorenz 4.3.2018 V0.3

module.exports.parse = function (raw) {
	const message = {};
    //--- setup the device ---------------------
    message.protocol = 'ESA';
    message.device = 'ESAunknown';     // Devicetyp
    message.address = raw.slice(3, 7); // Device

	//--- setup the state data
	message.data = {};
    message.data.seq = raw.slice(1, 3);   // Sequenz, message counter
    message.data.dev = raw.slice(3, 7);   // Device
    message.data.code = raw.slice(7, 11); // Code tells us which Device we have

	//--- setup the Device like Code -----------
	if (message.data.code === '011E') {
	    message.device = 'ESA2000';
		message.data.devtyp = 'ESA2000';
	}

	if (message.data.code === '031E') {
		message.device = 'ESA1000';
 		message.data.devtyp = 'ESA1000';
	}


	 //--- setup the values --------------------
    message.data.tictotal = parseInt(raw.slice(11, 19), 16);
    message.data.ticact = parseInt(raw.slice(19, 23), 16);
    message.data.tictime = parseInt(raw.slice(23, 29), 16);
    message.data.tickwh = parseInt(raw.slice(29, 33), 16);

	 // --- show the implemented esa protocol version for debugging
	 //message.data.ProtVer = 'V0.3.1';

    return message;
};

// --------------- export function ----------------------------------------------
module.exports.cmd = function (code, address, command) {
    return 'S' + code + address + command;
};
