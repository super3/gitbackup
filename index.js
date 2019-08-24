const fs = require('fs');
const zlib = require('zlib');
const axios = require('axios');
const dateFormat = require('dateformat');
const ndjson = require('iterable-ndjson');
const redis = require('./redis.js');

module.exports = {
	toSubstrings,
	indexUser,
	importUsers,
	getArchive,
	syncUsers
};

function toSubstrings(username) {
	username = username.toLowerCase();

	const substrings = [];

	for(let i = 0; i < username.length; i++) {
		substrings.push(username.slice(0, i));
	}

	return substrings;
}

async function indexUser(user) {
	const substrings = toSubstrings(user);

	for(const substring of substrings) {
		// If there are 5 or less items then add substring to index list
		if (await redis.scard(`index:${substring}:users`) <= 5) {
			await redis.sadd(`index:${substring}:users`, user);
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
		if ((userIndex % 100) === 0) {
			console.log(`user(${userIndex}): ${user}`);
		}

		await indexSubStrs(user);
		userIndex++;
	}

	redis.quit();
}

async function getArchive(target, i) {
	let outputFilename = `${target}-${i}.json.gz`;

	// this might not be working properly
	console.log(`Downloading http://data.gharchive.org/${outputFilename}...`);

	let {data} = await axios.get(`http://data.gharchive.org/${outputFilename}`, {
		responseType: 'arraybuffer'
	});

	fs.writeFileSync(`./user_dumps/${outputFilename}`, data);

	// turn json.gz file into .json file
	const json = zlib.gunzipSync(data).toString();
	fs.writeFileSync(`./user_dumps/${outputFilename.slice(0, -3)}`, json);

	// parse json and get usernames
	console.log(json.slice(0, 50));

	return ndjson.parse(json);
}

// importUsers('./user_dumps/sample_users.json');

// https://stackoverflow.com/questions/7329978/how-to-list-all-github-users
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
			const archive = await getArchive(target, i);

			const uniqueUsers = new Set();

			console.log(typeof archive)

			for await (const obj of archive) {
					const {actor: {login}} = obj;
					uniqueUsers.add(login);

					console.log([...uniqueUsers]);
			}

			console.log([...uniqueUsers]);

			break; // for testing
		}

		break; // for testing

		const newDate = loop.setDate(loop.getDate() + 1);
		loop = new Date(newDate);
	}

	redis.quit();
}

if(require.main === module) {
	syncUsers(startDate);
}
