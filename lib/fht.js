'use strict';

/**
 *
 *  FHT parse and cmd
 *
 *  11'2017 timroemisch https://github.com/timroemisch
 *  GPL v2
 *
 *  based on
 *      https://svn.fhem.de/trac/browser/trunk/fhem/FHEM/11_FHT.pm
 *
 */

var codes = {
	"00": "actuator",
	"01": "actuator1",
	"02": "actuator2",
	"03": "actuator3",
	"04": "actuator4",
	"05": "actuator5",
	"06": "actuator6",
	"07": "actuator7",
	"08": "actuator8",

	"14": "mon-from1",
	"15": "mon-to1",
	"16": "mon-from2",
	"17": "mon-to2",
	"18": "tue-from1",
	"19": "tue-to1",
	"1a": "tue-from2",
	"1b": "tue-to2",
	"1c": "wed-from1",
	"1d": "wed-to1",
	"1e": "wed-from2",
	"1f": "wed-to2",
	"20": "thu-from1",
	"21": "thu-to1",
	"22": "thu-from2",
	"23": "thu-to2",
	"24": "fri-from1",
	"25": "fri-to1",
	"26": "fri-from2",
	"27": "fri-to2",
	"28": "sat-from1",
	"29": "sat-to1",
	"2a": "sat-from2",
	"2b": "sat-to2",
	"2c": "sun-from1",
	"2d": "sun-to1",
	"2e": "sun-from2",
	"2f": "sun-to2",

	"3e": "mode",
	"3f": "holiday1", // Not verified
	"40": "holiday2", // Not verified
	"41": "desired-temp",
	"42": "measured-low",
	"43": "measured-high",
	"44": "warnings",
	"45": "manu-temp", // No clue what it does.

	"4b": "ack",
	"53": "can-xmit",
	"54": "can-rcv",

	"60": "year",
	"61": "month",
	"62": "day",
	"63": "hour",
	"64": "minute",
	"65": "report1",
	"66": "report2",
	"69": "ack2",

	"7d": "start-xmit",
	"7e": "end-xmit",

	"82": "day-temp",
	"84": "night-temp",
	"85": "lowtemp-offset", // Alarm-Temp.-Differenz
	"8a": "windowopen-temp"
};

var warnings = [
	'OK',
	'BATT LOW',
	'TEMP LOW',
	'WINDOW OPEN',
	'WINDOW ERR'
];

var readonly = [
	"actuator",
	"actuator1",
	"actuator2",
	"actuator3",
	"actuator4",
	"actuator5",
	"actuator6",
	"actuator7",
	"actuator8",

	"ack",
	"ack2",
	"battery",
	"can-xmit",
	"can-rcv",
	"start-xmit",
	"end-xmit",

	"lowtemp",
	"measured-temp",
	"measured-high",
	"measured-low",
	"warnings",
	"window",
	"windowsensor"
];

module.exports.parse = function(raw) {
	var message = {}
	message.protocol = 'FHT';
	raw = raw.toLowerCase();

	message.address = raw.slice(1, 5);

	message.data = {};
	message.data.cmdRaw = raw.slice(5, 7);
	message.data.addressCode = parseInt(message.address.slice(0, 2), 16) * 100 + parseInt(message.address.slice(2, 4), 16);
	message.data.cmd = codes[message.data.cmdRaw] ? codes[message.data.cmdRaw] : "UNKNOWN";
	message.data.valueRaw = raw.slice(9, 11);

	// convert hex String to int
	var intCmd = parseInt(message.data.cmdRaw, 16);
	var intVal = parseInt(message.data.valueRaw, 16);
	// message.data.valueRawInt = intVal;

	// convert some known cmd´s
	// and save it in value
	switch (message.data.cmd) {

		case 'night-temp':
		case 'day-temp':
		case 'windowopen-temp':
		case 'desired-temp':
			message.data.value = intVal / 2;
			break;
		case 'measured-low':
			message.data.value = intVal * 0.1;
			break;
		case 'measured-high':
			message.data.value = intVal * 25.5;
			break;
		case 'warnings':
			message.data.value = warnings[intVal] ? warnings[intVal] : "UNKNOWN";
			break;
		case 'mode':
			message.data.value = intVal == 0 ? "AUTO" : "MANU";
			break;
	}

	// check if the weekly program is send
	if (intCmd >= 20 && intCmd <= 47) {
		var hour = Math.floor(intVal / 6);
		var minute = intVal - (hour * 6);
		message.data.value = hour + ':' + minute + '0'; // add everything together
	}

	// make every value to string
	if (message.data.value) {
		message.data.value = message.data.value.toString();
	}

	return message;
};

/**
 *
 * fht.cmd
 *
 * @param centralCode   string, the 'central code' - 4 digits hex string
 * @param device        string, the 'device code' - 4 digits elv-notation string
 * @param command       string, cmd text or 2 digits hex string
 * @param value         string, if command is a text then you can write formatted values
 *												like '21.5', 'AUTO' etc... (just like the parse function is outputting),
 *												but if the command is not found you have to write it in a 2 digit hex string
 * @returns object      string (the raw message) or boolean false (on error)
 *
 */
module.exports.cmd = function(centralCode, device, command, value) {
	var setCC = "T01" + centralCode.toUpperCase() + "\n"; // command for setting the cc

	// parts of the output string
	var deviceCode, cmd, cmdIsKnown, val;

	device = device.toUpperCase();

	// convert to hex
	deviceCode = [device.slice(0, 2), device.slice(2, 4)];
	deviceCode[0] = parseInt(deviceCode[0]).toString(16);
	deviceCode[1] = parseInt(deviceCode[1]).toString(16);

	// check if command is hex
	if (command.length == 2 && !isNaN(parseInt(command, 16))) {
		cmdIsKnown = codes[command.toLowerCase()] ? true : false;
		cmd = command.toUpperCase(); // save the given hex code
	}
	// check if command exists
	else if (codes.getKeyByValue(command) != undefined) {
		var strCode = codes.getKeyByValue(command);
		// and if it exists, check if it doesn´t exists in the readonly array
		if (readonly.indexOf(command) == -1) {
			cmd = strCode.toUpperCase(); // and save in cmd the hex code
			cmdIsKnown = true;
		}
		// if anything has an error -> exit
		else return false;
	} else return false;


	// check if command is hex
	if (value.length == 2 && !isNaN(parseInt(value, 16))) {
		val = value.toUpperCase();
	}
	// when we know the command we can format the value
	else if (cmdIsKnown) {
		var strCmd = codes[cmd.toLowerCase()]; // save command string in strCmd

		switch (strCmd) {
			case 'night-temp':
			case 'day-temp':
			case 'windowopen-temp':
			case 'desired-temp':
				val = (roundHalf(parseFloat(value)) * 2).toString(16).toUpperCase();
				break;
			case 'mode':
				if (value == 'AUTO') val = '00';
				else if (value == 'MANU') val = '01';
				else return false;
				break;
			default:
				var intCmd = parseInt(cmd, 16);

				// weekly program
				if (intCmd >= 20 && intCmd <= 47) {
					var time = value.split(":");
					time[0] = parseInt(time[0]);
					time[1] = parseInt(time[1]);

					// check for correctness of the time format
					if (time.length != 2 || isNaN(time[0]) || isNaN(time[1]) ||  
						!(time[0] < 23 && time[0] > 0 && time[1] < 60 && time[1] > 0)) return false;

					time[1] = Math.floor(time[1] / 10); // keep only the tens of the minutes

					// convert hour and minutes to convTime
					var convTime = Math.floor(time[0] * 6);
					convTime += time[1];

					val = convTime.toString(16).toUpperCase();
				}

				// no other cmd is found -> error
				else {
					console.log("the command '" + strCmd + "' can´t be converted, please write the value in a hexadecimal form");
					return false;
				}
		}
	}
	// we dont know how the value is formatted
	else {
		console.log("couldn´t format the value");
		return false;
	}

	// put the string together
	var sendString = 'T' + deviceCode[0] + deviceCode[1] + cmd + val;

	// return the cmd to change the Central Code and the actual cmd
	return setCC + sendString;
};


Object.prototype.getKeyByValue = function(value) {
	for (var prop in this) {
		if (this.hasOwnProperty(prop)) {
			if (this[prop] === value)
				return prop;
		}
	}
}

var roundHalf = function(n) {
	return (Math.round(n * 2) / 2).toFixed(1);
};
