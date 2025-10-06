const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
// CORREÇÃO: Importa QuickDB e cria a instância para usar .get, .set, etc.
const { QuickDB } = require('quick.db'); 
const db = new QuickDB(); 

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Necessário para ler o conteúdo de comandos
        GatewayIntentBits.GuildMembers, // Necessário para o sistema AFK
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();
const prefix = '!';

// ===================================
// 1. CARREGAMENTO DE COMANDOS
// ===================================
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    
    if ('name' in command && 'execute' in command) {
        client.commands.set(command.name, command);
    } else {
        console.warn(`[AVISO] O comando em ${filePath} está faltando a propriedade "name" ou "execute" necessária.`);
    }
}

// ===================================
// 2. EVENTO: BOT ONLINE
// ===================================
client.once('ready', () => {
    console.log(`\n===================================`);
    console.log(`✅ Bot pronto! Conectado como ${client.user.tag}`);
    console.log(`===================================\n`);
});


// ===================================
// 3. EVENTO: MENSAGEM RECEBIDA (COMANDOS E AFK)
// ===================================
client.on('messageCreate', async message => {
    
    if (message.author.bot) return;

    // Variável para facilitar o acesso ao ID do servidor
    const guildId = message.guild.id;

    // ===================================
    // 3.1. VERIFICAÇÃO DE AFK (RETORNO E MENÇÃO)
    // ===================================

    // Verifica se o AUTOR está voltando do AFK
    const userAfkStatus = await db.get(`afk_${guildId}_${message.author.id}`); // Uso do await
    
    if (userAfkStatus) {
        await db.delete(`afk_${guildId}_${message.author.id}`);
        
        // Tenta remover a tag [AFK] do nick
        try {
            if (message.member.nickname && message.member.nickname.includes("[AFK]")) {
                const newNickname = message.member.nickname.replace(/\[AFK\]\s*/, '').trim();
                await message.member.setNickname(newNickname.length > 0 ? newNickname : null);
            }
        } catch (error) {
             // Ignora o erro de permissão de nick
        }
        
        message.channel.send(`👋 **Bem-vindo(a) de volta, ${message.author}!** Seu status AFK foi removido.`).then(msg => {
            setTimeout(() => msg.delete().catch(console.error), 7000); 
        }).catch(console.error);
    }
    
    // Verifica se a MENSAGEM MENCIONA ALGUÉM AFK
    if (message.mentions.members.size > 0) {
        message.mentions.members.forEach(async member => { // Adicionado 'async' aqui
            // Ignora menções ao próprio bot ou menções de cargos (@here/roles)
            if (member.id !== message.author.id && !member.user.bot) {
                const afkReason = await db.get(`afk_${guildId}_${member.id}`); // Uso do await

                if (afkReason) {
                    message.reply({ 
                        content: `🚨 **${member.user.username}** está AFK.\nMotivo: **${afkReason}**`,
                        allowedMentions: { repliedUser: true } 
                    }).catch(console.error);
                }
            }
        });
    }

    // ===================================
    // 3.2. TRATAMENTO DE COMANDOS !
    // ===================================

    // Verifica se a mensagem começa com o prefixo
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    // Busca o comando pelo nome ou alias
    const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

    if (!command) return;

    try {
        // CORREÇÃO CRUCIAL: Passa o objeto 'db' para o comando, permitindo que daily.js e balance.js funcionem
        command.execute(message, args, client, db); 
    } catch (error) {
        console.error(`Erro ao executar o comando ${commandName}:`, error);
        message.reply('❌ Ocorreu um erro ao tentar executar este comando!');
    }
});


// ===================================
// 4. LOGIN DO BOT
// ===================================
client.login(process.env.TOKEN_BOT);