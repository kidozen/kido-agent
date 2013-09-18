#KidoZen Agent
Use this module to connect to the KidoZen platform and access to your Line of Business Systems even behind the firewall.

##Installation
Run npm to install the dependencies

	npm install

Create a config.json file (you can copy and edit config.json.sample)

	{
	    "name": "my-machine",
	    "credentials": {
	        "user": "my-user@kidozen.com",
	        "password": "password",
	        "marketplace": "https://my-company.kidocloud.com"
	    }
	}

Run the service

	node server.js