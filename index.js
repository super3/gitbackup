const redis = require('./redis.js');
const ndjson = require('iterable-ndjson')
const fs = require('fs')

async function indexSubStrs (user) {
  let substr = "";
  for (var i = 0; i < user.length - 1; i++) {
      substr += user.charAt(i);
      //console.log(substr);

      let numRes = await redis.scard(`index:${substr}:users`);

      // if there are 5 or less itmes 
      if (numRes <= 5) {
        await redis.sadd(`index:${substr}:users`, user);
        //console.log(`index:${substr}):users`);
      }
      // console.log(`index:${substr}):users`);
  }
}

async function import_users(usersFile) {
  let userIndex = 0;
  const source = fs.createReadStream(usersFile);

  // parse usernames from file, and index them in Redis
  for await (const obj of ndjson.parse(source)) {
    let user = obj.actor_login;
    console.log(`user(${userIndex}): ${user}`);
    await indexSubStrs(user);
    userIndex++;
  }

  process.exit(0);
};

async function partial_username(input) {
  return await redis.smembers(`index:${input}:users`);
}

import_users('./sample_users.json');

//import_users('./github_users_2015.json');
//import_users('./github_users_2016.json');
//import_users('./github_users_2017.json');
//import_users('./github_users_2018.json');
//import_users('./github_users_2019.json');
