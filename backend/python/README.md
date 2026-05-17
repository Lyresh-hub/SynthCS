---
title: SynthCS Backend
emoji: 🧬
colorFrom: purple
colorTo: indigo
sdk: docker
pinned: false
---

# SynthCS Python Backend

FastAPI backend for SynthCS — synthetic data generation using CTGAN and Gaussian Copula.

## Environment Variables (set in HF Space Secrets)

| Variable | Description |
|---|---|
| `KAGGLE_USERNAME` | Your Kaggle account username |
| `KAGGLE_KEY` | Your Kaggle API key |

## API

The server runs on port 7860 (required by Hugging Face Spaces).
