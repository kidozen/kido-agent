var http = require("http");
var https = require("https");

module.exports = function (host, port) {
    module.exports.applyToAgent(host, port || 80, http.globalAgent);
    module.exports.applyToAgent(host, port || 443, https.globalAgent);
};

module.exports.applyToAgent = function (host, port, agent) {
    var target = agent;
    var options = {
            host: host || "localhost",
            port: port || 80
        };
    target._createSocket = target.createSocket;
    target.createSocket = function (name, h, p, localAddress, req) {
        return target._createSocket(name, options.host, options.port, localAddress, req);
    };
};