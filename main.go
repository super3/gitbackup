package main

import (
	"context"
	"fmt"
	"net/http"
	_ "net/http/pprof"
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
	"storj.io/storj/lib/uplink"
)

// FIXME: Turn this into a proper cobra CLI.
var (
	ClientID     = os.Getenv("CLIENT_ID")
	ClientSecret = os.Getenv("CLIENT_SECRET")

	ConcurrentUsers = 1
	ConcurrentRepos = 1

	GithubURL     = "https://api.github.com"
	SupervisorURL = "http://localhost:8000"

	Client = resty.New().SetRetryCount(3).AddRetryCondition(Retry429)

	sjSatellite            = os.Getenv("UPLINK_SATELLITE")
	sjAPIKey               = os.Getenv("UPLINK_API_KEY")
	sjEncryptionPassphrase = os.Getenv("UPLINK_PASSPHRASE")
	sjBucket               = os.Getenv("UPLINK_BUCKET")

	Bucket *uplink.Bucket

	mUser       = metrics.NewMeter()
	mRepo       = metrics.NewMeter()
	mSize       = metrics.NewMeter()
	mQueuedSize = metrics.NewMeter()
	mTask       = metrics.NewCounter()
	mWorking    = metrics.NewCounter()
)

func RecalibrateDefaultHTTP() {
	http.DefaultTransport.(*http.Transport).MaxIdleConns = ConcurrentUsers * ConcurrentRepos * 2
	http.DefaultTransport.(*http.Transport).MaxIdleConnsPerHost = ConcurrentUsers * ConcurrentRepos * 2
}

func Retry429(res *resty.Response, err error) bool {
	if res != nil && res.StatusCode() == 429 {
		fmt.Println("Too many requests... slowing down.", res)

		return true
	}

	return false
}

type Repository struct {
	FullName  string    `json:"full_name"`
	GitURL    string    `json:"git_url"`
	Size      int64     `json:"size"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (repo *Repository) NeedsUpdate(ctx context.Context) bool {
	path := repo.FullName + ".tar.gz"

	obj, err := Bucket.OpenObject(ctx, path)
	if err != nil {
		//fmt.Println("NeedsUpdate:", repo, "Object doesn't exist.", err)
		return true
	}

	updatedAtString, ok := obj.Meta.Metadata["UpdatedAt"]
	if !ok {
		//fmt.Println("NeedsUpdate:", repo, "Object doesn't have updated at.")
		return true
	}

	updatedAt, err := time.Parse(time.RFC3339, updatedAtString)
	if err != nil {
		//fmt.Println("NeedsUpdate:", repo, "Object has invalid updated at.", err)
		return true
	}

	//fmt.Println("NeedsUpdate?:", repo, updatedAt, "equal?", repo.UpdatedAt.Equal(updatedAt))

	return !repo.UpdatedAt.Equal(updatedAt)
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

	// Create archive and remove working directory.
	err = archiver.Archive([]string{repo.FullName}, path)
	if err != nil {
		return err
	}

	err = os.RemoveAll(repo.FullName)
	if err != nil {
		return err
	}

	// Upload archive to Storj and remove local archive.
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	err = Bucket.UploadObject(ctx, path, file, &uplink.UploadOptions{
		ContentType: "application/gzip",
		Metadata: map[string]string{
			"UpdatedAt": repo.UpdatedAt.Format(time.RFC3339),
		},
	})
	if err != nil {
		fmt.Println("Failed to upload:", repo, path, err)
		return err
	}

	fmt.Println("Upload complete:", repo, path)

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
				mWorking.Dec(1)
			}()

			mWorking.Inc(1)
			mQueuedSize.Mark(repo.Size)

			if !repo.NeedsUpdate(ctx) {
				fmt.Println("Skipping repository that doesn't need updated:", repo)
				return nil
			}

			err = ctx.Err()
			if err != nil {
				fmt.Println("Bailing...", repo)
				return err
			}

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

		err = ctx.Err()
		if err != nil {
			fmt.Println("Bailing...", repo)
			return err
		}

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

func (t *Task) relock() (err error) {
	url := SupervisorURL + "/lock/" + string(t.username)

	for i := 3; i > 0; i-- {
		var res *resty.Response
		res, err = Client.R().
			SetContext(t.t.Context(nil)).
			Post(url)
		if err == nil || err == context.Canceled {
			return nil
		}

		fmt.Println("Failed to relock:", t.username, err, res.Status())
	}
	if err != nil {
		return err
	}

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

func (t *Task) fail() error {
	url := SupervisorURL + "/lock/" + string(t.username) + "/error"

	res, err := Client.R().Post(url)
	if err != nil {
		fmt.Println("Failed to submit failure:", t.username, err, res.Status())
		return err
	}

	fmt.Println("Failed:", t.username, len(t.repos))

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
	err := t.t.Wait()
	if err != nil {
		t.fail()
	}

	return err
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

				ConcurrentUsers = int(m.queue.Cap())
				RecalibrateDefaultHTTP()
			case syscall.SIGUSR2:
				fmt.Println("Increasing queue by 1")
				m.queue.Resize(m.queue.Cap() + 1)

				ConcurrentUsers = int(m.queue.Cap())
				RecalibrateDefaultHTTP()
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
				{"working", mWorking.Count()},
				{"task", mTask.Count()},
				{"queue depth", m.queue.Len()},
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
					fmt.Println("Warning: Syncing failed:", err)
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

func OpenBucket(ctx context.Context) (bucket *uplink.Bucket, err error) {
	fmt.Println("Parsing API Key...")
	apiKey, err := uplink.ParseAPIKey(sjAPIKey)
	if err != nil {
		return nil, err
	}

	fmt.Println("Creating Uplink...")
	upl, err := uplink.NewUplink(ctx, nil)
	if err != nil {
		return nil, err
	}

	fmt.Println("Opening Project...")
	proj, err := upl.OpenProject(ctx, sjSatellite, apiKey)
	if err != nil {
		return nil, err
	}

	fmt.Println("Salting...")
	encryptionKey, err := proj.SaltedKeyFromPassphrase(ctx, sjEncryptionPassphrase)
	if err != nil {
		return nil, err
	}

	access := uplink.NewEncryptionAccessWithDefaultKey(*encryptionKey)

	fmt.Println("Opening Bucket...")
	bucket, err = proj.OpenBucket(ctx, sjBucket, access)
	if err != nil {
		return nil, err
	}

	return bucket, nil
}

func main() {
	var err error

	go http.ListenAndServe("localhost:8080", nil)

	RecalibrateDefaultHTTP()

	ctx := context.Background()

	Bucket, err = OpenBucket(ctx)
	if err != nil {
		panic(err)
	}

	m, err := NewManager(ctx, ConcurrentUsers)
	if err != nil {
		panic(err)
	}

	err = m.Done()
	if err != nil {
		panic(err)
	}
}
