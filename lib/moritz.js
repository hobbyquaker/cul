'use strict';

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

var day2str = {
	0: 'Sat',
	1: 'Sun',
	2: 'Mon',
	3: 'Tue',
	4: 'Wed',
	5: 'Thu',
	6: 'Fri'
};

var seen_devices = {};

function addDeviceByMsgType(addr, msgType) {
	switch (msgType) {
	case "ShutterContactState":
		seen_devices[addr] = device_types[4];
		break;
	case "WallThermostatConfig":
	case "WallThermostatState":
	case "WallThermostatControl":
	case "SetTemperature":
		seen_devices[addr] = device_types[3];
		break;
	case "HeatingThermostatConfig":
	case "ThermostatState":
		seen_devices[addr] = device_types[1];
		break;
	}
}

function hex2byte (hexStr) {
	var result = null;
	try {
		result = ("0x"+hexStr)*1;
	}
	catch(err) {
		result = null;
	}
	if (isNaN(result)) {
		result = null;
	}
	return result;
}

function getBits(value, offset, len) {
        var mask = 0;
        while (len > 0) {
                mask = mask << 1;
                mask++;
                len--;
        }
        return ((value >> offset) & mask);
}

function MAX_DateTime2Internal(dateObj) {
	var result = ((dateObj.month & 0x0E) << 20);
	result |= (dateObj.day << 16);
	result |= ((dateObj.month & 0x01) << 15);
	result |= ((dateObj.year - 2000) << 8);
	result |= (dateObj.hour * 2 + (dateObj.min/30));

	return result;
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
    var message = { data: {} };
    var data = message.data;
    message.protocol = 'MORITZ';
   
    switch (raw.charAt(0)) {
    case "Z":
        // Check if we have a Z character and at least two following characters which specify the length
	data.len = hex2byte(raw.substr(1,2));
	if ((2*data.len+3+2) != raw.length) { //+3 = +1 for 'Z' and +2 for len field in hex and +2 looks to be some checksum
		data.error = 'len mismatch';
		data.strlen = raw.length;
		data.expectedlen = (2*data.len+3);
	}
	else {
		data.msgcnt = hex2byte(raw.substr(3,2));
		data.msgFlag = raw.substr(5,2);
		data.msgTypeRaw = raw.substr(7,2);
		data.msgType = msgId2Cmd[data.msgTypeRaw] ? msgId2Cmd[data.msgTypeRaw] : data.msgTypeRaw;
		data.src = raw.substr(9,6).toLowerCase();
		message.address = data.src;
		data.dst = raw.substr(15,6).toLowerCase();
		data.groupid = hex2byte(raw.substr(21,2));
		data.payload = raw.substr(23, (2*data.len - 2));

		addDeviceByMsgType(data.src, data.msgType);
		if (seen_devices[data.src]) message.device = seen_devices[data.src];
		if (seen_devices[data.dst]) data.dstDevice = seen_devices[data.dst];

		var desiredTemperatureRaw = null;
		var measuredTemperature = null;

		switch (data.msgType) {
		case "RemoveLinkPartner":
		case "AddLinkPartner":
			data.linkPartner = {
				address: data.payload.substr(0,6).toLowerCase(),
				device: device_types[hex2byte(data.payload(6,2))]
			}
			break;
		case "PairPing":
			// my ($firmware,$type,$testresult,$serial) = unpack("CCCa*",pack("H*",$payload));
			data.firmware = hex2byte(data.payload.substr(0,2));
			data.type = hex2byte(data.payload.substr(2,2));
			data.testresult = hex2byte(data.payload.substr(4,2));
			data.serial = data.payload.substr(6);
			break;
		case "TimeInformation":
			if (data.payload.length == 12) {
				data.year = 2000+hex2byte(data.payload.substr(0,2));
				data.day = hex2byte(data.payload.substr(2,2));
				data.hour = hex2byte(data.payload.substr(4,2)) & 0x1F;
				data.min = hex2byte(data.payload.substr(6,2)) & 0x3F;
				data.sec = hex2byte(data.payload.substr(8,2)) & 0x3F;
				data.month = ((hex2byte(data.payload.substr(6,2)) >> 6) << 2) | (hex2byte(data.payload.substr(8,2)) >> 6); // this is just quessed according to FHEM
				data.unk1 = hex2byte(data.payload.substr(4,2)) >> 5;
				data.unk2 = hex2byte(data.payload.substr(6,2)) >> 6;
				data.unk3 = hex2byte(data.payload.substr(8,2)) >> 6;
			}
			break;
		case "PairPing":
			data.firmware = hex2byte(data.payload.substr(0,2));
			data.msgType = hex2byte(data.payload.substr(2,2));
			data.testresult = hex2byte(data.payload.substr(4,2));
			data.serial = data.payload.substr(6);
			if (message.pairPing) {
				message.device = device_types[message.pairPing.type];
				seen_devices[message.address] = message.device;
			}
			break;
		case "SetTemperature":
			var bits = hex2byte(data.payload.substr(0,2));
			data.mode = bits >> 6;
			data.modeStr = ctrl_modes[data.mode] ? ctrl_modes[data.mode] : data.mode;
			data.desiredTemperature = (bits & 0x3F) / 2.0; // Convert to degree celcius.
			if (data.desiredTemperature == 0) {
				delete data.desiredTemperature;
			}
			break;
		case "ConfigTemperatures":
			// my $comfort        = int($h{comfortTemperature}*2);
			// my $eco            = int($h{ecoTemperature}*2);
			// my $max            = int($h{maximumTemperature}*2);
			// my $min            = int($h{minimumTemperature}*2);
			// my $offset         = int(($h{measurementOffset} + 3.5)*2);
			// my $windowOpenTemp = int($h{windowOpenTemperature}*2);
			// my $windowOpenTime = int($h{windowOpenDuration}/5);
		
			// my $groupid        = MAX_ReadingsVal($hash,"groupid");
			// my $payload        = sprintf("%02x%02x%02x%02x%02x%02x%02x",$comfort,$eco,$max,$min,$offset,$windowOpenTemp,$windowOpenTime);
				data.comfortTemperature = hex2byte(data.payload.substr(0,2))/2;
				data.ecoTemperature = hex2byte(data.payload.substr(2,2))/2;
				data.maximumTemperature = hex2byte(data.payload.substr(4,2))/2;
				data.minimumTemperature = hex2byte(data.payload.substr(6,2))/2;
				data.offset = (hex2byte(data.payload.substr(8,2))/2) - 3.5;
				data.windowOpenTemperature = hex2byte(data.payload.substr(10,2))/2;
				data.windowOpenTime = hex2byte(data.payload.substr(12,2))*5;
			break;
		case "WallThermostatControl":
			desiredTemperatureRaw = hex2byte(data.payload.substr(0,2));
			measuredTemperature = hex2byte(data.payload.substr(2,2));
			break;
		case "WallThermostatState":
			var bits2 = hex2byte(data.payload.substr(0,2));
			data.displayActualTemperature = hex2byte(data.payload.substr(2,2));
			desiredTemperatureRaw = hex2byte(data.payload.substr(4,2));
			var null1 = hex2byte(data.payload.substr(6,2));
			var heaterTemperature = hex2byte(data.payload.substr(8,2));
			var null2 = hex2byte(data.payload.substr(10,2));
			measuredTemperature = hex2byte(data.payload.substr(12,2));

			data.mode = getBits(bits2, 0, 2);
			data.modeStr = ctrl_modes[data.mode] ? ctrl_modes[data.mode] : data.mode;
			data.dstsetting = getBits(bits2, 3, 1); //is automatically switching to DST activated
			data.langateway = getBits(bits2, 4, 1); //??
			data.panel = getBits(bits2, 5, 1); //1 if the heating thermostat is locked for manually setting the temperature at the device
			data.rferror = getBits(bits2, 6, 1); //communication with link partner (what does that mean?)
			data.batterylow = getBits(bits2, 7, 1); //1 if battery is low
			data.battery = data.batterylow ? "low" : "ok";
			
			if ((null2 !== null) && (null1 > 0) || (null2 > 0)) {
				data.untilStr = MAX_ParseDateTime(null1,heaterTemperature,null2);
				heaterTemperature = null;
			}
			if (heaterTemperature !== null) data.heaterTemperature = heaterTemperature;
			
			break;
		case "ThermostatState":
			var bits2 = hex2byte(data.payload.substr(0,2));
			data.valveposition = hex2byte(data.payload.substr(2,2));
			var desiredTemperatureRaw = hex2byte(data.payload.substr(4,2));
			var until1 = hex2byte(data.payload.substr(6,2));
			var until2 = hex2byte(data.payload.substr(8,2));
			var until3 = hex2byte(data.payload.substr(10,2));


			data.mode = getBits(bits2, 0, 2);
			data.modeStr = ctrl_modes[data.mode] ? ctrl_modes[data.mode] : data.mode;
			data.dstsetting = getBits(bits2, 3, 1); //is automatically switching to DST activated
			data.langateway = getBits(bits2, 4, 1); //??
			data.panel = getBits(bits2, 5, 1); //1 if the heating thermostat is locked for manually setting the temperature at the device
			data.rferror = getBits(bits2, 6, 1); //communication with link partner (what does that mean?)
			data.batterylow = getBits(bits2, 7, 1); //1 if battery is low
			data.battery = data.batterylow ? "low" : "ok";

			if (until3 > 0) data.untilStr = MAX_ParseDateTime(until1, until2, until3);
//			var measuredTemperature = (until2 > 0) ? (((until1 & 0x01)<<8) + until2)/10 : 0;
			var measuredTemperature = (until2 > 0) ? (((until1 & 0x01)<<8) + until2) : 0;
			//If the control mode is not "temporary", the cube sends the current (measured) temperature
			if ((data.mode == 2) || (measuredTemperature == 0)) measuredTemperature = null;
			if (data.mode != 2) delete data.untilStr;

			if (measuredTemperature) data.measuredTemperature = measuredTemperature;

			break;
		case "ShutterContactState":
			var bits = hex2byte(data.payload.substr(0,2));
			data.isopen = (getBits(bits, 0, 2) === 0) ? 0 : 1;
			data.unkbits = getBits(bits, 2, 4);
			data.rferror = getBits(bits, 6, 1);
			data.batterylow = getBits(bits, 7, 1);
			data.battery = data.batterylow ? "low" : "ok";
			break;
		case "PushButtonState":
			var bits2 = hex2byte(data.payload.substr(0,2));
			data.onoff = data.payload.substr(2,2);

			//The meaning of $bits2 is completly guessed based on similarity to other devices, TODO: confirm
			data.gateway = getBits(bits2, 4, 1); // Paired to a CUBE?
			data.rferror = getBits(bits2, 6, 1);
			data.batterylow = getBits(bits2, 7, 1);
			data.battery = data.batterylow ? "low" : "ok";
			break;
/*
       if($device_types{$type} =~ /HeatingThermostat./) {
          Dispatch($shash, "MAX,$isToMe,HeatingThermostatConfig,$src,17,21,30.5,4.5,$defaultWeekProfile,80,5,0,12,15,100,0,0,12", {});
        } elsif($device_types{$type} eq "WallMountedThermostat") {
          Dispatch($shash, "MAX,$isToMe,WallThermostatConfig,$src,17,21,30.5,4.5,$defaultWeekProfile,80,5,0,12", {});
        }

*/
		case "ConfigWeekProfile":
			// example payload: 0 2 3C48 4860 48AE 4908 3D20 4520 4520 0 8
			// $newWeekprofilePart .= sprintf("%04x", (int($temperature*2) << 9) | int(($hour * 60 + $min)/5));
			// First 7 control points sprintf("0%1d%s", $day, substr($newWeekprofilePart,0,2*2*7))
			// Remaining 6 control points sprintf("1%1d%s", $day, substr($newWeekprofilePart,2*2*7,2*2*6))
			// First digit specifies which set of control points:
			//   0 : first 7
			//   1 : remaining 6
			// Second digit is weekday
			//  (0 => 'Sat', 1 => 'Sun', 2 => 'Mon', 3 => 'Tue', 4 => 'Wed', 5 => 'Thu', 6 => 'Fri');
			//
			// Next 7 or 6 2 byte hex values are controlpoints
			// Last two digits are unknown for now ??
			data.setId = data.payload.substr(0,1);
			let controlpointCount = (data.setId == 0) ? 7 : 6;
			if (data.payload.length >= (2+controlpointCount*4)) {
				data.weekday = data.payload.substr(1,1);
				data.weekdayStr = day2str[data.weekday];
				data.controlpoints = [];
				let previousHour = 0;
				let previousMinute = 0;
				for(var i=0; i<controlpointCount; i++) {
					let controlpoint = hex2byte(data.payload.substr(2+(i*4),4));
					let temperature = ((controlpoint >> 9) & 0x3F) / 2;
					let time = (controlpoint & 0x1FF) * 5;
					let hour = (time / 60) % 24;
					let minute = time % 60;
					data.controlpoints.push({
						temperature: temperature,
						hour: previousHour,
						minute: previousMinute
					});
					if (hour === 0 && minute === 0) {
						// Last point.
						break;
					}
					previousHour = hour;
					previousMinute = minute;
				}	
			}
			else {
				data.error = 'Not enough data for week profile';
				data.expectedlen = (2+controlpointCount*4);		
			}
			break;

		case "HeatingThermostatConfig":
		case "WallThermostatConfig":
			break;
		}
		if (desiredTemperatureRaw !== null) data.desiredTemperature = (desiredTemperatureRaw & 0x7F) / 2.0;
		if (measuredTemperature !== null) data.measuredTemperature = (((desiredTemperatureRaw & 0x80)<<1) + measuredTemperature) / 10 ;
	}
	break;
    case "V":
	// Should be followed by version of culfw.
	var version=raw.split(' ');
	data.culfw = {};
	data.culfw.version = version[1];
	data.culfw.hardware = version[2]
	break;
    }

    return message;
};

module.exports.cmd = function () {

    return false;
};
