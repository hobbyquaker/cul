// http://sourceforge.net/p/fhem/code/HEAD/tree/trunk/fhem/FHEM/14_CUL_TX.pm
// http://www.f6fbb.org/domo/sensors/tx3_th.php

module.exports.parse = function (raw) {
    var message = {};
    message.protocol = 'TX';

    return message;
};