// http://sourceforge.net/p/fhem/code/HEAD/tree/trunk/fhem/FHEM/12_HMS.pm

var devices = {
    "0": "HMS100TF",
    "1": "HMS100T",
    "2": "HMS100WD",
    "3": "RM100-2",
    "4": "HMS100TFK", // Depending on the onboard jumper it is 4 or 5
    "5": "HMS100TFK",
    "6": "HMS100MG",
    "8": "HMS100CO",
    "e": "HMS100FIT"
};

module.exports.parse = function (raw) {
    var message =   {};
    message.protocol = 'HMS';
    message.address = raw.slice(1, 5);

    var val = raw.slice(5);

    // TODO make sure that val[1] really contains the device type! (I can't test, only got one HMS100T)
    message.device = devices[val[1]];

    var status1 = parseInt(val[0], 16);
    var sign = status1 & 8 ? -1 : 1;


    if (message.device === 'HMS100T') {

        message.data = {};
        message.data.temperature = sign * parseFloat(val[5] + val[2] + '.' + val[3]);
        message.data.battery = 0;
        if (status1 & 2) data.battery = 1;
        if (status1 & 4) data.battery = 2;

    } else if (message.device === 'HMS100TF') {

        var status1 = parseInt(val[0], 16);
        var sign = status1 & 8 ? -1 : 1;

        message.data = {};
        // Codierung <s1><s0><t1><t0><f0><t2><f2><f1>
        message.data.temperature = sign * parseFloat(val[5] + val[2] + '.' + val[3]);
        message.data.humidity = parseFloat(val[6] + val[7] + '.' + val[4]);
        message.data.battery = 0;
        if (status1 & 2) message.data.battery = 1;
        if (status1 & 4) message.data.battery = 2;

    }

    return message;
};
