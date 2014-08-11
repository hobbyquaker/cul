// http://sourceforge.net/p/fhem/code/HEAD/tree/trunk/fhem/FHEM/14_CUL_WS.pm

module.exports = function (raw) {
    var message =   {};

    message.address = raw[1] & 7;
    message.data = {};

    var firstByte = parseInt(raw[1], 16);
    var typByte =   parseInt(raw[2], 16) & 7;
    var sign = 1;

    if (firstByte & 7 === 7) {

        if (typByte === 0 && raw.length > 6) {

            message.device = 'Temp';
            sign = firstByte & 8 ? -1 : 1;
            message.data.temperature = sign * parseFloat(raw[6] + raw[3] + '.' + raw[4]);

        } else if (typByte === 1 && raw.length > 8) {

            message.device = 'WS300';
            sign = firstByte & 8 ? -1 : 1;
            message.data.temperature = sign * parseFloat(raw[6] + raw[3] + '.' + raw[4]);
            message.data.humidity = sign * parseFloat(raw[7] + raw[8] + '.' + raw[5]);

        }

    } else {

        if (raw.length > 8) {

            message.device = 'S300TH';
            sign = firstByte & 8 ? -1 : 1;
            message.data.temperature = sign * parseFloat(raw[6] + raw[3] + '.' + raw[4]);
            message.data.humidity = sign * parseFloat(raw[7] + raw[8] + '.' + raw[5]);

        }

    }

    return message;

};
