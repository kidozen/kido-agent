var nconf = require("nconf"),
    path = require("path"),
    exec = require("child_process").exec,
    fs = require("fs");

function getConfigFilePath(){
    var applicationName = require("../package.json").name,
        searchPaths = [
            path.join(process.cwd(), "config.json"),
            path.join(__dirname, "config.json"),
            path.join(process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'], applicationName + ".config"),
            path.join((process.platform == 'win32' ? "C:\\kidozen" : "/etc/kido"), applicationName + ".config")
        ];

    return searchPaths.filter(function(p){
        try {
            fs.statSync(p);
            return true;
        } catch(e) {
            return false;
        }
    })[0] || searchPaths[0];
}

nconf
   .use("memory")
   .argv()
   .env()
   .file({ file: getConfigFilePath()})
   .defaults({});

module.exports = nconf;
