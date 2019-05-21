import express from 'express';
import bodyParser from 'body-parser';
import botkit from 'botkit';
import cors from 'cors';
import path from 'path';
import morgan from 'morgan';

import dotenv from 'dotenv';

import yelp from 'yelp-fusion';

dotenv.config({ silent: true });


// initialize
const app = express();

// enable/disable cross origin resource sharing if necessary
app.use(cors());

// enable/disable http request logging
app.use(morgan('dev'));

// enable only if you want templating
app.set('view engine', 'ejs');

// enable only if you want static assets from folder static
app.use(express.static('static'));

// this just allows us to render ejs from the ../app/views directory
app.set('views', path.join(__dirname, '../src/views'));

// enable json message body for posting data to API
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


// default index route
app.get('/', (req, res) => {
  res.send('hi');
});

// START THE SERVER
// =============================================================================
const port = process.env.PORT || 9090;
app.listen(port);

console.log(`listening on: ${port}`);

// botkit controller
const controller = botkit.slackbot({
  debug: false,
});

// initialize slackbot
const slackbot = controller.spawn({
  token: process.env.SLACK_BOT_TOKEN,
  // this grabs the slack token we exported earlier
}).startRTM((err) => {
  // start the real time message client
  if (err) { throw new Error(err); }
});

// prepare webhook
// for now we won't use this but feel free to look up slack webhooks
controller.setupWebserver(process.env.PORT || 3001, (err, webserver) => {
  controller.createWebhookEndpoints(webserver, slackbot, () => {
    if (err) { throw new Error(err); }
  });
});

controller.hears(['hello', 'hi', 'howdy'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.api.users.info({ user: message.user }, (err, res) => {
    if (res) {
      // bot.reply(message, `Hello, ${res.user.name}!`);
      const replyWithAttachment = {
        text: `Hello, ${res.user.name}!`,
        attachments: [{
          title: 'hello',
          title_link: 'http://corndog.io/',
          text: 'Welcome to our conversation',
          image_url: 'https://media.giphy.com/media/d1FL4zXfIQZMWFQQ/giphy.gif',
        }],
      };
      bot.reply(message, replyWithAttachment);
    } else {
      bot.reply(message, 'Hello there!');
    }
  });
});


const variables = { term: '', location: '' };

controller.hears(['I\'m hungry', 'i\'m hungry', 'Im hungry'], ['direct_message', 'direct_mention', 'mention'], (bot, message) => {
  bot.startConversation(message, (err, convo) => {
    convo.ask('Would you like food recommendations near you?', (response) => {
      if (response.text === 'no') {
        bot.reply(message, 'Nevermind');
        convo.stop();
      }
      convo.next();
      convo.ask('What type of food are you interested in?', (foodResponse) => {
        variables.term = foodResponse.text;
        convo.next();
        convo.ask('Where are you?', (locationResponse) => {
          variables.location = locationResponse.text;
          bot.reply(message, 'Finding restaurants rated > 3.5');
          const yelpClient = yelp.client(process.env.YELP_API_KEY);
          yelpClient.search({
            term: variables.term,
            location: variables.location,
          }).then((yelpResponse) => {
            // console.log(response);
            yelpResponse.jsonBody.businesses.forEach((business) => {
              if (business.rating >= 3.5) {
                const businessInfo = `${business.name}:
                  Location: ${business.location.address1}, ${business.location.address2}
                  Rating: ${business.rating}
                  Price: ${business.price}
                  Phone number: ${business.display_phone}`;
                bot.reply(message, businessInfo);
              }
            });
          }).catch((e) => {
            console.log(e);
            convo.addMessage('sorry :(');
          });
          convo.stop();
        });
      });
    });
  });
});
