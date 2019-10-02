# gitbackup

[![Build Status](https://travis-ci.org/ovsoinc/gitbackup.svg?branch=master)](https://travis-ci.org/ovsoinc/gitbackup) [![Coverage Status](https://coveralls.io/repos/github/ovsoinc/gitbackup/badge.svg?branch=master)](https://coveralls.io/github/ovsoinc/gitbackup?branch=master)

Backup Github user repositories.

## Starting Server

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
