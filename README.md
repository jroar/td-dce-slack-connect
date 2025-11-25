# td_slack_connector

A Slack bot that bridges Slack conversations with Talkdesk Digital Connect (DCE) virtual agents using HTTP endpoints for production deployment.

## Environment Variables

| Variable Name           | Description                                 |
|------------------------ |---------------------------------------------|
| SLACK_BOT_TOKEN         | Slack bot user OAuth token                  |
| SLACK_SIGNING_SECRET    | Slack app signing secret (for request verification) |
| TD_DCE_CLIENT_ID        | Talkdesk Digital Connect client ID          |
| TD_DCE_CLIENT_SECRET    | Talkdesk Digital Connect client secret      |
| TD_DCE_TOUCHPOINT_ID    | Talkdesk Digital Connect touchpoint ID      |
| PORT                    | Server port (optional, defaults to 8080)   |

## Slack App Configuration

In your Slack app settings (https://api.slack.com/apps):

1. **Enable Events API:**
   - Go to "Event Subscriptions"
   - Turn on "Enable Events"
   - Set Request URL to: `https://your-domain.com/slack/events`

2. **Subscribe to Bot Events:**
   - Add these events:
     - `app_mention`
     - `message.im` (for direct messages)

3. **Get your Signing Secret:**
   - Go to "Basic Information"
   - Copy the "Signing Secret" and add it to your environment variables

## API Endpoints

- `/slack/events` - Slack events endpoint (app mentions, messages)
- `/webhook` - Custom webhook endpoint for DCE responses
- `/healthcheck` - Health check endpoint

## Deploy to Google Cloud Run

### 1. Build and Push the container image

```bash
gcloud builds submit --tag gcr.io/PROJECT_ID/td-slack-autopilot-bridge
```

### 2. Deploy to Cloud Run

```bash
gcloud run deploy td-slack-autopilot-bridge \
  --image gcr.io/PROJECT_ID/td-slack-autopilot-bridge \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars SLACK_BOT_TOKEN=your_bot_token,SLACK_SIGNING_SECRET=your_signing_secret,TD_DCE_CLIENT_ID=your_client_id,TD_DCE_CLIENT_SECRET=your_client_secret,TD_DCE_TOUCHPOINT_ID=your_touchpoint_id
```

### 3. Update Slack App Configuration

After deployment, update your Slack app's Event Subscriptions URL to:
```
https://your-cloud-run-url/slack/events
```

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file with the required environment variables

3. Run the application:
```bash
node index.js
```

The server will start on `http://localhost:8080` with the following endpoints available:
- `http://localhost:8080/slack/events` - For Slack events
- `http://localhost:8080/webhook` - For custom webhooks
- `http://localhost:8080/healthcheck` - Health check