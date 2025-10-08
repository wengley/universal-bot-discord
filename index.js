const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv'); 
const { QuickDB } = require('quick.db'); 
const db = new QuickDB(); 

// Importa o Express para criar o Servidor Web (para o Render)
const express = require('express');

// Não precisa carregar o .env no Render, mas mantenha para testes locais
dotenv.config(); 

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildMembers, 
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();
const prefix = '!';

// ===================================
// 1. CARREGAMENTO DE COMANDOS
// ===================================
const commandsPath = path.join(__dirname, 'commands');
// ATENÇÃO: Carrega TODOS os comandos, incluindo o help.js (que está corrigido).
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

    const guildId = message.guild.id;

    // --- VERIFICAÇÃO DE AFK ---
    const userAfkStatus = await db.get(`afk_${guildId}_${message.author.id}`); 
    
    if (userAfkStatus) {
        await db.delete(`afk_${guildId}_${message.author.id}`);
        
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
    
    // --- TRATAMENTO DE COMANDOS ! ---

    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName) || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

    if (!command) return;

    try {
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


// ===================================
// 5. SERVIDOR WEB PARA RENDER (Ping 24/7)
// ===================================
const app = express();

const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    if (client.isReady()) {
        res.status(200).send(`Bot Discord está online. Ping: ${client.ws.ping}ms`);
    } else {
        res.status(503).send('Bot está iniciando...');
    }
});

app.listen(PORT, () => {
    console.log(`✅ Servidor Web do Render iniciado na porta ${PORT} para manter a instância ativa.`);
});