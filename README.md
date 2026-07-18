# Mars Explorer AI

An autonomous AI-powered Mars science discovery platform that poses novel scientific questions about Mars and conducts research to answer them.

## Features

- **3D Mars Globe** — High-fidelity interactive Three.js rendering with 30+ named geographical features (volcanoes, canyons, craters, plains, polar caps)
- **AI Research Engine** — Powered by Zhipu GLM-4.5-Flash, autonomously poses novel Mars science questions every 2 days and generates detailed research reports over a 1-week investigation cycle
- **Research Log** — Browse all AI-posed questions and their comprehensive scientific reports
- **Discovery Timeline** — Visual timeline of the AI's ongoing research schedule
- **Authoritative Sources** — All research is grounded in data from NASA, ESA Mars Express, The Mars Society, and IGG CAS

## How It Works

1. **Question Generation** — Every 2 days, GLM-4.5-Flash proposes a novel scientific question about Mars that has not been prominently studied
2. **Research Phase** — Over 7 days, the AI investigates the question using data from four authoritative Mars science sources
3. **Report Publication** — A comprehensive, evidence-based research report is published with methodology, analysis, synthesis, and implications

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS with Three.js for 3D rendering
- **AI Model**: Zhipu GLM-4.5-Flash
- **Automation**: GitHub Actions (daily cron)
- **Hosting**: GitHub Pages

## Data Sources

| Source | URL |
|--------|-----|
| NASA Mars Science | https://science.nasa.gov/mars/ |
| ESA Mars Express | https://www.esa.int/Science_Exploration/Space_Science/Mars_Express |
| The Mars Society | https://www.marssociety.org/ |
| IGG CAS Mars Research | http://www.igg.cas.cn/Mars/ |

## Local Development

Open `index.html` in a browser, or serve with any static file server:

```bash
python3 -m http.server 8000
```

## AI Engine Setup

The AI research engine uses the Zhipu GLM-4.5-Flash API. To run it locally:

```bash
export GLM_API_KEY="your-api-key"
python3 scripts/mars_ai_engine.py data daily
```

For GitHub Actions automation, add `GLM_API_KEY` as a repository secret.
