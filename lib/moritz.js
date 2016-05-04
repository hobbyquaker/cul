var device_types = {
  0 : "Cube",
  1 : "HeatingThermostat",
  2 : "HeatingThermostatPlus",
  3 : "WallMountedThermostat",
  4 : "ShutterContact",
  5 : "PushButton"
};

var msgId2Cmd = {
	"00" : "PairPing",
        "01" : "PairPong",
        "02" : "Ack",
        "03" : "TimeInformation",

        "10" : "ConfigWeekProfile",
        "11" : "ConfigTemperatures", //like eco/comfort etc
        "12" : "ConfigValve",

        "20" : "AddLinkPartner",
        "21" : "RemoveLinkPartner",
        "22" : "SetGroupId",
        "23" : "RemoveGroupId",

        "30" : "ShutterContactState",

        "40" : "SetTemperature", //to thermostat
        "42" : "WallThermostatControl", //by WallMountedThermostat
        //Sending this without payload to thermostat sets desiredTempeerature to the comfort/eco temperature
        //We don't use it, we just do SetTemperature
        "43" : "SetComfortTemperature",
        "44" : "SetEcoTemperature",

        "50" : "PushButtonState",

        "60" : "ThermostatState", //by HeatingThermostat

        "70" : "WallThermostatState",

        "82" : "SetDisplayActualTemperature",

        "F1" : "WakeUp",
        "F0" : "Reset",
};

var ctrl_modes = { 
	'0' : "auto",
	'1' : "manual",
	'2' : "temporary",
	'3' : "boost",
}; 

function hex2byte (hexStr)
{
	return ("0x"+hexStr)*1;
}

module.exports.parse = function (raw) {
    var message = {};
    message.protocol = 'MORITZ';
   
    message.type = raw.charAt(0); 
    switch (message.type) {
    case "Z":
        // Check if we have a Z character and at least two following characters which specify the length
	message.len = hex2byte(raw.substr(1,2));
	if ((2*message.len+3+2) != raw.length) { //+3 = +1 for 'Z' and +2 for len field in hex and +2 looks to be some checksum
		message.error = 'len mismatch';
		message.strlen = raw.length;
		message.expectedlen = (2*message.len+3);
	}
	else {
		message.msgcnt = hex2byte(raw.substr(3,2));
		message.msgFlag = raw.substr(5,2);
		message.msgTypeRaw = raw.substr(7,2);
		message.msgType = msgId2Cmd[message.msgTypeRaw] ? msgId2Cmd[message.msgTypeRaw] : message.msgTypeRaw;
		message.src = raw.substr(9,6).toLowerCase();
		message.dst = raw.substr(15,6).toLowerCase();
		message.groupid = hex2byte(raw.substr(21,2));
		message.payload = raw.substr(23, (2*message.len - 2));
		message.checksum = raw.substr(23 + (2*message.len - 2));

		switch (msgId2Cmd[message.msgTypeRaw]) {
		case "TimeInformation":
			if (message.payload.length == 10) {
				message.timeInformation = {};
				message.timeInformation.year = 2000+hex2byte(message.payload.substr(0,2));
				message.timeInformation.day = hex2byte(message.payload.substr(2,2));
				message.timeInformation.hour = hex2byte(message.payload.substr(4,2)) & 0x1F;
				message.timeInformation.min = hex2byte(message.payload.substr(6,2)) & 0x3F;
				message.timeInformation.sec = hex2byte(message.payload.substr(8,2)) & 0x3F;
				message.timeInformation.month = ((hex2byte(message.payload.substr(6,2)) >> 6) << 2) | (hex2byte(message.payload.substr(8,2)) >> 6); // this is just quessed according to FHEM
				message.timeInformation.unk1 = hex2byte(message.payload.substr(4,2)) >> 5;
				message.timeInformation.unk2 = hex2byte(message.payload.substr(6,2)) >> 6;
				message.timeInformation.unk3 = hex2byte(message.payload.substr(8,2)) >> 6;
			}
			break;
		case "PairPing":
			message.pairPing = {};
			message.pairPing.firmware = hex2byte(message.payload.substr(0,2));
			message.pairPing.type = hex2byte(message.payload.substr(2,2));
			message.pairPing.testresult = hex2byte(message.payload.substr(4,2));
			message.pairPing.serial = message.payload.substr(6);
			message.deviceType = device_types[message.pairPing.type];
			break;
		case "SetTemperature":
			var bits = hex2byte(message.payload.substr(0,2));
			message.temperature = {};
			message.temperature.mode = bits >> 6;
			message.temperature.modeStr = ctrl_modes[message.mode] ? ctrl_modes[message.mode] : message.mode;
			message.temperature.desired = (bits & 0x3F) / 2.0; // Convert to degree celcius.
			break;
		case "WallThermostatControl":
			var desiredTemperatureRaw = hex2byte(message.payload.substr(0,2));
			var temperature = hex2byte(message.payload.substr(2,2));
			message.temperature = {};
			message.temperature.desired = (desiredTemperatureRaw & 0x7F) / 2.0;
			message.temperature.measured = (((desiredTemperatureRaw & 0x80)<<1) + temperature) / 10 ;
			break;
		}
	}
	break;
    case "V":
	// Should be followed by version of culfw.
	var version=raw.split(' ');
	message.culfw = {};
	message.culfw.version = version[1];
	message.culfw.hardware = version[2]
	break;
    }

    return message;
};

module.exports.cmd = function () {

    return false;
};
