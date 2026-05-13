# Echo Worker

Background worker for the Echo application. It connects to the SQLite database and runs worker-side processing outside of the API app.

## Run Locally

From this directory:

```bash
go run .
```

From the repository root:

```bash
go run ./apps/worker
```

## Build

From the repository root:

```bash
go build -o apps/worker/bin/worker ./apps/worker
```

Then run the built binary:

```bash
./apps/worker/bin/worker
```

The default SQLite database path is relative to the directory where the command is run.
