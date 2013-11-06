#KidoZen Agent
Use this service to connect to the KidoZen platform and access to your Line of Business Systems even behind the firewall.

##Installation
Run npm to install the dependencies

	npm install

Create a config.json file (you can copy and edit config.json.sample)

	{
	    "name": "name-of-the-agent",	// for instance, it could be the machine's name. 
	    "credentials": {
	        "user": "my-user@kidozen.com",
	        "password": "my-password",
	        "marketplace": "https://my-company.kidocloud.com"
	    }
	}

Run the service executing:

	node ./bin/server [--level error|warn|info|verbose|debug]

If you are planning to link local connectors instead of installing specific connectors versions from [NPM](https://npmjs.org)'s registry, then you have to change the value of the NPM's preperty `prefix` to the path where nodejs was installed.

	 npm config set prefix "c:\Program Files (x86)\nodejs"
	 