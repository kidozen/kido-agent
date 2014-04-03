var request = require("request");

module.exports = function (hosting, username, password, cb) {

    hosting = hosting || "";
    hosting = hosting.replace(/^https?:\/\//i, "");

    if (!hosting) return cb("please provide a valid hosting");

    var url = "https://" + hosting + "/publicapi/auth/config";

    // get the auth config for this tenant.
    request(url, function (err, res, body) {

        if (err && err.statusCode !== 200) return cb("unable to get auth configuration, make sure the hosting is correct.");

        var authConfig;
        try {
            authConfig = JSON.parse(body);
        } catch (err) {
            return cb(Error.create("unable to parse auth configuration.", {body: body}, err));
        }

        var postRequest = {
            uri: authConfig.ipEndpoint,
            method: "POST",
            form: {
                wrap_name       : username,
                wrap_password   : password,
                wrap_scope      : authConfig.authServiceScope
            }
        };

        request(postRequest, function (err, res, body) {

            if (err) return cb("unable to reach the IP endpoint");
            if (res.statusCode !== 200) return cb("unable to log in using this credentials.");

            var assertion = /<Assertion(.*)<\/Assertion>/.exec(body)[0]
            if (!assertion) return cb("unable to parse auth token.");

            var postRequest = {
                uri : authConfig.authServiceEndpoint,
                method : "POST",
                form : {
                    wrap_assertion : assertion,
                    wrap_scope : "http://management.kidozen.com/",
                    wrap_assertion_format : "SAML"
                }
            };

            request(postRequest, function (err, res, body) {

                if (err && err.statusCode !== 200) return cb("unable to log in using this credentials.");

                // one last check, make sure we have a token.
                var token;
                try {
                    token = JSON.parse(body);
                } catch (error) {
                    return cb("an error occured trying to parse the auth token.");
                }
                if (!token || !token.rawToken) return cb("you don't have access to this hosting");

                cb(null, assertion, token.rawToken);
            });
        });
    });
}
