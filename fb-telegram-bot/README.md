# Facebook to Telegram Photo Forwarder

This Node.js application receives webhooks from a Facebook Page and forwards any received photos to a Telegram chat.

## Prerequisites

1.  **Node.js** installed (if running locally).
2.  A **Facebook Page**.
3.  A **Facebook App** (Meta for Developers).
4.  A **Telegram Bot** (created via @BotFather).

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Variables**:
    Rename `.env.example` to `.env` and fill in the values:
    *   `FB_VERIFY_TOKEN`: A random string you create (e.g., "random_secure_string"). You will need this when setting up the webhook in the Facebook Developer Dashboard.
    *   `TELEGRAM_BOT_TOKEN`: Your Telegram Bot Token.
    *   `TELEGRAM_CHAT_ID`: Your Telegram Chat ID (where you want to receive notifications).

3.  **Run Locally**:
    ```bash
    npm start
    ```
    *Note: To test locally with Facebook, you need a public URL. Use a tool like `ngrok` to expose your local port 3000.*

## Deployment (Render.com)

1.  Push this code to a GitHub repository.
2.  Go to [Render.com](https://render.com) and create a new **Web Service**.
3.  Connect your GitHub repository.
4.  Render will detect Node.js.
    *   **Build Command**: `npm install`
    *   **Start Command**: `node index.js`
5.  Add your **Environment Variables** in the Render dashboard (same as in `.env`).
6.  Deploy!
7.  Copy your Render URL (e.g., `https://my-bot.onrender.com`).

## Facebook Webhook Configuration

1.  Go to your App in [Meta for Developers](https://developers.facebook.com/).
2.  Add the **Webhooks** product.
3.  Select **Page** from the dropdown.
4.  Click **Subscribe to this object**.
5.  **Callback URL**: Your Render URL + `/webhook` (e.g., `https://my-bot.onrender.com/webhook`).
6.  **Verify Token**: The `FB_VERIFY_TOKEN` you set in your environment variables.
7.  Click **Verify and Save**.
8.  Under the Webhooks settings for Page, subscribe to the `messages` field.
9.  **Important**: You must also add the **Messenger** product to your app, go to "Settings", and generate a Page Access Token (though this bot doesn't strictly need to *reply* to Facebook, it just reads, so the webhook subscription is the key part).
