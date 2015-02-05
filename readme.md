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


## Running your agent

Once you're done with the installation, you can run your agent with the following command:

```
kido-agent run
```

It will try to reach KidoZen's servers and authenticate against it's platform. If everything goes as expected, you should see `Agent is ready.` in your terminal.

In case you don't want to store your service credentials in KidoZen's platform, you can configure the service to use a local configuration json file. Go to your **Marketplace** -> Select the **Admin** panel -> Click on **Enterprise API** section -> Select **Services** on the sidebar and create or edit the service of your choice adding the file path to your configuration file in the **Local configuration file path** field. 
![config example](http://i.imgur.com/NJZL8q2.png)
If you specify a relative path in your Marketplace, take notice that it will be relative from where your agent instance is running.

### Connecting your agent through a proxy

If you want to run your agent behind a proxy, you should configure npm by executing the following commands in your terminal:

```
npm config set proxy http://username:password@proxyserver:port
```
and
```
npm config set https-proxy https://username:password@proxyserver:port
```

Once you are done executing both commands, you can check if your npm configuration is correct by running `npm show kido-agent`. If the command outputs a configuration file, you're now able to run **kido-agent** in your system.