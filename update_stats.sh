#!/bin/bash
cd repos;

while :
do
	storage=$(du -s ./ -B1 | cut -f1);
	files=$(find "." "!" -name '.*' -type f | wc -l);
	repos=$(find . -mindepth 2 -maxdepth 2 -type d | wc -l);
	users=$(find . -mindepth 1 -maxdepth 1 -type d | wc -l);

	redis-cli set "stats:storage" "$storage";
	redis-cli set "stats:files" "$files";
	redis-cli set "stats:repos" "$repos"
	redis-cli set "stats:users" "$users"

	sleep 60;
done
