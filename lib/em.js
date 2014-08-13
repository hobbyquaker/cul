// http://sourceforge.net/p/fhem/code/HEAD/tree/trunk/fhem/FHEM/15_CUL_EM.pm#l92

module.exports.parse = function (raw) {
    var message =   {};
    message.protocol = 'EM';
    message.address =   raw.slice(1, 5);

    var type = raw.slice(1, 3);
    switch (type) {
        case '01':
            message.device = 'EM1000';
            break;
        case '02':
            message.device = 'EM1000-EM';
            break;
        case '03':
            message.device = 'EM1000-GZ';
            break;
    }

    message.data = {};
    //message.data.emType =     type;
    //message.data.emAddress =  raw.slice(3, 5);
    message.data.seq =        parseInt((raw[5] + raw[6]), 16);
    message.data.total =      parseInt((raw[9] + raw[10] + raw[7] + raw[8]), 16);
    message.data.current =    parseInt((raw[13] + raw[13] + raw[11] + raw[12]), 16);
    message.data.peak =       parseInt((raw[17] + raw[18] + raw[15] + raw[16]), 16);

    return message;
};

