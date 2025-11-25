require("dotenv").config( {path: '.env'});
const { App, ExpressReceiver } = require("@slack/bolt");
const express = require("express");
const { getAccessToken, createConversation, sendMessage } = require("./TdDceClient");

const conversationsMap = {};
const threadsMap = {};

// Initialize your app with bot token and signing secret for HTTP mode


const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  endpoints: '/slack/events'
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver: receiver
});

// Add middleware for parsing JSON and debugging
receiver.app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

receiver.app.use(express.json());

const webhookAuth = (req, res, next) => {
  const apiKey = req.header('X-Api-Key');
  if (apiKey && apiKey === process.env.TD_DCE_WEBHOOK_API_KEY) {
    return next();
  }
  console.log("Webhook Unauthorized");
  return res.status(401).send('Unauthorized');
};


receiver.app.get('/healthcheck', async (req, res) => {
  res.status(200).json({ message: 'Success 28sep' });
});

receiver.app.get('/maps', async (req, res) => {
  res.send({
    conversationsMap,
    threadsMap
  });
});

receiver.app.post('/webhook', webhookAuth, async (req, res) => {
  console.log('POST request to webhook endpoint');
  console.log('Body:', req.body);
  
  if(!req.body) {
    res.status(200).json({ message: 'Webhook received successfully - no body' });
    return;
  }

  console.log("Messages map");
  const { say, thread_ts } = conversationsMap[req.body.conversation_id];

  await say({
    text: req.body.payload.content,
    thread_ts: thread_ts// reply in the same thread
  });
  
  // Send a simple response
  res.status(200).json({ message: 'Webhook received successfully' });
});


app.event("app_mention", async ({ event, say }) => {
  console.log(`Mentioned by user ${event.user} in channel ${event.channel}`);

  /*console.log("Event");
  console.log(event);*/

  try {

  const accessToken = await getAccessToken();
  if(!threadsMap[event.thread_ts]) {
    const conversation = await createConversation(accessToken, process.env.TD_DCE_TOUCHPOINT_ID, event.user,   event.user + "@talkdesk.com", []);

    console.log("Conversation");
    console.log(conversation);

    const threadIdentifier = event.thread_ts ? event.thread_ts : event.ts;

    threadsMap[threadIdentifier] = {
      conversationId: conversation['id']
    };
    conversationsMap[conversation['id']] = {
          say: say,
          thread_ts: event.thread_ts ? event.thread_ts : event.ts
    };
  }

    const threadIdentifier = event.thread_ts ? event.thread_ts : event.ts;
    const messageResponse = await sendMessage(accessToken, threadsMap[threadIdentifier].conversationId, event.text);

    if(messageResponse.code == '3016011') {
      say({text: '**The Virrtual Agent finished the conversation**', thread_ts: event.thread_ts});
    }
  } catch (error) {
    console.log("Error");
    console.log(error);
  }
});



app.message(async ({ message, say, logger }) => {
  console.log("Message 1");
  if(['message_changed', 'message_deleted'].includes(message.subtype)) {
    console.log("Message changed or deleted, ignoring...");
    return;
  }

  try {
    // Only respond to direct messages (channel starts with "D")
    if (message.channel_type === "im" && !message.bot_id) {

      console.log("Message");
      console.log(message);

      const accessToken = await getAccessToken();
      if(!threadsMap[message.thread_ts]) {
        
        const conversation = await createConversation(accessToken, process.env.TD_DCE_TOUCHPOINT_ID, message.user, message.user + '@email.com', []);
        console.log("Conversation");
        console.log(conversation);

        threadsMap[message.thread_ts] = {
          conversationId: conversation['id']
        };
        conversationsMap[conversation['id']] = {
          say: say,
          thread_ts: message.thread_ts
        };
      }

      

      const messageResponse = await sendMessage(accessToken, threadsMap[message.thread_ts].conversationId, message.text);
      console.log("Message response");
      console.log(messageResponse);

      if(messageResponse.code == '3016011') {
        //say({text: '**The Virrtual Agent finished the conversation**', thread_ts: message.thread_ts});

          const conversation2 = await createConversation(accessToken, process.env.TD_DCE_TOUCHPOINT_ID, message.user, message.user + '@email.com', []);
          threadsMap[message.thread_ts] = {
            conversationId: conversation2['id']
          };
          conversationsMap[conversation2['id']] = {
            say: say,
            thread_ts: message.thread_ts
          };

          const messageResponse2 = await sendMessage(accessToken, threadsMap[message.thread_ts].conversationId, message.text);
          console.log("Message response 2. Conversation ended on DCE side. Same Slack thread, but new conversation ID.");
          console.log(messageResponse2);
      }
    }
  } catch (error) {
    logger.error(error);
  }
});

const PORT = process.env.PORT || 8080;

// Start Express server (no need to separately start Slack app in HTTP mode)
receiver.app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  console.log(`📡 Slack events endpoint available at: http://localhost:${PORT}/slack/events`);
  console.log(`📡 Custom webhook endpoint available at: http://localhost:${PORT}/webhook`);
  console.log(`Talkdesk Digital Connect Connected Account ID: ${process.env.TD_DCE_ACCOUNT_NAME}`);
});
