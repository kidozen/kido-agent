"use strict";
require("simple-errors");
var winston =           require("winston");
var configuration =     require("./configuration");
var io =                require("socket.io-client");
var ss =                require("socket.io-stream");
var url =               require("url");
var net =               require("net");
var path =              require("path");
var https =             require("https");
var tunnel =            require("tunnel-agent");
var getAccessToken =    require("./getAccessToken");
var getDependency =     require("./getDependency");
var npm =               require("npm");
var Stream =            require("stream");
var EventEmitter =      require("events").EventEmitter;
var util =              require("util");
var async =             require("async");
var packageJson =       require("../package.json");
var Transform =         require("readable-stream").Transform;
var zlib =              require("zlib");
var tar =               require("tar");
var Moment =            require("moment");
var fs =                require("fs");
var JSONStream =        require("JSONStream");
var fstream =           require("fstream");
var spawn   =           require('child_process').spawn;
var client =            null;

/**
 * Log the elapsed time from 'startTimestamp' until this function invocation
 * @param  {string} label             The log message
 * @param  {Number} startTimestamp    The starting moment to log from
 */
var logTET = function (label, startTimestamp) {
    var endTimestamp = Date.now();
    var duration = Moment.duration(endTimestamp - startTimestamp);
    var hh = duration.hours();
    var mm = duration.minutes();
    var ss = duration.seconds();
    var ms = duration.milliseconds();
    var formatedDuration = (hh < 10 ? "0" + hh : hh) + ":" + (mm < 10 ? "0" + mm : mm) + ":" + (ss < 10 ? "0" + ss : ss) + ":";
    if (ms < 10) {
        formatedDuration += "00";
    } else if (ms < 100) {
        formatedDuration += "0";
    }
    formatedDuration += ms;
    winston.verbose(label + " TET: " + formatedDuration);
};
module.exports = function () {
    var self = this;
    // autoreference
    Object.defineProperty(self, "services", {
        enumerable: false,
        configurable: false,
        writable: false,
        value: {}
    });
    this.initialize = function (options, cb) {
        if (!cb && typeof options === "function") {
            cb = options;
            options = {};
        }
        try {
            winston.info("Initializing ...");
            // validatea initailization options
            validateOptions(options);
            winston.debug("Configuration:", self.config);
            if (self.config && self.config.credentials.marketplace && self.config.credentials.marketplace.indexOf("https") === -1) {
                winston.warn("Are you sure you want to use the marketplace URL without 'https'?");
            }
            // loads NPM module, it will be used to install connectors modules
            loadNPM(function (err) {
                if (err)
                    return cb(err);
                winston.info("Initialized");
                var npmProxy = npm.config.get("https-proxy");
                if (npmProxy) {
                    self.config.proxy = npmProxy;
                    winston.debug("proxy was retrieved from NPM's config.");
                }
                cb();
            });
        } catch (e) {
            cb(Error.create("Couldn't initialize agent instance.", e));
        }
    };
    this.authenticate = function (cb) {
        if (!self.config)
            return cb(Error.create("Agent instance was not initialized."));
        winston.info("Authenticating the agent");
        var credentials = self.config.credentials || {};
        if (!credentials || typeof credentials !== "object")
            return cb(Error.create("'credentials' argument is missing or invalid."));
        if (!credentials.user || typeof credentials.user !== "string")
            return cb(Error.create("'credentials.user' property is missing or invalid."));
        if (!credentials.password || typeof credentials.password !== "string")
            return cb(Error.create("'credentials.password' property is missing or invalid."));
        if (!credentials.marketplace || typeof credentials.marketplace !== "string")
            return cb(Error.create("'credentials.marketplace' property is missing or invalid."));
        self.config.credentials.marketplace = formatURL(self.config.credentials.marketplace);
        getAccessToken(self.config, function (err, ipToken, kidoToken) {
            if (err)
                return cb(err);
            winston.info("Agent was authenticated.");
            self.config.ipToken = ipToken;
            self.config.kidoToken = kidoToken;
            self.config.wsEndpoint = url.resolve(credentials.marketplace, "hub").toLowerCase();
            cb();
        });
    };
    this.start = function (cb) {
        winston.info("Starting agent");
        if (!self.config)
            return cb(Error.create("Agent instance was not initialized."));
        if (!self.config.ipToken)
            return cb(new Error("Agent instance was not authenticated."));
        if (self.config.proxy) {
            winston.debug("Parsing proxy URL: ", self.config.proxy);
            var proxyUrl = url.parse(self.config.proxy);
            winston.debug("Setting proxy");
            var opt = {
                    proxy: {
                        hostname: proxyUrl.hostname,
                        port: parseInt(proxyUrl.port)
                    }
                };
            if (proxyUrl.auth) {
                opt.proxy.proxyAuth = proxyUrl.auth;
            }
            https.globalAgent = tunnel.httpsOverHttp(opt);
            winston.debug("Proxy was set");
        }
        winston.info("Requesting a socket connection to " + self.config.wsEndpoint + " ...");
        try {
            client = io.connect(self.config.wsEndpoint, {
                secure: true,
                transports: ["websockets"]
            });
            hookEvents(client);
            cb();
        } catch (e) {
            return cb(Error.create("Could't connect to WebSocket endpoint.", e));
        }
    };
    this.stop = function (cb) {

        winston.info("Stopping agent ...");

        if (client) {
            if (client.socket && (client.socket.connected || client.socket.connecting)) {
                client.disconnect();
            }
            client.removeAllListeners();
            client = null;
        }

        var queue = async.queue(function (closeFn, callback) {
            if (!closeFn) {
                return callback();
            }
            closeFn(callback);
        }, 1);

        queue.drain = function () {
            winston.info("The agent is stopped.");
            cb();
        };
        Object.keys(self.services).map(function (name) {
            winston.verbose("Searching for 'close' on service " + name);
            if (self.services[name].instance && self.services[name].instance.close) {
                winston.verbose("Method found. Closing service " + name);
                queue.push(self.services[name].instance.close, function () {
                    winston.verbose("Service " + name + " closed.");
                });
            } else {
                winston.verbose("Method not found.");
                queue.push(null, function () {
                });
            }
        });
        if (Object.keys(self.services).length === 0) {
            queue.push(null, function () {
            });
        }
    };
    var validateOptions = function (options) {
        // gets default options from configuration file    
        var validatedOptions = clone(options || {});
        validatedOptions.name = validatedOptions.name || configuration.get("name");
        validatedOptions.proxy = validatedOptions.proxy || configuration.get("proxy");
        validatedOptions.credentials = validatedOptions.credentials || configuration.get("credentials");
        // validates options
        if (!validatedOptions.name || typeof validatedOptions.name !== "string")
            throw Error.create("'options.name' is missing o invalid.");
        Object.defineProperty(self, "config", {
            enumerable: false,
            configurable: false,
            writable: false,
            value: validatedOptions
        });
    };
    var loadNPM = function (cb) {
        winston.info("Loading NPM ...");
        npm.load({ loglevel: "silent" }, function (err, instance) {
            if (err)
                return cb(Error.create("Couldn't load NPM module.", err));
            winston.info("NPM Loaded");
            npm = instance;
            return cb();
        });
    };
    var emit = function (eventName, data) {
        winston.verbose("Emitting: " + eventName);
        winston.debug("\t", data);
        client.emit(eventName, data);
    };
    var on = function (eventName, cb) {
        client.on(eventName, function () {
            winston.verbose("Event: " + eventName);
            var args = Array.prototype.slice.call(arguments, 0);
            winston.debug("\t", args);
            cb.apply(self, args);
            if (eventName === "connect" || eventName === "disconnect") {
                self.emit(eventName, {});
            }
        });
    };
    var hookEvents = function (client) {
        var registerTimeout;
        on("connect", function () {
            client.socket.transport.websocket._socket.socket.setKeepAlive(true);
            emit("register", self.config.name);    // waits for the response event, 'registered'
        });
        ss(client).on("tunnel-connection", function (streamFromAgent, data, cb) {
            var cn = net.createConnection(data.port, data.host);
            cn.once("error", cb).on("connect", function () {
                cn.removeListener("error", cb);
                streamFromAgent.pipe(cn);
                cn.pipe(streamFromAgent);
                streamFromAgent.on("end", function () {
                    winston.debug("Agent: tunnel's stream closed. Closing local connection.", typeof cn.destroy);
                    cn.destroy();
                    winston.debug("Agent: local connection closed");
                });
            });
        });
        on("registered", function () {
            emit("status", "ready");
            winston.info("Agent is ready.");
        });
        on("registrationError", function () {
            winston.error("Agent couldn't be registered. Maybe its name is missing or invalid, check the configuration file.");
            process.exit(process.exitCode);
        });
        on("addService", function (data) {
            addService(data.id, data.data);
        });
        on("removeService", function (data) {
            try {
                if (!data || !data.data || typeof data.data !== "string")
                    throw Error.create("Service's name is missing or invalid.", { serviceName: data });
                var name = data.data;
                var service = self.services[name];
                if (service) {
                    if (service.instance) {
                        winston.info("Deleting connector instance.");
                        if (typeof service.instance.close === "function") {
                            try {
                                winston.verbose("Invoking connector's close method.");
                                service.instance.close(function () {
                                    winston.verbose("Connector was closed.");
                                    delete service.instance;
                                    winston.info("Connector instance was deleted.");
                                });
                            } catch (e) {
                                delete service.instance;
                                winston.info("Connector instance was deleted.");
                            }
                        } else {
                            delete service.instance;
                            winston.info("Connector instance was deleted.");
                        }
                    }
                    winston.info("Deleting service instance.");
                    delete self.services[name];
                    winston.info("Service instance was deleted.");
                } else {
                    winston.info("The agent is not hosting the service '" + name + "'");
                }
                emit("serviceRemoved", {
                    id: data.id,
                    name,
                });
            } catch (e) {
                emitServiceError("Unexpected error has occurred while was trying to remove the service '" + name + "'.", data.id, service, e);
            }
        });
        on("ping", function (data) {
            emit("pingBack", {
                id: data.id,
                data: {
                    online: true,
                    version: packageJson.version
                }
            });
        });
        on("invoke", function (command) {
            try {
                // looks for the service
                var service = self.services[command.data.service], startTimestamp;

                if (!service) {
                    winston.error("Service '" + command.data.service + "' was not found'");
                    return emit("invalidService", command);
                }

                // Callback for connector's method invocation
                var cbConnector = function (err, data, headers) {

                    var payload = {
                        id: command.id,
                        headers: headers || {},
                        streamInfo: {
                            encoder: "gzip"
                        }
                    };

                    function wireStreams (source) {
                        var count = 0;
                        var sourceCount = 0;

                        var target = source
                        .on("data", function (chunk) {
                            sourceCount += chunk.length;
                        })
                        .pipe(zlib.createGzip())
                        .on("data", function (chunk) {
                            count += chunk.length;
                        })
                        .pipe(ss.createStream())
                        .on("finish", function() {
                            logTET("Invocation: Service[" + command.data.service + "] Method[" + command.data.method + "] Plain[" + sourceCount + " bytes] Encoded[" + count + " bytes]", startTimestamp);
                        });
                        // send payload
                        ss(client).emit("response-stream", target, payload);

                        // send stream data
                        winston.verbose("Streams were wired");
                    };

                    if (!err && data instanceof Stream) {
                        winston.verbose("Emiting: response-stream");
                        
                        if (!data.readable)
                            return emit("invalidStreamResponse", command);
                        
                        payload.streamInfo.contentIsStream = true;

                        wireStreams(data);

                    } else {

                        winston.verbose ("Emiting: response-stream (JSON serialized)");

                        payload.headers["content-type"] = payload.headers["content-type"] || "application/json"; 

                        var source = JSONStream.stringify(false);
                        wireStreams(source);
                        source.end({
                            error: (err instanceof Error) ? err.message : (err || undefined),
                            data
                        });
                    }

                    logTET("Invocation: Service[" + command.data.service + "] Method[" + command.data.method + "] before transmit", startTimestamp);
                };

                var doInvoke = function (func) {
                    // invoke connector's method
                    try {
                        winston.debug("Invoking: " + command.data.service + "." + command.data.method);
                        startTimestamp = Date.now();
                        func.call(this, command.data.args, cbConnector);
                    } catch (e) {
                        var err = Error.http(400, "Method execution threw an exception.", e);
                        // if the function throws an exception, send it to the client as an error
                        winston.warn(stringify(err));
                        cbConnector(e);
                    }
                };
                // looks for the method
                var funcConnector = service.instance[command.data.method];
                winston.debug("Method was found: " + (typeof funcConnector === "function"));
                // Invokes method's function if the function was found
                if (typeof funcConnector === "function")
                    return doInvoke(funcConnector);
                // Function was not found. Sends error if lookupMethod is not defined.
                if (typeof service.instance.lookupMethod !== "function") {
                    winston.warn("Method '" + command.data.method + "' was not found and lookupMethod was not defined.");
                    return emit("invalidMethod", command);
                }
                winston.debug("'lookupMethod' was found.");
                var lookupMethodStartTimestamp = Date.now();
                // Ask for the method's function 
                service.instance.lookupMethod(command.data.method, function (err, func) {
                    if (err) {
                        winston.warn("Method '" + command.data.method + "' was not found and lookupMethod returned an error: " + stringify(err));
                        logTET("lookupMethod: Service[" + service.name + "] Method[" + command.data.method + "]", lookupMethodStartTimestamp);
                        return emit("invalidMethod", command);
                    }
                    if (!func) {
                        winston.warn("Method '" + command.data.method + "' does not exist and lookupMethod didn't find it.");
                        return emit("invalidMethod", command);
                    }
                    logTET("lookupMethod: Service[" + service.name + "] Method[" + command.data.method + "]", lookupMethodStartTimestamp);
                    winston.debug("Method was found using 'lookupMethod': " + (typeof func === "function"));
                    doInvoke(func);
                });
            } catch (e2) {
                emit("invokeError", {
                    id: command.id,
                    response: { err: Error.create("An exception was threw while was invoking method.", e2) }
                });
            }
        });
        on("error", function (e) {
            winston.error("Socket.IO Error", e);
            process.exit(process.exitCode);
        });
        on("connect_failed", function (e) {
            winston.error("Socket.IO connection failed", e);
            process.exit(process.exitCode);
        });
        on("disconnect", function () {
            winston.warn("Connection disconected!");
        });

        // id, err, data, headers, eventName        
        on("update", function (data) {
            try {
                update(data.data, function (err, result) {
                    emitCommand(data.id, err, result);
                });

            } catch (e) {
                emitCommand(data.id, e);                
            }
        });
        on("restart", function (data) {
            try {
                restart(data.data, function (err, result) {
                    emitCommand(data.id, err, result);
                });

            } catch (e) {
                emitCommand(data.id, e);                
            }
        });
        on("getLog", function (data) {
            try {
                getLog(data.data, function (err, result, headers, eventName) {
                    emitCommand(data.id, err, result, headers, eventName);
                });

            } catch (e) {
                emitCommand(data.id, e);                
            }
        });
    };
    var addingService = false;
    var addService = function (id, service) {
        winston.debug("method: addService", arguments);
        if (addingService) {
            winston.debug("addingService waiting ....");
            setTimeout(function () {
                addService(id, service);
            }, 1000);
            return;
        }
        addingService = true;
        try {
            // Validates service is not already running
            if (self.services[service.name]) {
                winston.info("Service '" + service.name + "' is already running.");
                addingService = false;
                return emit("serviceReady", {
                    id,
                    name: service.name
                });
            }
            installServiceConnector(service, function (err) {
                if (err) {
                    addingService = false;
                    return emitServiceError("An error occured while was installing the service connector.", id, service, err);
                }

                function callbackCreateServiceConnectorInstance(err2) {
                    if (err2) {
                        addingService = false;
                        return emitServiceError("An error occured while was creating the service connector instance.", id, service, err2);
                    }
                    self.services[service.name] = service;
                    winston.info("Service '" + service.name + "' is ready.");
                    emit("serviceReady", {
                        id,
                        name: service.name
                    });
                    addingService = false;
                };

                if (service.localConfigurationPath && typeof service.localConfigurationPath === "string") {
                    winston.info("loading service's config from local path:", service.localConfigurationPath);
                    fs.readFile(service.localConfigurationPath, function (err3, config) {
                        if (err3) {
                            addingService = false;
                            return emitServiceError("An error occured while was installing the service connector.", id, service, err3);
                        }

                        winston.verbose("local configuration file was read.");
                        try {
                            var configJSON = config.toString();
                            winston.debug(configJSON);
                            service.config = JSON.parse(configJSON);
                            winston.verbose("local configuration file was parsed.");
                        } catch (e) {
                            return emitServiceError("An error occured while parsing to JSON the service's local configuration file.", id, service, e);
                        }
                        createServiceConnectorInstance(service, callbackCreateServiceConnectorInstance);
                    });
                } else createServiceConnectorInstance(service, callbackCreateServiceConnectorInstance);
            });
        } catch (e) {
            emitServiceError("Unexpected error has occurred while was trying to add the service '" + service.name + "' to the agent " + self.config.name + ".", id, service, e);
            addingService = false;
        }
    };
    var getConnectorLatestVersion = function (target, cb) {
        winston.info("Checking version of: " + target);
        npm.commands.view([target], function (err, data) {
            if (err)
                return cb(Error.create("'npm show' command failed.", { target }, err));
            var latestVersion = Object.keys(data)[0];
            winston.info(target + " is : " + latestVersion);
            cb(null, latestVersion);
        });
    };
    var installServiceConnector = function (service, cb) {
        winston.debug("method: installServiceConnector", service);
        if (!service || !service.connector || typeof service.connector !== "object")
            return cb(Error.create("Connector property is missing."));
        if (!service.connector.name)
            return cb(Error.create("Invalid connector name value."));
        getDependency(service.connector.name, function (err, dep) {
            if (err)
                return cb(Error.create("Couldn't get dependency.", err));
            var target;
            var npmLink = function (target) {
                winston.info("Linking module: " + target);
                npm.commands.link([target], function (err) {
                    if (err)
                        return cb(Error.create("'npm link' command failed.", { target }, err));
                    winston.info("Module linked: " + target);
                    cb();
                });
            };
            var npmInstall = function (target) {
                winston.info("Installing module: " + target);
                npm.commands.install(npm.prefix, [target], function (err) {
                    if (err)
                        return cb(Error.create("'npm install' command failed.", { target }, err));
                    winston.info("Module installed: " + target);
                    cb();
                });
            };
            var isRepositoryURL = function (version) {
                return version.indexOf("http") === 0 || version.indexOf("git") === 0;
            };
            var isCustomConnector = function (service) {
                return service.enterpriseApi === "custom" || service.connectorName === "custom";
            };
            winston.debug("dependency: " + (dep ? dep.name + "@" + dep.version + " link: " + dep.link + " path: " + dep.realPath : "not found."));
            if (service.connector.version === "link") {
                if (dep && dep.link) {
                    winston.info("Module " + service.connector.name + " was installed.");
                    return cb();
                }
                npmLink(service.connector.name);
            } else if (isCustomConnector(service)) {
                if (isRepositoryURL(service.connector.version)) {
                    target = service.connector.version;
                } else {
                    target = service.connector.name + "@" + service.connector.version;
                    if (dep && (service.connector.version === "*" || dep.version === service.connector.version)) {
                        winston.info("Module " + target + " is already installed.");
                        return cb();
                    }
                }
                npmInstall(target);
            } else {
                target = service.connector.name + "@latest";
                getConnectorLatestVersion(target, function latestVersionHandler(err, latestVersion) {
                    if (err) {
                        return cb(Error.create("Failing getting latest version of ", { target }, err));
                    }
                    if (dep && dep.version === latestVersion) {
                        winston.info("Module " + target + " is already installed.");
                        return cb();
                    }
                    npmInstall(target);
                });
            }
        });
    };
    var createServiceConnectorInstance = function (service, cb) {
        winston.debug("method: createServiceConnectorInstance", service);
        getDependency(service.connector.name, function (err, dep) {
            var modulePath, localPath, localDir;
            if (err)
                return cb(Error.create("Couldn't get dependency.", err));
            try {
                if (service.connector.version === "link") {
                    modulePath = service.connector.name;
                    winston.debug("Module linked: " + modulePath);
                } else {
                    localPath = module.filename;
                    localDir = path.dirname(localPath);
                    modulePath = path.relative(localDir, dep.realPath);
                    winston.debug("Module absolute path: " + dep.realPath);
                    winston.debug("Module relative path: " + modulePath);
                }
                var ConnectorClass = require(modulePath);
                var startTimestamp = Date.now();
                service.instance = new ConnectorClass(service.config);
                logTET("Constructor [" + service.connector.name + "][" + service.name + "]", startTimestamp);
                self.services[service.name] = service;
                winston.verbose("Service '" + service.name + "' was added.");
                cb();
            } catch (e) {
                cb(Error.create("Couldn't create service's connector instance.", { service: service }, e));
            }
        });
    };
    var emitServiceError = function (message, id, service, err) {
        var newError = Error.create(message, service, err);
        emit("serviceError", {
            id,
            service: service.name,
            err: Error.toJson(newError)
        });
        addingService = false;
    };

    var emitCommand = function (id, err, data, headers, eventName) {

        var payload = {
            id,
            headers,
            response: {}
        };

        if (err) {
            payload.response.error = Error.toJson(err);
            return emit("commandError", payload);
        }
        if (data instanceof Stream) {
            
            if (!data.readable) {
                payload.response.error = Error.toJson(Error.create("Stream is not readable."));
                return emit("commandError", payload);
            }

            eventName = eventName || "response-stream";
            winston.verbose("Command emitting stream to '" + eventName + "'");
            
            // send response as stream
            var socketStream = ss.createStream();
            ss(client).emit(eventName, socketStream, payload);
            data.pipe(socketStream);
        } else {
            eventName = eventName || "response";

            // Populate payload
            payload.response.data = data;
            // send response
            emit(eventName, payload);

        };
    };

    var stringify = function (val, indent) {
        if (indent === undefined)
            indent = "  ";
        return JSON.stringify(val, replacer, indent);
    };
    var replacer = function (k, v) {
        if (v instanceof Error)
            return Error.toJson(v);
        return v;
    };
};

util.inherits(module.exports, EventEmitter);

// Reeturns a new copy of an object or value
var clone = function (source) {
    // is source null or a value type?
    if (source === null || typeof source !== "object")
        return source;
    // returns a copy of an array
    if (source instanceof Array)
        return source.map(clone);
    // returns a copy of a date
    if (source instanceof Date)
        return new Date(source.getTime());
    // returns a copy of an object
    var result = {};
    Object.keys(source).map(function (prop) {
        result[prop] = clone(source[prop]);
    });
    return result;
};

function formatURL(url) {
    return url.replace(/\/+$/, "");
}

function ParseLogLine(options) {
    // allow use without new
    if (!(this instanceof ParseLogLine)) {
        return new ParseLogLine(options);
    }
    // init Transform
    Transform.call(this, options);
    this.from = options.from;
    this.till = options.till;
}

util.inherits(ParseLogLine, Transform);

ParseLogLine.prototype._transform = function (chunk, enc, cb) {
    var lineTime = new Date(chunk.toString().split(" - ")[0]).getTime();
    if (lineTime > this.from && lineTime < this.till) {
        this.push(chunk);
    }
    cb();
};


function update(data, cb) {

    data = data || {};
    data.version = data.version || "latest";

    var options = {
        cmd: (process.platform === "win32") ? "npm.cmd" : "npm",
        args: ["install", "-g", "kido-agent@" + data.version],
        timeout: data.timeout
    };
    exec(options, function (err, result) {
        if (err) return cb(err);
        winston.verbose("Agent was updated. Restarting ... ")
        asyncRestart(1000);
        cb(null, { updated: true });
    });
};

function getLog(data, cb) {
    
    data = data || {};

    var from;
    var till;

    //if there were no parameters supplied, return the whole file
    if (data.from && data.till && typeof data.from === "number" && typeof data.till === "number") {
        from = data.from;
        till = data.till;
    } else {
        from = 0;
        till = Date.now();
    }

    var stream = fstream.Reader({
        "path": path.resolve(process.cwd(), "./logs/"),
        "type": "Directory"
    }).pipe(tar.Pack()).pipe(zlib.Gzip());
    
    cb (null, stream, null, "log-stream");
};

function restart(data, cb) {
    winston.verbose("cmd restart");
    data = data || {};
    var wait = data.wait || 3000;
    asyncRestart(data.wait);
    cb(null, { restarting: true, wait: data.wait });
};

function exec(data, cb) {

    if (!data) { return cb(new Error("data object is mandatory")); }
    if (!data.cmd) { return cb(new Error("data.cmd property is mandatory")); }

    var childStdOutData = "";
    var childStdErrData = "";

    var _3minutes = (3 * 60 * 1000);
    data.timeout = data.timeout || _3minutes;
    data.args = data.args || [""];

    winston.verbose("exec - creating child process");
    winston.debug("exec", data);

    var child = spawn(data.cmd, data.args, data.options);

    setTimeout(function killWhenTimeout() {
        winston.info("exec - killing child process by timeout: " + child.pid);
        child.kill(data.signal || "SIGKILL");

    }, data.timeout);

    child.stdout.on('data', function (buffer) {
        childStdOutData += buffer;
    });

    child.stderr.on('data', function (buffer) {
        childStdErrData += buffer;
    });

    child.on('exit', function (code, signal) {
        winston.verbose("exec - child process exiting", code, signal);

        //We have to make an explicit check for undefined
        //because the number 0 is a valid value. We can't use the OR (||) operator
        if (code === undefined) {
            code = null;
        }
        return cb(null, {
            code,
            signal,
            stdout: childStdOutData || "",
            stderr: childStdErrData || ""
        });
    });
};


function asyncRestart(timeout) {
    
    var action = function () {
        process.exit();
    };

    if (timeout) return setTimeout(action, timeout);
    process.nextTick(action);
};



