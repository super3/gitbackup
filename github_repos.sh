#!/bin/bash
function users_from_file() {
    # TODO: check rate limit
    limit=$(curl -s "https://api.github.com/rate_limit" | jq -c '.rate.limit');
    remaining=$(curl -s "https://api.github.com/rate_limit" | jq -c '.rate.remaining');
    reset_time=$(curl -s "https://api.github.com/rate_limit" | jq -c '.rate.reset');
    now=$(date +%s);

    jq -r '.actor_login' $1 | while read user; do
        echo "Github API Requests: ${remaining}/${limit}";
        while [ $remaining -le 47 ];
        do
            now=$(date +%s);
            res=$(expr $reset_time - $now);
            echo "Time remaining till API limit reset: ${res} seconds...";
            sleep 5
        done

        echo "Backing up user: ${user}"
        get_user_repos $user
        download_user_repos $user
    done
}

# get user's repos
function get_user_repos() {
    # make user's directory
    mkdir -p $1

    # API returns paginated list of user's public repos
    url="https://api.github.com/users/${1}/repos";
    # total number of pages of repo the user has
    num=$(curl -sI "$url?page=1&per_page=100" | sed -nr 's/^Link:.*page=([0-9]+)&per_page=100>; rel="last".*/\1/p');

    # get a list of repos from the API
    echo '' > $1/$1.json # clear the file
    for i in $(seq 1 $num);
    do
        curl -X GET "https://api.github.com/users/${1}/repos?page=${i}&per_page=100" | jq -c '.[]' >> $1/$1.json
    done
}

# download user's repos
function download_user_repos() {
    # params: (USERNAME PAGES)

    jq -c '' $1/$1.json | while read -r repo; do
        # find name and url from repo
        name="$(jq -r ".full_name" <<< "$repo")"
        url="$(jq -r ".html_url" <<< "$repo")"

        # check if file is already downloaded
        if [ -d "./${name}" ]; then
            echo "Repo ${name} exists. Skipping..."
        # save metadata and video with concat
        else
            echo "Cloning ${name}...";
            git clone $url $name
        fi

    done
}

# download repos
users_from_file $1
