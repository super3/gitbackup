#!/bin/bash
function users_from_file() {
    # TODO: check rate limit

	echo "https://api.github.com/rate_limit?$API_KEYS";
	rate_limit=$(curl -s "https://api.github.com/rate_limit?$API_KEYS");

    limit=$(echo "$rate_limit" | jq -c '.rate.limit');
    remaining=$(echo "$rate_limit" | jq -c '.rate.remaining');
    reset_time=$(echo "$rate_limit" | jq -c '.rate.reset');
    now=$(date +%s);

    jq -r '.actor_login' $1 | while read user; do
        echo "Github API Requests: ${remaining}/${limit}";
        while [ $remaining -le 10 ];
        do
            now=$(date +%s);
            res=$(expr $reset_time - $now);
            echo "Time remaining till API limit reset: ${res} seconds...";
            sleep 5
        done

        echo "Backing up user: ${user}";
        get_user_repos $user;
        download_user_repos $user;
    done
}

# get user's repos
function get_user_repos() {
    # make user's directory
    mkdir -p $1

	total_repos=0;

    # get a list of repos from the API
    echo '' > $1/$1.json # clear the file

	i=1;

	while : ; do
		repo=$(curl -X GET "https://api.github.com/users/${1}/repos?page=${i}&per_page=100&$API_KEYS");
		total_repos=$(($total_repos + $(echo $repo | jq length)));

		echo $repo | jq -c '.[]' >> $1/$1.json

		# assume last page if amount of repos is less than 100
	    [[ $(echo $repo | jq length) == 100 ]] || break

		i=$((i + 1));
	done

	redis-cli set "user:$1:status" "syncing";
	redis-cli set "user:${user}:total_repos" $total_repos;

	echo "${user}'s total repositories: ${total_repos}";
}

# download user's repos
function download_user_repos() {
    # params: (USERNAME PAGES)

    jq -c '' $1/$1.json | while read -r repo; do
        # find name and url from repo
        name="$(jq -r ".full_name" <<< "$repo")"
        url="$(jq -r ".html_url" <<< "$repo")"

		# if repo already cloned
		if [ -d "$name" ]; then
			# force pull
			echo "Updating ${name}...";
			cd "$name";

			# if changes exist
			if git remote update
			then
				# zip new update
				echo 'Updated';
			    cd ../../;

				zip -r "$name.zip" "$name"
			else
				echo 'Not updated'
				cd ../../;
			fi
		else
			# clone from scratch
			echo "Cloning ${name}...";
			git clone --mirror "$url" "$name";

			zip -r "$name.zip" "$name"
		fi

		echo "[debug] url: '$url'";
		echo "[debug] name: '$name'";

    done

	redis-cli set "user:$1:status" "synced";
}

# disable username/password prompt for repos with DMCA takedown etc
export GIT_TERMINAL_PROMPT=0;

# download repos
mkdir -p repos;
cd repos;

users_from_file $1
