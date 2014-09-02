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

	node ./bin/server [--version] [--level error|warn|info|verbose|debug]

If you are planning to link local connectors then you have to run the agent under administrator's credentials.

### Init scripts for Linux

If you want to install kido-agent as a service, perform

* On Ubuntu/Debian
	`$ sudo cp installService_UBUNTU.sh /etc/init.d/kido-agent && sudo chmod +x /etc/init.d/kido-agent`

* On Red Hat/CentOS
	`$ sudo cp installService_REDHAT.sh /etc/init.d/kido-agent && sudo chmod +x /etc/init.d/kido-agent`
