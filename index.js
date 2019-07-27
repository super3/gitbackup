const fs = require("fs");
var ndjson = require('ndjson');

fs.createReadStream('./users.json')
  .pipe(ndjson.parse())
  .on('data', function(obj) {
    let user = obj.actor_login;
    console.log("user: " + obj.actor_login);

    substr = "";
    for (var i = 0; i < user.length; i++) {
        substr += user.charAt(i);
        console.log(substr);
    }
  })
