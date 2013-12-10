// Dependencies
require("simple-errors");
var request         = require("request");
var winston         = require("winston");
var configuration   = require("./configuration");
var io              = require("socket.io-client");
var ss              = require('socket.io-stream');
var url             = require("url");
var path            = require("path");
var Join            = require('join');
var getAccessToken  = require("./getAccessToken");
var npm             = require("npm");
var Stream          = require("stream");
var client          = null;

module.exports = Agent = function() {

    var self = this;    // autoreference

    Object.defineProperty(self, "services", {
        enumerable: false,
        configurable: false,
        writable: false,
        value: {}
    });

    this.initialize = function (options, cb) {

        if (!cb && typeof options === 'function') {
            cb = options;
            options = {};
        }

        try {
            winston.info("Initializing ...");

            // validatea initailization options
            validateOptions (options);
            winston.debug("Configuration:", JSON.stringify(self.config, null, "  "));

            // loads NPM module, it will be used to install connectors modules
            loadNPM(function (err) {
                if (err) return cb(err);
                winston.info("Initialized");
                cb();
            });
        } catch (e) {
            cb(Error.create("Couldn't initialize agent instance.", e));
        }
    };


    this.authenticate = function (credentials, cb) {
    
        if (!cb && typeof credentials === 'function') {
            cb = credentials;
            credentials = null;
        }

        if (!self.config) return cb(Error.create("Agent instance was not initialized."));
        winston.info("Authenticating the agent");    
        credentials = credentials || self.config.credentials || {};

        if (!credentials || typeof credentials !== 'object') return cb(Error.create("'credentials' argument is missing or invalid."));
        if (!credentials.user || typeof credentials.user !== 'string') return cb(Error.create("'credentials.user' property is missing or invalid."));
        if (!credentials.password || typeof credentials.password !== 'string') return cb(Error.create("'credentials.password' property is missing or invalid."));
        if (!credentials.marketplace || typeof credentials.marketplace !== 'string') return cb(Error.create("'credentials.marketplace' property is missing or invalid."));

        getAccessToken (credentials.marketplace, credentials.user, credentials.password, function(err, ipToken, kidoToken) {
            if (err) return cb(Error.create("Couldn't authenticate the agent.", err));

            winston.info ("Agent was authenticated.");
            self.config.ipToken = ipToken;
            self.config.kidoToken = kidoToken;
            self.config.wsEndpoint = url.resolve(credentials.marketplace, "hub").toLowerCase();
            cb();
        });
    };

    this.start = function (cb) {

        winston.info  ("Starting agent");
        if (!self.config) return cb(Error.create("Agent instance was not initialized."));
        if (!self.config.ipToken) return cb(new Error("Agent instance was not authenticated."));

        winston.info ("Requesting a socket connection to " + self.config.wsEndpoint + " ...");
        try { 
            client = io.connect(self.config.wsEndpoint, { secure: true });
            hookEvents(client);
            cb();
        } catch (e) {
            return cb(Error.create("Could't connect to WebSocket endpoint.", e));
        }
    };

    this.stop = function (cb) {
        
        winston.info  ("Stopping agent ...");
        
        if (client) {
            if (client.socket && (client.socket.connected  || client.socket.connecting)) {
                client.disconnect();
            }

            client.removeAllListeners();
            client = null;
        }

        var count = 0;
        var join = new Join();

        Object
            .keys(self.services)
            .map(function (name) { 
                winston.verbose("Searching for 'close' on service " + name);
                if (self.services[name].instance && self.services[name].instance.close) {
                    winston.verbose("Method found. Closing service " + name);
                    count++;
                    self.services[name].instance.close(join.add());
                } else {
                    winston.verbose("Method not found.");
                }
            });

        winston.verbose("Waiting for " + count + " service/s.");

        if (count) {

            join.when(function () {
                winston.info  ("The agent was stopped.");
                if(cb) cb();
            });
            return;
        }

        winston.info  ("The agent was stopped.");
        if(cb) cb();

    };

    var validateOptions = function(options)  {

        // gets default options from configuration file    
        var validatedOptions = clone(options || {});
        validatedOptions.name = validatedOptions.name || configuration.get("name");
        validatedOptions.credentials = validatedOptions.credentials || configuration.get("credentials");

        // disables multiple transport
        validatedOptions['try multiple transports'] = false 

        // validates options
        if (!validatedOptions.name || typeof validatedOptions.name !== 'string') throw Error.create("'options.name' is missing o invalid.");

        Object.defineProperty(self, "config", {
            enumerable: false,
            configurable: false,
            writable: false,
            value: validatedOptions
        });
    };

    var loadNPM = function(cb) {

        winston.info("Loading NPM ...");
        npm.load (function (err, instance) {
            if (err) return cb(Error.create("Couldn't load NPM module.", err));
            npm = instance;
            cb();
            winston.info("NPM Loaded");
        });
    };

    var emit = function(eventName, data) {
        winston.verbose ("Emitting: " + eventName);
        winston.debug ("\t", stringify(data));
        client.emit (eventName, data);
    };

    var on = function(eventName, cb) {

        client.on(eventName, function() {
            winston.verbose("Event: " + eventName);

            var args = Array.prototype.slice.call(arguments, 0);
            var msg = stringify(args);
            winston.debug("\t" + msg);

            cb.apply(self, args);
        })
    };

    var disposeInstance = function(service, cb) {
        
        if (service && service.instance) {
            winston.info ("Disposing connector instance");
            if (typeof service.instance.dispose !== 'function')
            service.instance.dispose(function (err) {
            
                if (err) {
                    winston.warn ("An error happened while disposing the connector instance of the service '" + service.name + "' .");
                    winston.warn (stringify(err));
                } else {
                    winston.info ("Connector instance was disposed.");
                }
                cb();
            });
        } else {
            winston.info ("The service does not have a connector instance.");
            cb();
        }
    };

    var hookEvents = function (client) {
        
        on("connect", function () {
            emit("register", self.config.name);
        });

        on("registered", function () {
            emit("status", "ready")
            winston.info ("Agent is ready.");
        });

        on("addService", function (data) {
            addService(data.id, data.data);
        });

        on("removeService", function (data) {
            try {
                if (!data || !data.data || typeof data.data !== 'string') throw Error.create("Service's name is missing or invalid.", {serviceName: data});

                var name = data.data; 
                var service = self.services[name];
                if (service) {
                    
                    if (service.instance) {
                        winston.info("Deleting connector instance.");
                        if (typeof service.instance.close === 'function') {
                            try {
                                winston.verbose("Invoking connector's close method.");
                                service.instance.close(function() {
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
                emit ("serviceRemoved", { id: data.id, name: name });
            } catch (e) {
                emitServiceError ("Unexpected error has occurred while was trying to remove the service '" + name + "'.", data.id, service, e);
            }
        });

        on("ping", function (data) {
            emit ("pingBack", { id: data.id, data: true} );
        });

        on("invoke", function (command) {

            try {

                // looks for the service
                var service = self.services[command.data.service];
                if (!service) {
                    winston.error("Service '" + command.data.service + "' was not found'");
                    return emit("invalidService", command);
                }


                // Callback for connector's method invocation
                var cbConnector = function (err, data, headers) {

                    var payload = { id: command.id, headers: headers };

                    if (!err && data instanceof Stream) {
                        
                        if (!data.readable) return emit("invalidStreamResponse", command);

                        winston.verbose("Emiting: response-stream");

                        // send response as stream
                        var socketStream = ss.createStream();
                        ss(client).emit('response-stream', socketStream, payload);
                        data.pipe(socketStream);
                        return;

                    } else {

                        // Populate payload
                        payload.response = {};
                        if (err) {
                            payload.response.error = err instanceof Error ? err.message : err;
                        } else {
                            payload.response.data = data
                        }
                        // send response
                        return emit("response", payload);
                    }
                };

                var doInvoke = function(func) {

                    // invoke connector's method
                    try {
                        winston.debug("Invoking: " + command.data.service + "." + command.data.method);                
                        func.call(this, command.data.args, cbConnector);

                    } catch (e) {
                        var err = Error.http(400, "Method execution threw an exception.", e);
                        // if the function throws an exception, send it to the client as an error
                        winston.warn(stringify(err));
                        cbConnector(e);
                    };
                };

                // looks for the method
                var funcConnector = service.instance[command.data.method];
                winston.debug("Method was found: " + (typeof funcConnector === 'function'));

                // Invokes method's function if the function was found
                if (typeof funcConnector === 'function') return doInvoke(funcConnector);

                // Function was not found. Sends error if lookupMethod is not defined.
                if (typeof service.instance.lookupMethod !== 'function') {
                    winston.warn("Method '" + command.data.method + "' was not found and lookupMethod was not defined.");
                    return emit("invalidMethod", command);
                }

                winston.debug("'lookupMethod' was found.");

                // Ask for the method's function 
                service.instance.lookupMethod(command.data.method, function (err, func) {
         
                    if (err) {
                        winston.warn("Method '" + command.data.method + "' was not found and lookupMethod returned an error: " + JSON.stringify(err));
                        return emit("invalidMethod", command);
                    }

                    if (!func) {
                        winston.warn("Method '" + command.data.method + "' does not exist and lookupMethod didn't find it.");
                        return emit("invalidMethod", command);
                    }
    
                    winston.debug("Method was found using 'lookupMethod': " + (typeof func === 'function'));

                    doInvoke(func);
                });

            } catch (e2) {
                emit ("invokeError", {
                    id: command.id,
                    response: { err: Error.create("An exception was threw while was invoking method.", e2) }
                });
            }
        });

        on("error", function (e) {
            winston.error("Socket.IO Error: " + stringify(e));
        });

        on("connect_failed", function (e) {
            winston.error("Connection failed: " + stringify(e));
        });

        on("disconnect", function () {
            winston.warn("Connection disconected!");
        })
    };

    var addingService = false;

    var addService = function (id, service) {

        winston.debug("method: addService", arguments);
        if (addingService) { 
            winston.debug("addingService waiting ....");
            setTimeout( function() { addService(id, service); }, 1000);
            return
        };

        addingService = true;

        try {

            // Validates service is not already running 
            if (self.services[service.name]) {
                winston.info("Service '" + service.name + "' is already running.");
                addingService = false;
                return emit ("serviceReady", { id: id, name: service.name });
            };

            installServiceConnector (service, function (err) {
                if (err) {
                    addingService = false;
                    return emitServiceError("An error occured while was installing the service connector.", id, service, err);
                }

                createServiceIConnectorInstance (service, function (err) { 
                    if (err) {
                        addingService = false;
                        return emitServiceError("An error occured while was creating the service connector instance.", id, service, err);
                    }
                    
                    self.services[service.name] = service
                    winston.info("Service '" + service.name + "' was added and is ready.");
                    emit ("serviceReady", { id: id, name: service.name });
                    addingService = false;
                });
            });

        } catch (e) {
            emitServiceError ("Unexpected error has occurred while was trying to add the service '" + service.name + "' to the agent " + self.config.name + ".", id, service, e);
            addingService = false;
        }
    };

    var installServiceConnector = function (service, cb) {

        try  {

            winston.debug("method: installServiceConnector", arguments);
            
            if (!service || !service.connector || typeof service.connector !== 'object') return cb(Error.create("Connector property is missing."));

            if (!service.connector.name) return cb(Error.create("Invalid connector name value."));
            
            getDependency(service.connector.name, function (err, dep) {
                if (err) return cb(Error.create("Couldn't get dependency.", err));

                var npmLink = function(target) {
                    winston.info("Linking module: " + target);
                    npm.commands.link ([target], function (err) {
                        if (err) return cb(Error.create("'npm link' command failed.", { target: target }, err));
                        winston.info("Module linked: " + target);
                        cb();
                    });
                };

                var npmInstall = function(target) {
                    winston.info("Installing module: " + target);
                    npm.commands.install ([target], function (err) {
                        if (err) return cb(Error.create("'npm install' command failed.", { target: target }, err));
                        winston.info("Module installed: " + target);
                        cb();
                    });
                };


                winston.debug("dependency: " + (dep ? dep.name + "@" + dep.version + " link: " + dep.link + " path: " + dep.realPath : "not found."));

                if (service.connector.version === 'link') { 

                    if (dep && dep.link) {
                        winston.info("Module " + service.connector.name + " was installed.");
                        return cb();
                    };
                    npmLink(service.connector.name);

                } else {

                    var target = service.connector.name + "@" + service.connector.version;
                    if (dep && (service.connector.version === "*" || dep.version === service.connector.version)) {
                        winston.info("Module " + target + " is already installed.");
                        return cb();
                    };
                    npmInstall(target);
                }
            });
            
        } catch (e) {
            cb (Error.create("Couldn't install service's connector module.", { service: service }, e));
        }
    };

    var createServiceIConnectorInstance = function (service, cb) {
        winston.debug("method: createServiceIConnectorInstance", arguments);

        getDependency(service.connector.name, function (err, dep) {
            if (err) return cb(Error.create("Couldn't get dependency.", err));

            var modulePath;
            try {
                if (service.connector.version === 'link') {
                    modulePath = service.connector.name;
                    winston.debug("Module linked: " + modulePath);
                } else {
                    self.services[service.name] = service;
                    winston.info("Service '" + service.name + "' was added.");

                    var localPath = module.filename;
                    var localDir = path.dirname(localPath);
                    modulePath = path.relative(localDir, dep.realPath);
                    winston.debug("Module absolute path: " + dep.realPath);
                    winston.debug("Module relative path: " + modulePath);
                }

                var connectorClass = require(modulePath);
                service.instance = new connectorClass(service.config);
                winston.info("Service '" + service.name + "' instance was created.");
                cb();
            } catch (e) {
                cb (Error.create("Couldn't create service's connector instance.", { service: service }, e));
            }
        });
    };

    var emitServiceError = function (message, id, service, err) {
        var newError = Error.create (message, service, err);
        emit("serviceError", { id: id, service: service.name, err: Error.toJson(newError) });
        addingService = false;
    };

    var stringify = function (val, indent) {
        if (indent === undefined) indent = "  ";
        return JSON.stringify(val, replacer, indent);
    };

    var replacer = function (k, v) {
        if (v instanceof Error) return Error.toJson(v);
        return v;
    };

    var getDependency = function (name, cb) {
        require.uncache("read-installed");
        var readInstalled  = require("read-installed");
        readInstalled(".", null, null, function (err, data) {
            if (err) return cb(Error.create("Couldn't read installed modules.", err));
            cb(null, data.dependencies[name]);
        });
    };
};

 // Reeturns a new copy of an object or value
var clone =  function(source) {

    // is source null or a value type?
    if (source === null || typeof source !== 'object') return source;

    // returns a copy of an array
    if (source instanceof Array)    return source.map(clone);

    // returns a copy of a date
    if (source instanceof Date)     return new Date(source.getTime());

    // returns a copy of an object
    var result = {};
    Object.keys(source).map(function(prop) { result[prop] = clone(source[prop]); });
    return result;
};



/**
 * Removes a module from the cache
 */
require.uncache = function (moduleName) {
    // Run over the cache looking for the files
    // loaded by the specified module name
    require.searchCache(moduleName, function (mod) {
        delete require.cache[mod.id];
    });
};

/**
 * Runs over the cache to search for all the cached
 * files
 */
require.searchCache = function (moduleName, callback) {
    // Resolve the module identified by the specified name
    var mod = require.resolve(moduleName);

    // Check if the module has been resolved and found within
    // the cache
    if (mod && ((mod = require.cache[mod]) !== undefined)) {
        // Recursively go over the results
        (function run(mod) {
            // Go over each of the module's children and
            // run over it
            mod.children.forEach(function (child) {
                run(child);
            });

            // Call the specified callback providing the
            // found module
            callback(mod);
        })(mod);
    }
};
