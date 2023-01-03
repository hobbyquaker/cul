'use strict';

function hex2bin(hex){
    return (parseInt(hex, 16).toString(2)).padStart(8, '0');
}

module.exports.parse = function (raw) {
    const message = {};
    let bin;

    message.protocol = 'IT';
    message.length = raw.length;
    if (raw.length !== 7 && raw.length !== 12 && raw.length !== 17 && raw.length !== 19 && raw.length !== 20){
        console.log('IT: message ' + raw + '(' + raw.length + ') too short!', 'warn');
        return message;
    }
    
    if (raw.length === 17){ // IT V3
    } else if (raw.length === 19){    // IT V3 dimm
    } else if (raw.length === 20 && raw[1] === 'h'){    // HomeEasy EU
    } else if (raw.length === 12 && raw[1] === 'h'){    // HomeEasy HE800
    } else {
        bin = hex2bin(raw.slice(1));
    }

    let msgcode='';
    let housecode = '';
    let onoffcode = '';
    let device = '';

    // ToDo: generate message code
    //>>>>>>>>>>>>>>>>>>>
    //<<<<<<<<<<<<<<<<<<<

    if (raw.length === 7){
        if (msgcode !== ''){

        } else { // EV1527
            device = 'EV1527';
            housecode = '1527x' + raw.slice(1, 5);
            onoffcode = raw.slice(6);
        }
    }

    message.data = {};
    message.data.addressCode = onoffcode;
    message.device = device;
    message.address = housecode;
    message.raw = raw;

    return message;
}