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

// ===============================
// EVENTOS E FUNÇÕES AUXILIARES (Lógica de Boas-Vindas)
// ===============================

// Funções para substituição de placeholders e construção de Embed
const replacePlaceholders = (text, member) => {
    if (!text) return '';
    return text
        .replace(/\{user\}/g, member.user.tag)
        .replace(/\{mention\}/g, `<@${member.id}>`)
        .replace(/\{guild\}/g, member.guild.name)
        .replace(/\{count\}/g, member.guild.memberCount);
};

const buildEmbed = (data, member) => {
    if (!data || !data.enabled) return null;
    try {
        const e = new EmbedBuilder();
        if (data.color) e.setColor(parseInt(data.color.replace('#', '0x'), 16));
        if (data.title) e.setTitle(replacePlaceholders(data.title, member));
        if (data.description) e.setDescription(replacePlaceholders(data.description, member));
        if (data.footerText) e.setFooter({ text: replacePlaceholders(data.footerText, member) });
        if (data.thumbnail) e.setThumbnail(member.user.displayAvatarURL());
        if (data.image) e.setImage(data.imageUrl); // Se você adicionar um campo de imagem estática
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

// Outros eventos (mensagens, comandos, etc.) permanecem aqui

// ===============================
// SERVIDOR WEB (EXPRESS)
// ===============================
const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.engine('ejs', require('ejs').__express); 
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ===============================
// AUTENTICAÇÃO DISCORD E MIDDLEWARES
// ===============================
// Configurações de Session, Passport e Discord Strategy... (Mantenha as configurações da sua última versão)

// ...

const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
};


// ===============================
// ROTAS WEB (FINAL)
// ===============================

// Rota de Seleção de Servidor (Lógica de Filtro)
app.get('/dashboard', isAuthenticated, (req, res) => {
    
    const userGuilds = req.user.guilds.filter(g => {
        const perms = parseInt(g.permissions, 10);
        return ((perms & 0x8) === 0x8) || ((perms & 0x20) === 0x20); // Admin ou Gerenciar Servidor
    });

    const botGuildIds = client.guilds.cache.map(g => g.id);
    
    const dashboardGuilds = userGuilds.map(g => {
        const botInGuild = botGuildIds.includes(g.id);
        const userPerms = parseInt(g.permissions, 10);
        const canConfigure = botInGuild && (((userPerms & 0x8) === 0x8) || ((userPerms & 0x20) === 0x20));

        return {
            id: g.id,
            name: g.name,
            icon: g.icon,
            isInBot: botInGuild, 
            canConfigure: canConfigure, 
        };
    });

    res.render('dashboard', { 
        user: req.user, 
        guilds: dashboardGuilds,
        guild: null, 
        activePage: 'home' 
    }); 
});

// Rota de Atualizações
app.get('/updates', isAuthenticated, (req, res) => {
    res.render('bot_updates', { user: req.user, guild: null, activePage: 'updates' });
});

// Rota de Configurações Gerais
app.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).send('Servidor inválido ou bot não está nele.');

    // Outras configurações...

    res.render('guild_settings', { 
        user: req.user,
        guild: guild,
        channels: guild.channels.cache.filter(c => c.type === 0), // Canais de texto
        activePage: 'settings'
    });
});

// ROTA DE BOAS-VINDAS (NOVA)
app.get('/dashboard/:guildId/welcome', isAuthenticated, async (req, res) => {
    const guildId = req.params.guildId;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).send('Servidor inválido ou bot não está nele.');

    // Pega as configurações atuais (ou usa padrão)
    const currentConfig = await db.get(`join_notif_${guildId}`) || {
        enabled: false,
        channelId: null,
        text: 'Bem-vindo, {mention}!',
        embed: { enabled: false, title: 'Nova Jornada', description: 'Obrigado por entrar no {guild}!', color: '#5865F2', footerText: 'Contamos com {count} membros.', thumbnail: true }
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
    const { enabled, channelId, text, embedEnabled, embedTitle, embedDescription, embedColor, embedFooterText, embedThumbnail } = req.body;

    const newConfig = {
        enabled: enabled === 'on',
        channelId: channelId,
        text: text,
        embed: {
            enabled: embedEnabled === 'on',
            title: embedTitle,
            description: embedDescription,
            color: embedColor,
            footerText: embedFooterText,
            thumbnail: embedThumbnail === 'on',
        }
    };
    
    await db.set(`join_notif_${guildId}`, newConfig);

    res.json({ success: true, message: 'Configurações de Boas-Vindas salvas com sucesso!' });
});


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