# Usage

```
export GITHUB_TOKEN=your-token
go build
./users $(tail -n 1 users.json | jq -r '.id') >> users.json
```
