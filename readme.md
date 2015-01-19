#KidoZen Agent
Use this service to connect to the KidoZen platform and access to your Line of Business Systems even behind the firewall.

##Requirements
You will need version 0.10.33 or greater of Node.js installed in your system. You can download it [here](http://nodejs.org/download/).

##Installation
You can install this module from npm (by executing `npm install kido-agent -g` in your terminal) or by cloning this repo in a directory. If you cloned this repo, run npm to install the dependencies

```
npm install
```

After that, you can execute `node bin/server init` to create a config.json file or just `kido-agent init` if you installed it globally with npm. Config sample:

```
{
    "name": "name-of-the-agent",	// for instance, it could be the machine's name.
    "credentials": {
        "user": "my-user@kidozen.com",
        "password": "my-password",
        "marketplace": "https://my-company.kidocloud.com"
    }
}
```

Run the service executing:

```
node bin/server [--version] [--level error|warn|info|verbose|debug]
```

If you are planning to link local connectors then you have to run the agent under administrator's credentials.

### Init scripts for Linux

If you want to install kido-agent as a service, you can execute `kido-agent install-service` or in Unix systems with the following

* On Ubuntu/Debian
	`$ sudo cp installService_UBUNTU.sh /etc/init.d/kido-agent && sudo chmod +x /etc/init.d/kido-agent`

* On Red Hat/CentOS
	`$ sudo cp installService_REDHAT.sh /etc/init.d/kido-agent && sudo chmod +x /etc/init.d/kido-agent`
