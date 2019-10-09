package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/eapache/channels"
	"github.com/go-resty/resty/v2"
	"github.com/jedib0t/go-pretty/table"
	"github.com/mholt/archiver"
	"github.com/rcrowley/go-metrics"
	"github.com/spacemonkeygo/errors"
	"github.com/tomnomnom/linkheader"
	"golang.org/x/sync/errgroup"
	"gopkg.in/src-d/go-git.v4"
	gitPPP "gopkg.in/src-d/go-git.v4/plumbing/protocol/packp"
	gitPT "gopkg.in/src-d/go-git.v4/plumbing/transport"
	"gopkg.in/tomb.v2"
)

// FIXME: Turn this into a proper cobra CLI.
var (
	ClientID     = os.Getenv("CLIENT_ID")
	ClientSecret = os.Getenv("CLIENT_SECRET")

	ConcurrentUsers = 1
	ConcurrentRepos = 3

	GithubURL     = "https://api.github.com"
	SupervisorURL = "http://localhost:8000"

	Client = resty.New().SetRetryCount(3)

	mUser       = metrics.NewMeter()
	mRepo       = metrics.NewMeter()
	mSize       = metrics.NewMeter()
	mQueuedSize = metrics.NewMeter()
	mTask       = metrics.NewCounter()
)

type Repository struct {
	FullName string `json:"full_name"`
	GitURL   string `json:"git_url"`
	Size     int64  `json:"size"`
}

func (repo *Repository) Clone(ctx context.Context) (err error) {
	// Purge existing repo data if it exists.
	os.RemoveAll(repo.FullName)

	fmt.Println("Cloning:", repo)

	_, err = git.PlainCloneContext(ctx, repo.FullName, true, &git.CloneOptions{
		URL:  repo.GitURL,
		Tags: git.AllTags,
	})
	if err != nil {
		return err
	}

	return nil
}

func (repo *Repository) Archive(ctx context.Context) (err error) {
	path := repo.FullName + ".tar.gz"

	// Purge existing archive if it exists.
	os.Remove(path)

	err = archiver.Archive([]string{repo.FullName}, path)
	if err != nil {
		return err
	}

	err = os.RemoveAll(repo.FullName)
	if err != nil {
		return err
	}

	// Upload to storj... and then remove.
	err = os.RemoveAll(path)
	if err != nil {
		return err
	}

	return err
}

type Repositories []Repository

func (repos Repositories) Mirror(ctx context.Context, concurrent int) (err error) {
	sem := make(chan bool, concurrent)

	g, ctx := errgroup.WithContext(ctx)

	for _, repo := range repos {
		sem <- true

		repo := repo
		g.Go(func() (err error) {
			defer func() {
				<-sem
			}()

			mQueuedSize.Mark(repo.Size)

			err = repo.Clone(ctx)
			if err != nil {
				// Skip empty repositories.
				if err == gitPT.ErrEmptyRemoteRepository {
					fmt.Println("Skipping empty repository:", repo)
					return nil
				}

				switch err.(type) {
				// Skip "non-repo" (e.g. when a DMCA take down has removed the repo).
				case *gitPPP.ErrUnexpectedData:
					fmt.Println("Skipping invalid repository:", repo, err)
					return nil
				}

				return err
			}

			err = repo.Archive(ctx)
			if err != nil {
				return err
			}

			mSize.Mark(repo.Size)
			mRepo.Mark(1)

			return nil
		})
	}

	return g.Wait()
}

type Username string
type Usernames []string

func nextURL(headers http.Header) (url string) {
	linkHeader, ok := headers["Link"]
	if ok {
		links := linkheader.ParseMultiple(linkHeader).FilterByRel("next")
		if len(links) > 0 {
			url = links[0].URL
		}
	}

	return url
}

func (username Username) GetRepositories(ctx context.Context) (repos Repositories, err error) {
	url := GithubURL + "/users/" + string(username) + "/repos"

	for len(url) > 0 {
		res, err := Client.R().
			SetContext(ctx).
			SetQueryParams(map[string]string{
				"client_id":     ClientID,
				"client_secret": ClientSecret,
			}).
			SetResult(Repositories{}).
			Get(url)
		if err != nil {
			return nil, err
		}

		url = nextURL(res.Header())

		rs := res.Result().(*Repositories)
		if rs == nil {
			break
		}

		repos = append(repos, *rs...)
	}

	return repos, nil
}

// FIXME: Add a proper logger to the task? Probably via the context?
type Task struct {
	t *tomb.Tomb

	username Username
	repos    Repositories
}

type Tasks []Task

func NewTask(ctx context.Context) (t *Task, err error) {
	t = &Task{}

	t.t, _ = tomb.WithContext(ctx)

	t.username, err = t.lock()
	if err != nil {
		return nil, err
	}

	t.t.Go(t.loop)

	return t, nil
}

// FIXME: Remove return of username. It isn't needed since state is carried on
// the task.
func (t *Task) lock() (username Username, err error) {
	url := SupervisorURL + "/lock"

	res, err := Client.R().
		SetContext(t.t.Context(nil)).
		Post(url)
	if err != nil {
		fmt.Println("Failed to lock:", t.username, err, res.Status())
		return "", err
	}

	ru := res.String()
	if len(ru) < 3 {
		return "", errors.New("Failed to get a username.")
	}

	u := ru[1 : len(ru)-1]
	fmt.Println("Locked:", u)

	return Username(u), nil
}

func (t *Task) relock() error {
	url := SupervisorURL + "/lock/" + string(t.username)

	res, err := Client.R().
		SetContext(t.t.Context(nil)).
		Post(url)
	if err != nil {
		fmt.Println("Failed to relock:", t.username, err, res.Status())
		return err
	}

	//fmt.Println("Relocked:", t.username)

	return nil
}

func (t *Task) complete() error {
	url := SupervisorURL + "/lock/" + string(t.username) + "/complete"

	res, err := Client.R().
		SetContext(t.t.Context(nil)).
		SetQueryParam("totalRepos", strconv.Itoa(len(t.repos))).
		Post(url)
	if err != nil {
		fmt.Println("Failed to complete:", t.username, err, res.Status())
		return err
	}

	fmt.Println("Completed:", t.username, len(t.repos))

	mUser.Mark(1)

	return nil
}

func (t *Task) mirror() (err error) {
	t.repos, err = t.username.GetRepositories(t.t.Context(nil))
	if err != nil {
		return err
	}

	fmt.Println("Starting:", t.username, len(t.repos))

	err = t.repos.Mirror(t.t.Context(nil), ConcurrentRepos)
	if err != nil {
		return err
	}

	err = t.complete()
	if err != nil {
		return err
	}

	return nil
}

func (t *Task) loop() error {
	defer func() {
		mTask.Dec(1)
	}()
	mTask.Inc(1)

	go func() {
		err := t.mirror()
		t.t.Kill(err)
	}()

	for {
		select {
		case <-time.After(5 * time.Second):
			err := t.relock()
			if err != nil {
				return err
			}
		case <-t.t.Dying():
			return nil
		}
	}
}

func (t *Task) Stop() error {
	t.t.Kill(nil)

	return t.t.Wait()
}

func (t *Task) Done() error {
	return t.t.Wait()
}

type Manager struct {
	t *tomb.Tomb

	queue *channels.ResizableChannel
}

func NewManager(ctx context.Context, concurrent int) (m *Manager, err error) {
	m = &Manager{
		queue: channels.NewResizableChannel(),
	}

	m.queue.Resize(channels.BufferCap(concurrent))
	m.t, _ = tomb.WithContext(ctx)

	m.t.Go(m.loop)

	return m, nil
}

func (m *Manager) loop() error {
	signals := make(chan os.Signal, 2)
	signal.Notify(signals)

	for {
		select {
		case sig := <-signals:
			switch sig {
			case syscall.SIGINT:
				m.t.Kill(nil)
			case syscall.SIGTERM:
				m.t.Kill(nil)
			case syscall.SIGUSR1:
				fmt.Println("Decreasing queue by 1")
				m.queue.Resize(m.queue.Cap() - 1)
			case syscall.SIGUSR2:
				fmt.Println("Increasing queue by 1")
				m.queue.Resize(m.queue.Cap() + 1)

				http.DefaultTransport.(*http.Transport).MaxIdleConnsPerHost = int(m.queue.Cap()) * ConcurrentRepos
			}
		case <-time.After(10 * time.Second):
			t := table.NewWriter()
			t.SetStyle(table.StyleColoredBright)
			t.SetOutputMirror(os.Stdout)
			t.AppendHeader(table.Row{"Metric", "1s", "1m", "5m"})
			t.AppendRows([]table.Row{
				{"user", mUser.RateMean(), mUser.Rate1(), mUser.Rate5()},
				{"repo", mRepo.RateMean(), mRepo.Rate1(), mRepo.Rate5()},
				{"size", mSize.RateMean(), mSize.Rate1(), mSize.Rate5()},
				{"queued size", mQueuedSize.RateMean(), mQueuedSize.Rate1(), mQueuedSize.Rate5()},
				{"task", mTask.Count()},
			})
			t.Render()
		case m.queue.In() <- true:
			go func() {
				defer func() {
					<-m.queue.Out()
				}()

				task, err := NewTask(m.t.Context(nil))
				if err != nil {
					m.t.Kill(err)
					return
				}

				err = task.Done()
				if err != nil {
					// FIXME: Probably only log a warning here and continue?
					m.t.Kill(err)
					return
				}
			}()
		case <-m.t.Dying():
			return nil
		}
	}
}

func (m *Manager) Stop() error {
	m.t.Kill(nil)

	return m.t.Wait()
}

func (m *Manager) Done() error {
	return m.t.Wait()
}

func main() {
	http.DefaultTransport.(*http.Transport).MaxIdleConnsPerHost = ConcurrentUsers * ConcurrentRepos

	ctx := context.Background()

	m, err := NewManager(ctx, ConcurrentUsers)
	if err != nil {
		panic(err)
	}

	err = m.Done()
	if err != nil {
		panic(err)
	}
}
