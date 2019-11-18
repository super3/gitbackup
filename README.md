# gitbackup

[![Build Status](https://travis-ci.org/ovsoinc/gitbackup.svg?branch=master)](https://travis-ci.org/ovsoinc/gitbackup) [![Coverage Status](https://coveralls.io/repos/github/ovsoinc/gitbackup/badge.svg?branch=master)](https://coveralls.io/github/ovsoinc/gitbackup?branch=master)

Backup Github user repositories.

## Design

Storj serves as our durable store for all data and metadata. Redis will serve
as the store for ephmerical data and data cached for speed reasons.

* Locks and last sync time in Redis (per username)
* Everything else in Storj (usernames, repos, last sync, repo count, etc)

### Storj

The durable store needs to support the following operations:

* Listing usernames
* Getting the last sync time for a username
* Getting the repository count for a username
* Listing a user's repositories
* Getting the last update time for a repository
* Getting the last error for a repository

The general layout scheme:

| schema | bucket      | username | repository archive |
|--------|-------------|----------|--------------------|
| sj://  | github.com/ | octocat/ | Hello-World.bundle |
| sj://  | github.com/ | octocat/ | Hello-World.zip    |

For example, the ZIP archive of https://github.com/octocat/Hello-World would be
located at: `sj://github.com/octocat/Hello-World.zip`

#### Listing usernames

```sh
uplink ls 'sj://github.com/'
```

#### Getting the last sync time for a username

Last sync time will be stored as metadata on the username's "directory" entry.

```sh
uplink meta get 'LastSync' 'sj://github.com/octocat'
```

#### Getting the repository count for a username

```sh
uplink meta get 'SyncdRepos' 'sj://github.com/octocat'
```

#### Listing a user's repositories

```sh
uplink ls 'sj://github.com/octocat/'
```

#### Getting the last update time for a repository

```sh
uplink meta get 'LastSync' 'sj://github.com/octocat/Hello-World.bundle'
```

#### Getting last error for a repository

```sh
uplink meta get 'Error' 'sj://github.com/octocat/Hello-World.bundle'
```

### Redis

#### Locks

Locks are stored as normal Redis keys with a TTL as described by
[Redlock][redlock]. The lock must be refreshed by the worker before it expires.
For example, if locks expire every 10 seconds, the worker should attempt to
relock after 5 seconds.

Initially getting the lock:

```redis
SET "lock:github.com/octocat" "1234.0.worker.gitbackup.org" EX 10 NX
```

Where `1234` is a random identifier the worker creates on startup.

Relocking:

```redis
SET "lock:github.com/octocat" "1234.0.worker.gitbackup.org" EX 10 XX
```

Locks are not explicitly deleted and are left to expire.

#### Last Sync

Last sync data is stored in Redis to facilitate fast calculation of which user
should be sync'd next. This data is rebuilt from the Storj bucket metadata on
start up.

Initially each user is added to the `tracked` sorted set:

```redis
ZADD tracked 0 "github.com/octocat"
```

Where `0` is the last time the user fully synced or `-inf` if it has never been
done.

Getting the next user to sync is accomplished by retrieving user's sorted by
score (and then skipping any that are locked):

```redis
ZRANGEBYSCORE tracked "-inf" "+inf" LIMIT 0 1
SET "lock:github.com/octocat" 1 EX 10 NX
```

## Setting Up Server

```
node server
```

## Syncing Users

```
apt-get install jq zip
```

```
./sync_users.sh
```

## Reset sync

```
$ redis-cli zunionstore tracked 1 tracked WEIGHTS 0
```

## Syncing Stats
```
./update_stats.sh
```

## Add Users Manually

```
node track-users.js [github_users_dump.json] [# of users to add]
```

---

[redlock]: https://redis.io/topics/distlock
