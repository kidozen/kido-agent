// Module's dependencies 
require("simple-errors");

var os		= require("os");
var agent 	= require("./lib/agent");
var winston = require("winston");

var level = process.argv.indexOf("--level");
if (level > -1) {
    winston.clear();
    winston.add(winston.transports.Console, { colorize: true, level: process.argv[level + 1] || "info"});
}

var keypress = require('keypress');
keypress(process.stdin);

// Catch any unhandled exception
process.on('uncaughtException', function (err) {

	if (err instanceof Error) err = Error.toJson(err);
	winston.error (JSON.stringify(err, null, "  "));
	process.exit();
});

process.on('exit', function() {
    winston.info ("bye!");
});

// creates an agent instance
var agent = new Agent();

// initializes the agent instance
agent.initialize(function (err) {
	if (err) throw Error.create("Couldn't initialize agent instance.", err);

	// authenticates the agent against kidozen using configured credentials
	agent.authenticate(function (err) {
		if (err) throw Error.create("Couldn't authenticate the agent instance against KidoZen services.", err);

		// starts the agent intance
		agent.start(function (err) {
			if (err) throw Error.create("Couldn't start agent instance.", err);

			// Wait for a Ctrl+C to exit
		    winston.info (os.EOL + os.EOL + 'Press Control-C to exit.' + os.EOL + os.EOL);

			process.stdin.resume();
			process.stdin.setRawMode(true);
			process.stdin.on('keypress', function(char, key) {
				if (key && key.ctrl && key.name == 'c') {
					winston.info ("stopping agent instance");
					agent.stop();
					process.exit();
				}
			});
		});
	});
});
