const redis = require('./redis.js');
const ndjson = require('iterable-ndjson')
const fs = require('fs')
const source = fs.createReadStream('./users.json')

async function allSubStrs (user, userIndex) {
  substr = "";
  for (var i = 0; i < user.length; i++) {
      substr += user.charAt(i);
      //console.log(substr);

      await redis.sadd(`index:${substr}:users`, userIndex);
      console.log(`index:${substr}):users`);
  }
}

async function import_users() {
  let userIndex = 0;

  for await (const obj of ndjson.parse(source)) {
    let user = obj.actor_login;
    console.log(`user(${userIndex}): ${user}`);
    await redis.set(`users:${userIndex}`, user);

    await allSubStrs(user, userIndex);

    userIndex++;
  }

  process.exit(0);
};

import_users();
