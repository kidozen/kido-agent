var winston     = require("winston");
var moment      = require('moment');
var stringify   = require("json-stringify-safe");
var path        = require('path');

var timestamp = function() { return (new moment()).format("YYYY-MM-DD HH:mm:ss"); };

var level = process.argv.indexOf("--level");
level = ((level > -1) ? process.argv[level + 1] : null) || "info"; 
winston.clear();

var consoleLog = winston.transports.Console.prototype.log;
winston.transports.Console.prototype.log = function (level, msg, meta, callback) {
    if (meta instanceof Error) {
        var stack = [];
        var current = meta;
        while (current) {
            stack.push(current.message);
            current= (current.inner instanceof Error) ? current = current.inner : null;
        };
        meta = stringify(stack);
    }
    consoleLog.call(this, level, msg, meta, callback);
};

var fileLog = winston.transports.File.prototype.log;
winston.transports.File.prototype.log = function (level, msg, meta, callback) {
    if (meta instanceof Error) meta = Error.toJson(meta);
    fileLog.call(this, level, msg, meta, callback);
};

winston.add(winston.transports.Console, 
{   colorize: true,
    prettyPrint: false,
    level: level, 
    timestamp: timestamp  
});

winston.add(winston.transports.File, 
{   json: false,
    prettyPrint: true,
    level: level, 
    filename: path.resolve(__dirname,"../agent.log"),
    timestamp: timestamp  
});
