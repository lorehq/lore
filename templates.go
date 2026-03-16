package main

import "embed"

//go:embed templates/*
var templateFS embed.FS

//go:embed harness
var harnessFS embed.FS
