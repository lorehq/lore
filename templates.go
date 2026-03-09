package main

import "embed"

//go:embed templates/*
var templateFS embed.FS
