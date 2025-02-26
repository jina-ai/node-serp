# node-serp

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory:
```bash
GEMINI_API_KEY=your_gemini_api_key_here
# Optional: Configure proxy
HTTPS_PROXY=http://your-proxy-url:port
```

## Usage

```bash
# Basic search
npm run search -- --q "your search query"

# Full options
npm run search -- \
  --q "best restaurants" \
  --gl "US" \
  --location "New York" \
  --hl "en" \
  --num 5 \
  --page 1
```

## Parameters

- `--q`: Search query (required)
- `--gl`: Country code (optional, default: US)
- `--location`: Specific location (optional)
- `--hl`: Language code (optional, default: en)
- `--num`: Number of results (optional, default: 10)
- `--page`: Page number (optional, default: 1)

## Proxy Support

To use behind a proxy, set the `HTTPS_PROXY` environment variable in your `.env` file:
```bash
HTTPS_PROXY=http://your-proxy-url:port
```

