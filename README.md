# Translateer

An unlimited free Google Translate API using Puppeteer.

> This service is provided to the public for **educational purposes only**.

## Demo and Usage

Try it out:

```bash
curl 'https://t.song.work/api?text=hello&from=en&to=zh-CN'
```

Visit <https://t.song.work/> to see more usage.

**This free demo can only serve 5 concurrent requests.** You are encouraged to host this service on your own server.

## Self-Hosted

### Option 1: Serve with Docker (Recommended)

1. Clone the repository

   ```bash
   git clone https://github.com/Songkeys/translateer.git
   ```

2. Run with Docker-Compose

   ```bash
   docker-compose up -d
   ```

### Option 2: Serve Locally

1. Clone the repository

   ```bash
   git clone https://github.com/Songkeys/translateer.git
   ```

2. Install dependencies and build

   ```bash
   npm install
   npm run build
   ```

3. Run the server

   ```bash
   npm run prod
   ```

### Environment Variables

See the markdown table below:

| Variable                | Description                                  | Default                                          |
| ----------------------- | -------------------------------------------- | ------------------------------------------------ |
| `PORT`                  | Port to listen on                            | `8999`                                           |
| `PUPPETEER_WS_ENDPOINT` | WebSocket endpoint of the Puppeteer instance | `undefined` or `ws://browserless:3000` in docker |
| `PAGE_COUNT`            | Number of browser pages to hold for speedup  | `5`                                              |

## Raycast Extension

An easy-to-use [Raycast](https://www.raycast.com) extension is provided. Check [Songkeys/raycast-extension#Translateer](https://github.com/Songkeys/raycast-extensions#translateer) for more details.

![raycast-extension-preview](https://user-images.githubusercontent.com/22665058/142718320-871b0c71-7e30-422a-889d-51d0bc6dcf88.png)
