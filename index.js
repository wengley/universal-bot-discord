// ===============================
// IMPORTAÇÕES PRINCIPAIS
// ===============================
const { Client, GatewayIntentBits, Collection, Partials, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { QuickDB } = require('quick.db');
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const bodyParser = require('body-parser');

// ===============================
// CONFIGURAÇÕES INICIAIS
// ===============================
dotenv.config();
const db = new QuickDB();
const prefix = '!';

// ===============================
// CONFIGURAÇÃO DO CLIENT DISCORD
// ===============================
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
// O carregamento de comandos deve ser mantido aqui

// ===============================
// EVENTOS E FUNÇÕES AUXILIARES (Lógica de Boas-Vindas REVISADA)
// ===============================

const replacePlaceholders = (text, member) => {
    if (!text) return '';
    return text
        .replace(/\{user\}/g, member.user.tag)
        .replace(/\{mention\}/g, `<@${member.id}>`)
        .replace(/\{guild\}/g, member.guild.name)
        .replace(/\{count\}/g, member.guild.memberCount);
};

// Funçao de construção de Embed aprimorada
const buildEmbed = (data, member) => {
    if (!data || !data.enabled) return null;
    try {
        const e = new EmbedBuilder();
        
        // Cor
        if (data.color) e.setColor(parseInt(data.color.replace('#', '0x'), 16));
        
        // Título e Descrição
        if (data.title) e.setTitle(replacePlaceholders(data.title, member));
        if (data.description) e.setDescription(replacePlaceholders(data.description, member));
        
        // Thumbnail: Se for true, usa o avatar do membro
        if (data.thumbnail) e.setThumbnail(member.user.displayAvatarURL());
        
        // Footer: Texto e Timestamp
        if (data.footerText) e.setFooter({ text: replacePlaceholders(data.footerText, member) });
        e.setTimestamp();
        
        return e;
    } catch (e) {
        console.error("Erro ao construir Embed:", e);
        return null;
    }
};

client.on('guildMemberAdd', async member => {
    const joinData = await db.get(`join_notif_${member.guild.id}`);
    if (!joinData || !joinData.channelId || !joinData.enabled) return;

    const ch = member.guild.channels.cache.get(joinData.channelId);
    if (!ch) return;

    const embed = buildEmbed(joinData.embed, member);
    const text = replacePlaceholders(joinData.text, member);
    
    ch.send({ content: text || null, embeds: embed ? [embed] : [] }).catch(() => {});
});

// Eventos de mensagem, login, etc. (Mantenha o código padrão)

// ===============================
// SERVIDOR WEB (EXPRESS) E AUTH
// ===============================
const app = express();
const PORT = process.env.PORT || 3000;
// ... (Configurações de EJS, static, session, passport e isAuthenticated aqui)

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.engine('ejs', require('ejs').__express); 
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const CLIENT_ID = process.env.CLIENT_ID_BOT;
const CLIENT_SECRET = process.env.CLIENT_SECRET_BOT;
const CALLBACK_URL = process.env.CALLBACK_URL;
// ... (Configuração de passport e DiscordStrategy aqui)

// ===============================
// ROTAS WEB
// ===============================
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
};

// ... (Rotas /, /login, /callback, /logout, /dashboard)

// ROTA DE BOAS-VINDAS (GET)
app.get('/dashboard/:guildId/welcome', isAuthenticated, async (req, res) => {
    const guildId = req.params.guildId;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).send('Servidor inválido ou bot não está nele.');

    // Pega as configurações atuais (ou usa padrão)
    const currentConfig = await db.get(`join_notif_${guildId}`) || {
        enabled: false,
        channelId: 'none',
        text: '👋 Olá, {mention}! Bem-vindo ao {guild}!',
        embed: { 
            enabled: true, 
            title: '🎉 Novo Membro!', 
            description: 'Fico feliz em ter você aqui. Somos {count} membros agora.', 
            color: '#5865F2', 
            footerText: 'ID do Usuário: {user}', 
            thumbnail: true // Opção para usar o avatar do membro como thumbnail
        }
    };

    res.render('guild_welcome', { 
        user: req.user,
        guild: guild,
        config: currentConfig,
        channels: guild.channels.cache.filter(c => c.type === 0), // Canais de texto
        activePage: 'welcome'
    });
});

// ROTA POST PARA SALVAR BOAS-VINDAS (NOVA)
app.post('/dashboard/:guildId/welcome/save', isAuthenticated, async (req, res) => {
    const guildId = req.params.guildId;
    const { 
        enabled, channelId, text, 
        embedEnabled, embedTitle, embedDescription, embedColor, embedFooterText, embedThumbnail 
    } = req.body;

    const newConfig = {
        enabled: enabled === 'on',
        channelId: channelId,
        text: text,
        embed: {
            enabled: embedEnabled === 'on',
            title: embedTitle || null,
            description: embedDescription || null,
            // Garante que a cor seja um HEX válido, senão usa padrão
            color: (embedColor && embedColor.startsWith('#') ? embedColor : '#5865F2'),
            footerText: embedFooterText || null,
            thumbnail: embedThumbnail === 'on', // TRUE/FALSE
        }
    };
    
    await db.set(`join_notif_${guildId}`, newConfig);

    res.json({ success: true, message: '✅ Configurações de Boas-Vindas salvas com sucesso!' });
});

// Outras Rotas (Configurações Gerais, Comandos, Logs)

// ...

// ===============================
// INICIA O BOT E O SERVIDOR WEB
// ===============================
client.login(process.env.TOKEN_BOT);
client.once('ready', () => {
    console.log(`✅ Bot online como ${client.user.tag}`);
    app.listen(PORT, () => {
        console.log(`🌐 Painel rodando na porta ${PORT}`);
    });
});