var request = require("request");

module.exports = function (options, cb) {

    var username    = options.credentials.user;
    var password    = options.credentials.password;
    var hosting     = (options.credentials.marketplace || "").replace(/^https?:\/\//i, "");
    var proxy       = options.proxy || null;

    if (!hosting) return cb("please provide a valid hosting");

    var url = "https://" + hosting + "/publicapi/auth/config";

    // get the auth config for this tenant.
    var options = {
        uri: url,
        proxy: proxy
    };

    request(options, function (err, res, body) {
        if (err && err.statusCode !== 200) return cb(Error.create("unable to get auth configuration, make sure the hosting is correct.", err));

        var authConfig;
        try {
            authConfig = JSON.parse(body);
        } catch (err) {
            return cb(Error.create("unable to parse auth configuration.", {body: body}, err));
        }

        var postRequest = {
            proxy: proxy,
            uri: authConfig.ipEndpoint,
            method: "POST",
            form: {
                wrap_name       : username,
                wrap_password   : password,
                wrap_scope      : authConfig.authServiceScope
            }
        };

        request(postRequest, function (err, res, body) {

            if (err) return cb(Error.create("unable to reach the IP endpoint",err));
            if (res.statusCode !== 200) return cb(Error.create("unable to log in using this credentials."));

            var assertion = /<Assertion(.*)<\/Assertion>/.exec(body)[0]
            if (!assertion) return cb(Error.create("unable to parse auth token.", { body: body }));

            var postRequest = {
                proxy: proxy,
                uri : authConfig.authServiceEndpoint,
                method : "POST",
                form : {
                    wrap_assertion : assertion,
                    wrap_scope : "http://management.kidozen.com/",
                    wrap_assertion_format : "SAML"
                }
            };

            request(postRequest, function (err, res, body) {

                if (err && err.statusCode !== 200) return cb(Error.create("unable to log in using this credentials.", err));

                // one last check, make sure we have a token.
                var token;
                try {
                    token = JSON.parse(body);
                } catch (error) {
                    return cb(Error.create("an error occured trying to parse the auth token.", { body: body }, error));
                }
                if (!token || !token.rawToken) return cb(Error.create("you don't have access to this hosting"));

                cb(null, assertion, token.rawToken);
            });
        });
    });
}
