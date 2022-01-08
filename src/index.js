const Discord = require('discord.js');

let {getChannel, setBot} = require('./util')
let FAQCommand = require('./faq')
let MobpartsCommand = require('./mobparts')
let JobCommand = require('./job')
let DetectSpam = require('./spam')
let ArchiveImage = require('./archive')
let {handleMessageAwaiters} = require('./await_message')
let package = require('./../package.json')

const dotenv = require('dotenv');
dotenv.config();

const Bot = new Discord.Client({
    intents: [
        Discord.Intents.FLAGS.DIRECT_MESSAGES,
        Discord.Intents.FLAGS.DIRECT_MESSAGE_REACTIONS,
        Discord.Intents.FLAGS.GUILDS,
        Discord.Intents.FLAGS.GUILD_MESSAGES,
        Discord.Intents.FLAGS.GUILD_MESSAGE_REACTIONS,
        Discord.Intents.FLAGS.GUILD_MEMBERS,
    ],
    partials: ["MESSAGE", "CHANNEL", "REACTION", "USER", "GUILD_MEMBER"],
});

var log_channel;

Bot.login(process.env.token).catch(err => {
    throw err;
})

Bot.on('ready', msg => {
    console.log(`Bot Online! Node ${process.version}, Benchbot v${package.version}`)
    setBot(Bot);
    log_channel = getChannel('bot-log')
    if (log_channel) {
        log_channel.send(`I am back online! *v${package.version}*`)
    }
})


function relocateMessage(user, channel, trigger_member) {
    channel.send(`${user} Please relocate to the correct help channel. This keeps the server clean and helps us understand the context of your question.
        Not sure which format or help channel to use? Check out the Quickstart Wizard! <https://blockbench.net/quickstart>`.replace(/    /g, ''));

    if (!trigger_member || !trigger_member.roles || !trigger_member.roles.cache.find(role => role.name == 'Moderator')) {
        log_channel.send(`${trigger_member ? trigger_member.user : 'Unknown user'} used Relocate${user ? ` on a message by ${user}` : ''} in ${channel}.`)
    }
}

Bot.on('messageCreate', msg => {

    if (msg.author.bot) {
        return;
    }


    if (DetectSpam(msg)) return;


    if (msg.mentions.members && msg.mentions.members.first() && msg.mentions.members.first().user.id === Bot.user.id) {
        if (msg.content.toLowerCase().includes('ping')) {
            msg.channel.send('Pong')
        }
    }

    if (msg.content.includes('@Moderator')) {
        log_channel.send(`${msg.author} pinged moderators in ${msg.channel}.`)
    }
    
    handleMessageAwaiters(msg);

    if ((msg.channel.name === 'model-showcase' || msg.channel.name === 'blockbenchtober' || msg.channel.name === 'bot-test') && msg.attachments && msg.content && msg.content.substr(0, 3) === '[P]') {
        ArchiveImage(msg);
        return;
    }
    
    if (msg.channel.type == 'GUILD_TEXT' && msg.channel.name.substr(0, 5) == 'help-') {
        const channel_specific_note = {
            'help-skin-figura-modelengine': 'Help channel for Minecraft Skins, and miscellaneous Minecraft model loaders such as Model-Engine (<https://github.com/Ticxo/Model-Engine-Wiki>), Figura (<https://github.com/Blancworks/Figura/wiki>), or Animated Java (<https://github.com/Animated-Java/animated-java>)',
            'help-generic-format': 'Please only use this help channel if your model is in the "Generic Model" format!\n',
            'help-installation': 'PYou can download Blockbench from <https://blockbench.net/downloads>\nIf you have trouble launching or updating Blockbench, try to download and run the installer.\n'
        }
        if (msg.content.split(/\s+/).length <= 3) {
            msg.reply({
                content: `Please only use this channel for genuine modeling questions!\n${msg.content[0] == '!' ? 'Commands can be used in my DMs.\n' : ''}*(This message will self-destruct in 30 seconds)*`,
                allowedMentions: {repliedUser: false}
            }).then(reply => {
                setTimeout(() => {
                    reply.delete();
                    msg.delete();
                }, 30 * 1000)
            });
        } else {
            let note = channel_specific_note[msg.channel.name] || '';
            msg.startThread({
                name: `${msg.author.username}${msg.author.username.substr(-1) == 's' ? '´' : '´s'} Question`,
                reason: 'Each question should be contained in a thread',
                autoArchiveDuration: 1440,
            }).then(thread => {
                thread.send(`This thread was automatically created for answers to the question above!\n${note}When your question is answered, please close it by typing \`!close\`.`);
            })
        }
    }

    if (msg.content && msg.content.substr(0, 1) == '!') {
        var args = msg.content.split(' ');
        var cmd = args[0].substr(1)

        if (cmd == 'close' && msg.channel.type == 'GUILD_PUBLIC_THREAD') {
            function react(permitted) {
                if (permitted) {
                    msg.channel.setArchived(true, 'Closed by author');
                } else {
                    msg.reply({content: 'You don\'t have permission to do this!', allowedMentions: {repliedUser: false}});
                }
            }
            let allowed_roles = ['Moderator', 'VIP', 'Modeling Pro', 'Animating Pro'];
            msg.channel.fetchStarterMessage().then(starter_message => {
                react(starter_message.author == msg.author || msg.member.roles.cache.find(role => allowed_roles.includes(role.name)))
            }).catch(err => {
                react(msg.channel.ownerId == msg.author.id || msg.member.roles.cache.find(role => allowed_roles.includes(role.name)))
            })
            return;
        }

        if (cmd == 'faq') {
            FAQCommand(msg, args)
            return;
        }

        if (cmd == 'mobparts' && (msg.channel.name === 'help-optifine' || msg.channel.type == 'DM')) {
            MobpartsCommand(msg, args, Bot);
            return;
        }

        if (cmd == 'help') {
            msg.channel.send(`\`\`\`asciidoc
                = BENCHBOT COMMANDS =

                !help :: List commands
                !faq :: List all possible FAQs
                !faq <name> :: Answers a FAQ
                !mobparts :: Lists all entities that support OptiFine models
                !mobparts <entity> :: Lists all bones of the OptiFine model of entity
                !job new :: Creates a new Job entry. DM only
                \`\`\`
            `.replace(/    /g, ''))
            return;
        }
        

        if (cmd == 'relocate') {
            relocateMessage('', msg.channel, msg.member)
            return;
        }

        if (cmd == 'job') {

            JobCommand(msg, args);
            return;
        }
    }
})

let relevant_reactions = ['relocate', 'delete'];

Bot.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    let name = reaction._emoji.name
    let {message} = reaction;
    if (!relevant_reactions.includes(name)) return;

    if (!message.author) {
        await message.fetch();
    }

    if (name == 'relocate' && !message.author.bot && reaction.count == 1) {
        relocateMessage(message.author, message.channel, message.guild.members.cache.get(user.id))
        message.react(reaction.emoji)

    } else if (name == 'delete' && message.author.bot) {
        if (message.mentions.has(user) || (message.embeds && message.embeds[0] && message.embeds[0].description.includes(user.toString()))) {
            message.delete().catch(console.error)
        }
    }
})
