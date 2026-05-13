package main

import (
	"log"

	"github.com/gustmrg/echo/apps/worker/internal/config"
	"github.com/gustmrg/echo/apps/worker/internal/db"
)


func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}
	
	db, err := db.New(cfg.DBPath)
	if err != nil {
		log.Fatal(err)
	}

	defer db.Close()
}