const fs = require('fs');
const axios = require('axios');
const dateFormat = require('dateformat');
const ndjson = require('iterable-ndjson');
const redis = require('./redis.js');

async function indexSubStrs(user) {
	let substr = '';

	// Create substrings for given username (not including the username itself)
	for (let i = 0; i < user.length - 1; i++) {
		// Convert index to lowercase, but keep results in original case
		substr += user.toLowerCase().charAt(i);

		// Count the number of items in the index list
		const numRes = await redis.scard(`index:${substr}:users`);
		// If there are 5 or less items then add substring to index list
		if (numRes <= 5) {
			await redis.sadd(`index:${substr}:users`, user);
		}
	}

	// Always add the full username to the index, and since its a
	// set there should not be any duplicates :)
	await redis.sadd(`index:${user.toLowerCase()}:users`, user);
}

async function importUsers(usersFile) {
	let userIndex = 0;
	const source = fs.createReadStream(usersFile);

	// Parse usernames from file, and index them in Redis
	for await (const obj of ndjson.parse(source)) {
		const user = obj.actor_login;
		if ((userIndex % 100) == 0) {
			console.log(`user(${userIndex}): ${user}`);
		}

		await indexSubStrs(user);
		userIndex++;
	}

	process.exit(0);
}

// ImportUsers('./user_dumps/sample_users.json');

// importUsers('./user_dumps/github_users_2015.json'); // 1/1/2015
// importUsers('./user_dumps/github_users_2016.json');
// importUsers('./user_dumps/github_users_2017.json');
// importUsers('./user_dumps/github_users_2018.json');
// importUsers('./user_dumps/github_users_2019.json'); // 7/25/2019

// TODO: Download, process, and index new usernames from gharchive.org

const startDate = new Date('2019-07-25');
async function syncUsers(startDate) {
	const endDate = new Date(); // Today

	let loop = startDate;
	while (loop <= endDate) {
		const target = dateFormat(loop, 'yyyy-mm-dd');
		// Loop through 24 hours
		for (let i = 0; i <= 24; i++) {
			// Await axios.get(`http://data.gharchive.org/${target}-${i}.json.gz`);
			console.log(`http://data.gharchive.org/${target}-${i}.json.gz`);
		}

		const newDate = loop.setDate(loop.getDate() + 1);
		loop = new Date(newDate);
	}

	redis.quit();
}

syncUsers(startDate);
