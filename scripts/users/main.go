package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/google/go-github/v33/github"
	"github.com/rcrowley/go-metrics"
	"golang.org/x/oauth2"
)

func cannot(err error) {
	if err != nil {
		panic(err)
	}
}

type User struct {
	ID    int64  `json:"id"`
	Login string `json:"login"`
}

func main() {
	var err error

	mUser := metrics.NewMeter()

	ctx := context.Background()

	ts := oauth2.StaticTokenSource(&oauth2.Token{AccessToken: os.Getenv("GITHUB_TOKEN")})
	tc := oauth2.NewClient(ctx, ts)

	// This needs to be the user ID you want to start from. This is not a
	// timestamp.
	since, err := strconv.ParseInt(os.Args[1], 10, 64)
	cannot(err)

	client := github.NewClient(tc)
	retries := 3

	for {
		users, res, err := client.Users.ListAll(ctx, &github.UserListOptions{
			Since: since,
			ListOptions: github.ListOptions{
				PerPage: 100,
			},
		})
		if err != nil && retries > 0 {
			fmt.Fprintf(os.Stderr, "Failed[%d]:\n%+v\n%+v\n", retries, res, err)
			retries--
			time.Sleep(1 * time.Second)
			continue
		}
		cannot(err)
		retries = 3

		if len(users) == 0 {
			break
		}

		fmt.Fprintf(os.Stderr, "%+v\n", res.Rate)

		for _, user := range users {
			since = user.GetID()

			ustr, err := json.Marshal(&User{
				Login: user.GetLogin(),
				ID:    user.GetID(),
			})
			cannot(err)

			fmt.Println(string(ustr))

			mUser.Mark(1)
		}

		fmt.Fprintf(os.Stderr, "Rate:  %f users/second\n", mUser.RateMean())

		if res.Rate.Remaining <= 1 {
			now := time.Now()
			amount := res.Rate.Reset.Time.Sub(time.Now()) + time.Minute
			fmt.Fprintf(os.Stderr, "Out of quota at %s sleeping %s until %s.\n", now, amount, now.Add(amount))

			time.Sleep(amount)
		}
	}
}
