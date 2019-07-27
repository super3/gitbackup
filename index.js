const fs = require("fs");
var ndjson = require('ndjson');

fs.createReadStream('./users.json')
  .pipe(ndjson.parse())
  .on('data', function(obj) {
    // obj is a javascript object
    console.log("user: " + obj.actor_login);
    substr = "";
    for (var i = 0; i < obj.actor_login.length; i++) {
        substr += obj.actor_login.charAt(i);
        console.log(substr);
    }
  })
