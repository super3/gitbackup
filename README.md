# gitbackup

[![Build Status](https://travis-ci.org/ovsoinc/gitbackup.svg?branch=master)](https://travis-ci.org/ovsoinc/gitbackup) [![Coverage Status](https://coveralls.io/repos/github/ovsoinc/gitbackup/badge.svg?branch=master)](https://coveralls.io/github/ovsoinc/gitbackup?branch=master)

Backup Github user repositories.

## Scraping Users

```
node index
```

## Starting Server

```
node server
```

## Syncing Users

```
curl "http://localhost:8000/actorlogins" | ./github_repos.sh -
```
