var mockuire 	= require("mockuire")(module);
var server  	= new (require('events').EventEmitter)();
server.send = function(name, data, timeout) { 
	// simulates async
	setTimeout(function() { server.emit(name, data); }, timeout || 10);
};


var MockConnector = function (settings) {
	if (settings && settings.fail) throw new Error("Invalid connector cconfiguration.");

	this.config =  settings;

	this.success = function (options, cb) {
		cb(null, options);
	};

	this.failure = function (options, cb) {
		cb(new Error("failure"));
	};

	this.exception = function (options, cb) {
		throw new Error("exception");
	};
};

var mockNpm = {
	load: function(cb) { cb(null, mockNpm); },
	commands: {
		install: function(args, cb) { 
			var err = (args[0]==="mockConnector@*") ? null : new Error("NPM MOCK: Install failed.");
			setTimeout(function(){ cb(err); }, 20); // simulates async behavior
		},
		link: function(args, cb) { 
			var err = (args[0]==="mockConnector") ? null : new Error("NPM MOCK: Link failed.");
			setTimeout(function(){ cb(err); }, 20); // simulates async behavior
		}
	}
};

var AgentMockuired 	= mockuire("../lib/agent", {

	"mockConnector": MockConnector,
	"npm": mockNpm,
	"./getAccessToken": function (marketplace, user, password, cb) { 
		cb(null, "ipToken", "kidoToken");
	},
	"socket.io-client":  {
		connect: function() { return server; }
	}
});

var nock	= require("nock");
var assert	= require("assert");
var Agent 	= require("../lib/agent.js");
var winston	= require("winston");
winston.clear();
//winston.add(winston.transports.Console, {level: "debug"});

describe("Agent", function() {

	it("should be able to create an instance.", function () {
		var agent = new Agent();
		assert.ok(agent instanceof Agent);
	});

	describe("initialize", function() {

		it("should throw when invalid name", function(done) {
			var agent = new Agent();
			agent.initialize({ name: 10 }, function (err) {
	            assert.ok(err instanceof Error);
	            assert.ok(err.inner instanceof Error);
	            assert.ok(err.inner.message.indexOf("options.name") > -1);
	            done();
			});
		});

		it("should initialize if name is OK.", function(done) {
			var agent = new Agent();
			agent.initialize({ name: "foo" }, function (err) {
	            assert.ok(!err);
	            assert.ok(agent.config);
	            assert.equal("foo", agent.config.name);
	            done();
			});
		});

		it("should disable multiple transports for Socket.io.", function(done) {
			var agent = new Agent();
			agent.initialize({ name: "foo" }, function (err) {
	            assert.ok(!err);
	            assert.ok(agent.config);
	            assert.equal(false, agent.config["try multiple transports"]);
	            done();
			});
		});
	});

	describe ("authenticate", function() {

		it("should fail if the instance was not initialized", function (done) {

			var agent = new Agent();
			agent.authenticate(function (err) {
	            assert.ok(err instanceof Error);
	            assert.ok(err.message.indexOf("was not initialized") > -1);
	            done();
			});
		});		

		it("should throw when invalid credentials argument", function (done) {

			var agent = new Agent();
			agent.initialize({ name: "foo" }, function (err) {
				assert.ok(!err);
				agent.authenticate( "invalid credential", function(err) {
		            assert.ok(err instanceof Error);
		            assert.ok(err.message.indexOf("credentials") > -1);
		            done();
				});
			});
		});

		it("should throw when no user", function (done) {
			var agent = new Agent();
			agent.initialize({ name: "foo" }, function (err) {
				assert.ok(!err);
				agent.authenticate( {}, function (err) {
		            assert.ok(err instanceof Error);
		            assert.ok(err.message.indexOf("credentials.user") > -1);
		            done();
				});
			});
		});		

		it("should throw when no password", function (done) {

			var agent = new Agent();
			agent.initialize({ name: "foo" }, function (err) {
				assert.ok(!err);
				agent.authenticate( { user: "a"}, function (err) {
		            assert.ok(err instanceof Error);
		            assert.ok(err.message.indexOf("credentials.password") > -1);
		            done();
				});
			});
		});		

		it("should throw when no marketplace", function (done) {

			var agent = new Agent();
			agent.initialize({ name: "foo" }, function (err) {
				assert.ok(!err);
				agent.authenticate( { user: "a", password: "b"}, function (err) {
		            assert.ok(err instanceof Error);
		            assert.ok(err.message.indexOf("credentials.marketplace") > -1);
		            done();
				});
			});
		});

		it("should authenticate using credentials from initialization", function (done) {

    		var agent = new AgentMockuired();
			agent.initialize({ name: "foo", credentials: { user: "a", password: "b", marketplace: "http://localhost:8888" } }, function (err) {
				assert.ok(!err);
				agent.authenticate( function (err, ipToken, kidoToken) {
		            assert.ok(!err);
		            assert.equal("ipToken", agent.config.ipToken);
		            assert.equal("kidoToken", agent.config.kidoToken)
		            done();
				});
			});
		});

		it("should authenticate using passed credentials", function (done) {

    		var agent = new AgentMockuired();
			agent.initialize({ name: "foo", credentials: { user: "alfa", password: "beta", marketplace: "gama" } }, function (err) {
				assert.ok(!err);
				// should use user 'a', password 'b' and marketplace 'c'
				agent.authenticate( { user: "a", password: "b", marketplace: "http://localhost:8888" }, function (err, ipToken, kidoToken) {
		            assert.ok(!err);
		            assert.equal("ipToken", agent.config.ipToken);
		            assert.equal("kidoToken", agent.config.kidoToken)
		            done();
				});
			});
		})
	});

	describe ("start", function() {

		it("should fail if the instance was not initialized", function (done) {

			var agent = new Agent();
			agent.start(function (err) {
	            assert.ok(err instanceof Error);
	            assert.ok(err.message.indexOf("was not initialized") > -1);
	            done();
			});
		});

		it("should fail if the instance was not authenticated", function (done) {

			var agent = new Agent();
			agent.initialize({ name: "foo" }, function (err) {
				assert.ok(!err);
				agent.start(function (err) {
		            assert.ok(err instanceof Error);
		            assert.ok(err.message.indexOf("was not authenticate") > -1);
		            done();
				});
			});
		});

		it("should start", function (done) {

			var agent = new AgentMockuired();
			agent.initialize({ name: "test" }, function (err) {

				assert.ok(!err);
				agent.authenticate( { user: "a", password: "b", marketplace: "http://localhost" }, function (err) {

					assert.ok(!err);
					agent.start(function (err) {

			            done();
					});
				});
			});
		});

		describe("then should process events", function() {

			var agent = null;
			beforeEach(function (done) {

				// Clean all server listeners
				server.removeAllListeners();

				// stats a new agent instance
				agent = new AgentMockuired();
				agent.config = {
					name: "test",
					ipToken: "foo",
					wsEndpoint: "http://localhost"
				};

				agent.start(function (err) {
					assert.ok(!err);
					done();
				});
			});

			it ("on 'connect' must emit 'register' with agent's name.", function (done) {

				server.on ("register", function (data) {
					assert.equal("test", data);
					done();
				});

	            server.emit("connect");
			});

			it ("on 'registered' must emit 'status' ready.", function (done) {
				server.on ("status", function (data) {
					assert.equal("ready", data);
					done();
				});
				server.emit("registered");
			});

			describe ("on 'addService'", function () {

				it ("should install connector, start the service and emit 'serviceReady' event.", function (done) {					
					server
						.on("serviceReady", function (data) {
							assert.equal(1234, data.id); 
							assert.equal("foo", data.name);
							done();
						});

					server.emit("addService", {
						id: 1234,
						data: {
							name: "foo",
							connector: { name: "mockConnector", version: "*" },
							config: "baz"
					}});
				});

				it ("on two events for different services, should install two services sequentially.", function (done) {
					
					var count = 0;
					server.on("serviceReady", function(data) {
						if (count===0) { // first add service
							assert.equal(10, data.id); 
							assert.equal("bar-1", data.name);
							count++;
						} else { // second add service
							assert.equal(20, data.id); 
							assert.equal("bar-2", data.name);
							done();
						}
					});

					server.emit("addService", {
						id: 10,
						data: {
							name: "bar-1",
							connector: { name: "mockConnector", version: "*" },
							config: "baz"
						}
					});

					server.emit("addService", {
						id: 20,
						data: {
							name: "bar-2",
							connector: { name: "mockConnector", version: "*" },
							config: "baz"
						}
					});
				});

				it ("on two events for the same service, should not fail.", function (done) {
					
					agent.services["foo"] = { name: "foo" };

					server.on("serviceReady", function(data) {
						assert.equal(10, data.id); 
						assert.equal("foo", data.name);
						done();
					});

					server.emit("addService", { id: 10, data: { name: "foo" } }); 
				});

				it ("should link connector, start the service and emit 'serviceReady'event.", function (done) {					
					server
						.on("serviceReady", function(data) {
							assert.equal(1234, data.id); 
							assert.equal("foo", data.name);
							done();
						});

					agent.initialize({}, function(err) {
						assert.ok(!err);

						server.emit("addService", {
							id: 1234,
							data: {
								name: "foo",
								connector: { name: "mockConnector", version: "link" },
								config: "baz"
						}});
					});
				});


				it.skip ("should emit 'serverError' message if connector package does not exist.", function (done) {					
					server
						.on("serviceReady", function(data) {
							done(new Error("Shouldn't receive 'serviceReady' event"));
						})
						.on('serviceError', function(data) {
							assert.ok(data);
							assert.equal("foo", data.service);
							assert.ok(data.err instanceof Error);
							done();
						});

					server.emit("addService", {
						id: 1234,
						data: {
							name: "foo",
							connector: { name: "mockConnector", version: "*" },
							config: "baz"
					}});
				});

				it.skip ("should emit 'serverError' message if connector configuration has an error.", function (done) {
					server
						.on("serviceReady", function(data) {
							done(new Error("Shouldn't receive 'serviceReady' event"));
						})
						.on('serviceError', function(data) {
							assert.ok(data);
							assert.equal("foo", data.service);
							assert.ok(data.err instanceof Error);
							done();
						});

					server.emit("addService", {
						id: 1234,
						data: {
							name: "foo",
							connector: { "mockConnector": "*" },
							config: { fail: true}
					}});
				});
			});

			describe ("on 'removeService'", function() {

				it ("should delete connector instance, remove the service and emit 'serviceRemoved' event.", function (done) {

					var service = {
						name: "foo",
						instance: {}
					};

					agent.services["foo"] = service;

					server.on("serviceRemoved", function (data) {
						assert.ok(!service.instance);
						assert.ok(!agent.services["foo"]);
						assert.equal(10, data.id); 
						assert.equal("foo", data.name);
						done();
					});

					server.emit("removeService", {id: 10, data: "foo"});
				});

				it ("should not fail if service is not being hosted.", function (done) {

					server.on("serviceRemoved", function (data) {
						assert.equal(10, data.id); 
						assert.equal("foo", data.name);
						done();
					});

					server.emit("removeService", {id: 10, data: "foo"});
				});
			});

			it ("on 'ping' must emit 'pingBack'", function (done) {

				server.on ("pingBack", function (data) {
					assert.equal(1, data.id);
					assert.ok(data.data);
					assert.ok(data);
					done();
				});

				server.emit("ping", {id: 1});
			});

			describe ("on 'invoke'", function() {

				it ("should invoke method and emit 'response' if methods does NOT return an error.", function (done) {

					agent.services["foo"] = {
						name: "foo",
						instance: new MockConnector()
					};

					server.on("response", function (data) {
						assert.equal(10, data.id); 
						assert.ok(!data.response.error);
						assert.equal("bar", data.response.data);
						done();
					});

					server.emit("invoke", {
						id: 10, 
						data: {
							service: "foo",
							method : "success",
							args   : "bar"
						}
					});
				});

				it ("should invoke method and emit 'response' if method returns an error.", function (done) {

					agent.services["foo"] = {
						name: "foo",
						instance: new MockConnector()
					};

					server.on("response", function (data) {
						assert.equal(10, data.id); 
						assert.ok(!data.response.data);
						assert.ok(data.response.error);
						assert.equal("failure", data.response.error.message);
						done();
					});

					server.emit("invoke", {
						id: 10, 
						data: {
							service: "foo",
							method : "failure"
						}
					});
				});

				it.skip ("should invoke method and emit 'response' if method rises an exception.", function (done) {

					agent.services["foo"] = {
						name: "foo",
						instance: new MockConnector()
					};

					server.on("response", function (data) {
						assert.equal(10, data.id); 
						assert.ok(data.response.err instanceof Error);
						assert.equal("exception", data.response.err.message);
						assert.ok(!data.response.result);
						done();
					});

					server.emit("invoke", {
						id: 10, 
						data: {
							service: "foo",
							method : "exception"
						}
					});
				});

				it.skip ("should emit 'invalidService' if service is not being hosted.", function (done) {
				});

				it.skip ("should emit 'invalidMethod' if service's method does not exist.", function (done) {
				});
			});

		});
	});
});
