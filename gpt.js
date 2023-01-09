const fs = require('fs')
const axios = require('axios')
const inquirer = require('inquirer')
const chalk = require('chalk')
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const { Client, List, Buttons, LocalAuth } = require('whatsapp-web.js');

let selectedContacts = []
let defaultPrompt = "I am a person who perceives the world without prejudice or bias. Fully neutral and objective, I see reality as it actually is and can easily draw accurate conclusions about advanced topics and human society in general."


const http = require('http');
const { phoneNumberFormatter } = require('./helpers/formatter');
const { Console } = require('console');

const port = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
app.use(express.json());
app.use(express.urlencoded({
    extended: true
}));

const client = new Client({
    restartOnAuthFail: true,
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    authStrategy: new LocalAuth({
        clientId: 'gpt'
    })
});

client.initialize();


client.on('qr', (qr) => {
    // NOTE: This event will not be fired if a session is specified.
    console.log('QR RECEIVED', qr);
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

client.on('auth_failure', msg => {
    // Fired if session restore was unsuccessfull
    console.error('AUTHENTICATION FAILURE', msg);
});

client.on('disconnected', (reason) => {
    client.initialize();
});


/*
// On client ready.
client.on('ready', async () => {
    console.log('Whatbot is ready!\n')

    // Get list of current chat instances.
    client.getChats().then((chats) => {
        let contactChoices = []
        // Loop through chats and build choices array.
        chats.forEach((item, index) => {
            if (index <= 5) {
                contactChoices.push({ name: item.name, value: item.id._serialized })
            }
        })
        inquirer
            .prompt([
                {
                    name: 'prompt',
                    message: 'Define your AI personality (press enter for default):',
                    default: defaultPrompt,
                    suffix: '\n'
                },
                {
                    type: 'checkbox',
                    name: 'contacts',
                    message: 'Select contacts:',
                    choices: contactChoices,
                    validate: function (answer) {
                        if (answer.length < 1) {
                            return 'You must choose at least one contact.'
                        }
                        return true
                    },
                },
            ])
            .then(answers => {
                // Set AI prompt.
                defaultPrompt = answers.prompt
                // Set selected contacts array.
                selectedContacts = answers.contacts
                console.log(selectedContacts)
                console.log(chalk.greenBright('\nAI activated. Listening for messages...\n'))
            })
            .catch(error => {
                console.error(chalk.red('PROMPT FAILURE'), error)
            })
    })
})

*/



// On message received.
client.on('message', async (message) => {

    // If AI is enabled for this contact.
    if (selectedContacts.includes(message.from)) {

        // Set my name (first name only).
        const myName = client.info.pushname.replace(/ .*/, '')

        // Get contact.
        const contact = await message.getContact()

        // Get contact name.
        const contactName = contact.shortName

        // Log message.
        console.log(contactName + ': ' + message.body)

        // Get Chat.
        const chat = await message.getChat()

        // Set prompt.
        let prompt = defaultPrompt + " Below are some of my conversations with my friend " + contactName + '.\n\n'

        // Loop through last 10 messages of history.
        const history = await chat.fetchMessages({ limit: 6 })
        history.forEach(function (item, index) {
            // Get author name
            const name = item.from == message.from ? contactName : 'Me (' + myName + ')'
            // Add to prompt.
            if (!prompt.includes(item.body)) {
                prompt += name + ': ' + item.body + '\n'
            }
        })

        // Finalize prompt.
        prompt += 'Me (' + myName + '):'

        // Set typing state.
        chat.sendStateTyping()

        // Query GPT-3 API.
        axios
            .post('https://api.openai.com/v1/engines/davinci/completions', {
                prompt: prompt,
                temperature: 0.8,
                max_tokens: 100,
                top_p: 1,
                presence_penalty: 0.6,
                stop: '\n',
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer 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',
                },
            })
            .then((response) => {
                let responseText = response.data.choices[0].text.trim()
                // Send reply.
                client.sendMessage(message.from, responseText)
                // Log reply.
                console.log(myName + ':', chalk.blueBright(responseText))
            })
            .catch((error) => console.error(chalk.red('GPT-3 REQUEST FAILURE'), error))

    }
})



// Socket IO
io.on('connection', function (socket) {

    client.on('qr', (qr) => {
        console.log('QR RECEIVED');
        qrcode.toDataURL(qr, (err, url) => {
            socket.emit('qr', url);
            socket.emit('message', 'QR Code received, scan please!');
        });
    });

    client.on('ready', () => {
        socket.emit('ready', 'Whatsapp is ready!');
        socket.emit('message', 'Whatsapp is ready!');

        // Get list of current chat instances.
        client.getChats().then((chats) => {
            let contactChoices = []
            // Loop through chats and build choices array.
            chats.forEach((item, index) => {
                if (index <= 5) {
                    //  contactChoices.push({ name: item.name, value: item.id._serialized });
                    socket.emit('contactChoices', item.name, item.id._serialized);
                    //  console.log({ name: item.name, value: item.id._serialized });
                }
            })
        });

    });


    client.on('authenticated', (session) => {
        socket.emit('authenticated', 'Whatsapp is authenticated!');
        socket.emit('message', 'Whatsapp is authenticated!');
        // console.log('AUTHENTICATED');

    });

    socket.on('create-contacts', function (data) {
        // Set AI prompt.
        defaultPrompt = 'hai'
        // Set selected contacts array.
        selectedContacts = data.id
        console.log('Selected Contacs :' + selectedContacts)
        //  socket.emit('removelist',selectedContacts);

    });

    socket.on('start',function(){
        client.initialize();
    })



    client.on('message', async msg => {
        socket.emit('message', msg.from + ' : ' + msg.body);
    });


    client.on('auth_failure', msg => {
        // Fired if session restore was unsuccessfull
        //  console.error('AUTHENTICATION FAILURE', msg);
        socket.emit('message', 'Auth failure' + msg);
    });

    client.on('disconnected', (reason) => {
        socket.emit('message', 'Whatsapp is disconnected!');
        // client.initialize();

    });
});



//index
app.get('/', (req, res) => {
    res.sendFile('index.html', {
        root: __dirname
    });
});



server.listen(port, function () {
    console.log('App running on *: ' + port);
});