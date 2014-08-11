// http://sourceforge.net/p/fhem/code/HEAD/tree/trunk/fhem/FHEM/12_HMS.pm

module.exports = function (raw) {
    var message =   {};
   
    message.address = raw.slice(1, 5);

    message.device = 'HMS100T'; // FIXME only generate message if this is really a HMS100T!

    var val = raw.slice(5);
    var status1 = parseInt(val[0], 16);
    var sign = status1 & 8 ? -1 : 1;

    message.data = {};
    message.data.temperature = sign * parseFloat(val[5] + val[2] + '.' + val[3]);
    message.data.battery = 0;
    if (status1 & 2) data.battery = 1;
    if (status1 & 4) data.battery = 2;

    return message;
};