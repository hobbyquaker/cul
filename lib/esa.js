module.exports.parse = function (raw) {
    const message = {
        protocol: 'ESA',
        raw
    };

    return message;
};
