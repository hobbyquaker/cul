module.exports.parse = function () {
    return {};
};

/*
    U<hex>
    Send out an UNIRoll message. <hex> is a hex string of the following form:
    ggggdc, where
    gggg is the UNIRoll group address,
    d is the UNIRoll device address,
    c is the UNIRoll command (b - down, d - stop, e - up)
    Example: U12340b
 */

module.exports.cmd = function (group, device, command) {
    switch (String(command).toLowerCase()) {
        case 'down':
            command = 'B';
            break;
        case 'up':
            command = 'E';
            break;
        default:
            command = 'D';
    }

    return 'U' +
        ('0000' + group.toString(16).toUpperCase()).slice(-4) +
        device.toString(16).toUpperCase().slice(-1) +
        command;
};
