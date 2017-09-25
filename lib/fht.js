module.exports.parse = function (raw) {
    const message = {};
    message.protocol = 'FHT';
    message.raw = raw;

    return message;
};

module.exports.cmd = function () {
    return false;
};
