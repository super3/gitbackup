package main

import (
	"archive/zip"
	"context"
	"fmt"
	"io"
	"io/ioutil"
	"os"
	"strconv"
	"strings"

	"storj.io/uplink"
)

func orPanic(err error) {
	if err != nil {
		panic(err)
	}
}

var repos = 0
var pythonRepos = 0
var files = 0
var bytes uint64

func downloadZip(file string, project *uplink.Project, bucket string, key string) {
	repos++

	stat, err := project.StatObject(context.Background(), bucket, key)
	orPanic(err)

	if stat.System.ContentLength > 1000000 {
		return
	}

	object, err := project.DownloadObject(context.Background(), bucket, key, nil)
	orPanic(err)

	defer object.Close()

	w, err := os.Create(file)
	orPanic(err)

	io.Copy(w, object)

	w.Close()

	r, err := zip.OpenReader(file)

	if err != nil {
		fmt.Println(err)

		return
	}

	defer r.Close()

	isPythonRepo := false

	if r != nil {
		for _, f := range r.File {

			rc, err := f.Open()
			orPanic(err)

			defer rc.Close()

			if strings.HasSuffix(f.Name, ".py") {
				isPythonRepo = true
				fmt.Printf("[%s] %s -> %s\n", file, key, f.Name)

				files++
				bytes += f.UncompressedSize64

				if files%10 == 0 {
					fmt.Printf("Found %d python files, totalling %dKB, across %d repos (%d contain python files)\n", files, bytes/1000, repos, pythonRepos)
				}
			}
		}
	}

	if isPythonRepo == true {
		pythonRepos++
	}

	r.Close()
	orPanic(err)

	os.Remove(file)
}

func worker(zips chan string, file string, project *uplink.Project, bucket string) {
	for {
		key := <-zips

		downloadZip(file, project, bucket, key)
	}
}

func main() {
	dat, err := ioutil.ReadFile(".access")

	access, err := uplink.ParseAccess("")

	orPanic(err)

	ctx := context.Background()

	project, err := uplink.OpenProject(ctx, access)

	orPanic(err)

	bucket := "github.com"

	zips := make(chan string)

	a := project.ListObjects(ctx, bucket, &uplink.ListObjectsOptions{Recursive: true})

	threads := 100

	for i := 0; i < threads; i++ {
		go worker(zips, "worker-"+strconv.Itoa(i)+".zip", project, bucket)
	}

	for a.Next() {
		key := a.Item().Key

		if strings.HasSuffix(key, ".zip") {
			zips <- key
		}
	}

	orPanic(a.Err())
}
