# gitbackup

[![Build Status](https://travis-ci.org/ovsoinc/gitbackup.svg?branch=master)](https://travis-ci.org/ovsoinc/gitbackup) [![Coverage Status](https://coveralls.io/repos/github/ovsoinc/gitbackup/badge.svg?branch=master)](https://coveralls.io/github/ovsoinc/gitbackup?branch=master)

We backup and archive GitHub.

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

To avoid directories with a very large number of entries the paths will be
constructed with a hash prefix.

The general layout scheme:

| bucket      | sha256sum(username)[:8] | username | repository archive |
|-------------|-------------------------|----------|--------------------|
| github.com/ | 2b/cb/c2/d5/            | octocat/ | Hello-World.bundle |
| github.com/ | 2b/cb/c2/d5/            | octocat/ | Hello-World.zip    |
| github.com/ | 2b/cb/c2/d5/            | octocat/ | Hello-World.error  |

For example, the ZIP archive of https://github.com/octocat/Hello-World would be
located at: `github.com/2b/cb/c2/d5/octocat/Hello-World.zip`

#### Sharding

The data will be sharded across all production satellites to maximize our total
throughput and available storage. The sharding will be done per user based on
the first byte of the sha256sum of the username and then equally split among
the satellites.

Sharing allocations with our current satellites:

| satellite     | min | max |
|---------------|-----|-----|
| asia-east-1   | 00  | 55  |
| europe-west-1 | 56  | aa  |
| us-central-1  | ab  | ff  |

#### Listing a user's repositories

```sh
rclone ls 'asia-east-1:github.com/2b/cb/c2/d5/octocat/'
```

#### Getting the last update time for a repository

```sh
rclone ls 'asia-east-1:github.com/2b/cb/c2/d5/octocat/Hello-World.bundle'
```

#### Getting last error for a repository

```sh
rclone cat 'asia-east-1:github.com/2b/cb/c2/d5/octocat/Hello-World.error'
```

### Redis

#### Locks

Locks are stored as normal Redis keys with a TTL as described by
[Redlock][redlock]. The lock must be refreshed by the worker before it expires.
For example, if locks expire every 10 seconds, the worker should attempt to
relock after 5 seconds.

Initially getting the lock:

```redis
SET "lock:octocat" 1 EX 10 NX
```

Relocking:

```redis
EXPIRE "lock:octocat" 10
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

Where `0` is the last time the user fully synced or `-1` if it has never been
done.

Getting the next user to sync is accomplished by retrieving user's sorted by
score (and then skipping any that are locked):

```redis
ZRANGEBYSCORE tracked "-inf" "+inf" LIMIT 0 1
SET "lock:octocat" 1 EX 10 NX
```

---

[redlock]: https://redis.io/topics/distlock
