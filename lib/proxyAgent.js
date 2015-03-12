var http = require("http");
var https = require("https");

module.exports = function (host, port) {
    module.exports.applyToAgent(host, port || 80, http.globalAgent);
    module.exports.applyToAgent(host, port || 443, https.globalAgent);
};

module.exports.applyToAgent = function (host = "localhost", port = 80, agent) {
    var target = agent;
    target._createSocket = target.createSocket;
    target.createSocket = function (name, h, p, localAddress, req) {
        return target._createSocket(name, host, port, localAddress, req);
    };
};