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

function hex2byte (hexStr) {
	var result = null;
	try {
		result = ("0x"+hexStr)*1;
	}
	catch(err) {
		result = null;
	}
	return result;
}

function getBits(value, offset, len) {
	return ((value >> offset) & (Math.pow(2,len-1)));
}

function MAX_ParseDateTime(byte1, byte2, byte3) {
	var result = {};
	result.day = byte1 & 0x1F;
	result.month = ((byte1 & 0xE0) >> 4) | (byte2 >> 7);
	result.year = byte2 & 0x3F;
	var time = byte3 & 0x3F;
	if ((time % 2) > 0)
		result.time = (time / 2) + ":30";
	else
		result.time = (time / 2) + ":00";

	result.str = result.day+"."+result.month+"."+result.year+" "+result.time;
	return result;
}

function MAX_SerializeTemperature(temperature) {
	if ((temperature == "on") || (temperature == "off")) 
		return temperature;
	else if (temperature == 4.5) 
		return "off";
	else if (temperature == 30.5)
		return "on";
	else
		return temperature+" C";
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

		message[message.msgType] = {};

		var desiredTemperatureRaw = null;
		var temperature = null;

		switch (message.msgType) {
		case "TimeInformation":
			if (message.payload.length == 10) {
				message[message.msgType].year = 2000+hex2byte(message.payload.substr(0,2));
				message[message.msgType].day = hex2byte(message.payload.substr(2,2));
				message[message.msgType].hour = hex2byte(message.payload.substr(4,2)) & 0x1F;
				message[message.msgType].min = hex2byte(message.payload.substr(6,2)) & 0x3F;
				message[message.msgType].sec = hex2byte(message.payload.substr(8,2)) & 0x3F;
				message[message.msgType].month = ((hex2byte(message.payload.substr(6,2)) >> 6) << 2) | (hex2byte(message.payload.substr(8,2)) >> 6); // this is just quessed according to FHEM
				message[message.msgType].unk1 = hex2byte(message.payload.substr(4,2)) >> 5;
				message[message.msgType].unk2 = hex2byte(message.payload.substr(6,2)) >> 6;
				message[message.msgType].unk3 = hex2byte(message.payload.substr(8,2)) >> 6;
			}
			break;
		case "PairPing":
			message[message.msgType].firmware = hex2byte(message.payload.substr(0,2));
			message[message.msgType].type = hex2byte(message.payload.substr(2,2));
			message[message.msgType].testresult = hex2byte(message.payload.substr(4,2));
			message[message.msgType].serial = message.payload.substr(6);
			message.deviceType = device_types[message.pairPing.type];
			break;
		case "SetTemperature":
			var bits = hex2byte(message.payload.substr(0,2));
			message[message.msgType].mode = bits >> 6;
			message[message.msgType].modeStr = ctrl_modes[message[message.msgType].mode] ? ctrl_modes[message[message.msgType].mode] : message[message.msgType].mode;
			message[message.msgType].desired = (bits & 0x3F) / 2.0; // Convert to degree celcius.
			break;
		case "WallThermostatControl":
			desiredTemperatureRaw = hex2byte(message.payload.substr(0,2));
			temperature = hex2byte(message.payload.substr(2,2));
			break;
		case "WallThermostatState":
			var bits2 = hex2byte(message.payload.substr(0,1));
			var displayActualTemperature = hex2byte(message.payload.substr(1,2));
			desiredTemperatureRaw = hex2byte(message.payload.substr(3,2));
			var null1 = hex2byte(message.payload.substr(5,2));
			var heaterTemperature = hex2byte(message.payload.substr(7,2));
			var null2 = hex2byte(message.payload.substr(9,2));
			temperature = hex2byte(message.payload.substr(11,2));

			message[message.msgType].mode = getBits(bits2, 0, 2);
			message[message.msgType].modeStr = ctrl_modes[message[message.msgType].mode] ? ctrl_modes[message[message.msgType].mode] : message[message.msgType].mode;
			message[message.msgType].dstsetting = getBits(bits2, 3, 1); //is automatically switching to DST activated
			message[message.msgType].langateway = getBits(bits2, 4, 1); //??
			message[message.msgType].panel = getBits(bits2, 5, 1); //1 if the heating thermostat is locked for manually setting the temperature at the device
			message[message.msgType].rferror = getBits(bits2, 6, 1); //communication with link partner (what does that mean?)
			message[message.msgType].batterlow = getBits(bits2, 7, 1); //1 if battery is low
			message[message.msgType].battery = message[message.msgType].batterlow ? "low" : "ok";
			
			if ((null2) && (null1 > 0) || (null2 > 0)) {
				message[message.msgType].untilStr = MAX_ParseDateTime(null1,heaterTemperature,null2);
				heaterTemperature = null;
			}
			if (heaterTemperature !== null) message[message.msgType].heaterTemperature = heaterTemperature;
			
			break;
		case "ThermostatState":
			break;
		case "ShutterContactState":
			var bits = hex2byte(message.payload.substr(0,1));
			message[message.msgType].isopen = (getBits(bits, 0, 2) === 0) ? 0 : 1;
			message[message.msgType].unkbits = getBits(bits, 2, 4);
			message[message.msgType].rferror = getBits(bits, 6, 1);
			message[message.msgType].batterlow = getBits(bits, 7, 1);
			message[message.msgType].battery = message[message.msgType].batterlow ? "low" : "ok";
			break;
		case "PushButtonState":
			var bits2 = hex2byte(message.payload.substr(0,1));
			message[message.msgType].onoff = message.payload.substr(1,2);

			//The meaning of $bits2 is completly guessed based on similarity to other devices, TODO: confirm
			message[message.msgType].gateway = getBits(bits2, 4, 1); // Paired to a CUBE?
			message[message.msgType].rferror = getBits(bits2, 6, 1);
			message[message.msgType].batterlow = getBits(bits2, 7, 1);
			message[message.msgType].battery = message[message.msgType].batterlow ? "low" : "ok";
			break;
/*
       if($device_types{$type} =~ /HeatingThermostat./) {
          Dispatch($shash, "MAX,$isToMe,HeatingThermostatConfig,$src,17,21,30.5,4.5,$defaultWeekProfile,80,5,0,12,15,100,0,0,12", {});
        } elsif($device_types{$type} eq "WallMountedThermostat") {
          Dispatch($shash, "MAX,$isToMe,WallThermostatConfig,$src,17,21,30.5,4.5,$defaultWeekProfile,80,5,0,12", {});
        }

*/
		case "HeatingThermostatConfig":
		case "WallThermostatConfig":
			break;
		}
		if (desiredTemperatureRaw !== null) message[message.msgType].desired = (desiredTemperatureRaw & 0x7F) / 2.0;
		if (temperature !== null) message[message.msgType].measured = (((desiredTemperatureRaw & 0x80)<<1) + temperature) / 10 ;
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
