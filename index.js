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
// CARREGAMENTO DE COMANDOS
// ===============================
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
    for (const file of commandFiles) {
        const cmd = require(path.join(commandsPath, file));
        if (cmd.name && cmd.execute) client.commands.set(cmd.name, cmd);
    }
} else {
    console.warn('[AVISO] Pasta "commands" não encontrada!');
}

// ===============================
// EVENTOS DISCORD
// ===============================
client.once('ready', () => {
    console.log(`✅ Bot online como ${client.user.tag}`);
});

const replacePlaceholders = (text, member) => {
    if (!text) return null;
    return text
        .replace(/{user}/g, member.user.tag)
        .replace(/{mention}/g, `<@${member.id}>`)
        .replace(/{guild}/g, member.guild.name)
        .replace(/{count}/g, member.guild.memberCount);
};

const buildEmbed = (data, member) => {
    if (!data?.enabled) return null;
    const e = new EmbedBuilder();
    if (data.color) e.setColor(parseInt(data.color.replace('#', '0x'), 16));
    if (data.title) e.setTitle(replacePlaceholders(data.title, member));
    if (data.description) e.setDescription(replacePlaceholders(data.description, member));
    if (data.footerText) e.setFooter({ text: replacePlaceholders(data.footerText, member) });
    e.setTimestamp();
    return e;
};

// ======= JOIN EVENT (Com Auto-Role e DM) =======
client.on('guildMemberAdd', async member => {
    // 1. Auto-Role
    const roleId = await db.get(`autorole_${member.guild.id}`);
    if (roleId && roleId !== 'none') {
        try {
            const role = member.guild.roles.cache.get(roleId);
            if (role) await member.roles.add(role, 'Auto-Role via Painel Web').catch(() => {});
        } catch (e) { /* Ignora */ }
    }

    // 2. Notificação de Canal
    const join = await db.get(`join_notif_${member.guild.id}`);
    if (join && join.channelId) {
        const ch = member.guild.channels.cache.get(join.channelId);
        if (ch) {
            const embed = buildEmbed(join.embed, member);
            const text = replacePlaceholders(join.text, member);
            ch.send({ content: text || null, embeds: embed ? [embed] : [] }).catch(() => {});
        }
    }
    
    // 3. Mensagem Direta (DM)
    const dmData = await db.get(`dm_notif_${member.guild.id}`);
    if (dmData) {
        const embed = buildEmbed(dmData.embed, member);
        const text = replacePlaceholders(dmData.text, member);
        member.send({ content: text || null, embeds: embed ? [embed] : [] }).catch(() => {});
    }
});

// ======= LEAVE EVENT =======
client.on('guildMemberRemove', async member => {
    const leave = await db.get(`leave_notif_${member.guild.id}`);
    if (!leave || !leave.channelId) return;
    
    const ch = member.guild.channels.cache.get(leave.channelId);
    if (!ch) return;
    
    const embed = buildEmbed(leave.embed, member);
    const text = replacePlaceholders(leave.text, member);
    
    ch.send({ content: text || null, embeds: embed ? [embed] : [] }).catch(() => {});
});

// ======= COMANDOS / AFK (Simplificado) =======
client.on('messageCreate', async message => {
    if (message.author.bot) return;

    // --- Lógica AFK (Retorno) ---
    const userAfkStatus = await db.get(`afk_${message.guild.id}_${message.author.id}`); 
    if (userAfkStatus) {
        await db.delete(`afk_${message.guild.id}_${message.author.id}`);
        message.channel.send(`👋 **Bem-vindo(a) de volta, ${message.author}!** Seu status AFK foi removido.`)
            .then(msg => setTimeout(() => msg.delete().catch(() => {}), 7000))
            .catch(() => {});
    }

    if (!message.content.startsWith(prefix)) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const name = args.shift().toLowerCase();
    const command = client.commands.get(name);
    
    if (!command) return;
    
    try {
        await command.execute(message, args, client, db);
    } catch (e) {
        console.error(e);
        message.reply('❌ Erro ao executar comando.');
    }
});

// ===============================
// LOGIN DO BOT
// ===============================
client.login(process.env.TOKEN_BOT);

// ===============================
// SERVIDOR WEB (PAINEL RENDER)
// ===============================
const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.engine('ejs', require('ejs').__express); // <--- CORREÇÃO CRÍTICA MANTIDA
app.use(express.static('public')); // <--- ESSENCIAL PARA O CSS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
    session({
        secret: process.env.SESSION_SECRET || 'uma-chave-secreta-forte',
        resave: false,
        saveUninitialized: false,
    })
);

app.use(passport.initialize());
app.use(passport.session());

const CLIENT_ID = process.env.CLIENT_ID_BOT;
const CLIENT_SECRET = process.env.CLIENT_SECRET_BOT;
const CALLBACK_URL = process.env.CALLBACK_URL;

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(
    new DiscordStrategy(
        {
            clientID: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            callbackURL: CALLBACK_URL,
            scope: ['identify', 'guilds'],
        },
        (accessToken, refreshToken, profile, done) => {
            process.nextTick(() => done(null, profile));
        }
    )
);

// ===============================
// ROTAS WEB
// ===============================
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
};

app.get('/', (req, res) => {
    res.status(200).send(client.isReady() ? `✅ Bot online. Ping: ${client.ws.ping}ms` : '⏳ Bot iniciando...');
});

app.get('/login', passport.authenticate('discord', { scope: ['identify', 'guilds'] }));
app.get(
    '/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    (req, res) => res.redirect('/dashboard')
);
app.get('/logout', (req, res, next) => req.logout(() => res.redirect('/')));

// Rota de Seleção de Servidor
app.get('/dashboard', isAuthenticated, (req, res) => {
    res.render('dashboard', { user: req.user, guilds: req.user.guilds });
});

// Rota de Configurações Gerais
app.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
    const guildId = req.params.guildId;
    const guild = client.guilds.cache.get(guildId);
    
    if (!guild) return res.status(404).send('Servidor inválido ou bot não está nele.');

    // --- Lógica de Permissão (Simplificada) ---
    const userGuild = req.user.guilds.find(g => g.id === guildId);
    if (!userGuild || !((userGuild.permissions & 0x8) === 0x8 || (userGuild.permissions & 0x20) === 0x20)) {
        return res.status(403).send('Você não tem permissão de Administrador/Gerenciar Servidor para configurar este local.');
    }
    
    // Preparação de dados (Cargos, Canais)
    const roles = guild.roles.cache.filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position);
    const textChannels = guild.channels.cache.filter(c => c.type === 0).sort((a, b) => a.position - b.position);

    // Preparação de dados do DB (Ex: Auto-Role)
    const currentAutoroleId = await db.get(`autorole_${guildId}`);
    
    // Renderiza a página
    res.render('guild_settings', { 
        user: req.user,
        guild: guild,
        roles: roles,
        textChannels: textChannels,
        currentAutoroleId: currentAutoroleId,
        activePage: 'settings' // Ativa o link "Configurações Gerais"
    });
});


// Rota de Comandos
app.get('/dashboard/:guildId/config', isAuthenticated, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).send('Servidor inválido.');
    
    const commandsList = client.commands.map(cmd => ({
        name: prefix + cmd.name,
        desc: cmd.description || 'Sem descrição.',
    }));
    
    res.render('guild_config', { 
        user: req.user, 
        guild, 
        commands: commandsList,
        activePage: 'config', // Ativa o link "Comandos"
    });
});

// Rota de Logs de Eventos
app.get('/dashboard/:guildId/events', isAuthenticated, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return res.status(404).send('Servidor inválido ou bot não está nele.');

    // Placeholder para logs. Adapte esta linha para buscar logs reais do seu DB.
    const recentLogs = [
        { type: 'INFO', message: 'Nenhuma lógica de logs implementada no DB.', timestamp: new Date() },
    ];

    res.render('guild_events', {
        user: req.user,
        guild: guild, 
        logs: recentLogs,
        activePage: 'events', // Ativa o link "Logs de Eventos"
    });
});

// Rota para salvar configurações (Simplificada)
app.post('/dashboard/:guildId/save', isAuthenticated, async (req, res) => {
    // Aqui você deve colocar a lógica para salvar os dados no QuickDB
    
    // Exemplo: Salvar Auto-Role
    if(req.body.autoroleId) {
        await db.set(`autorole_${req.params.guildId}`, req.body.autoroleId);
    }
    
    res.json({ success: true, message: 'Configurações salvas com sucesso!' });
});

// ===============================
// INICIA SERVIDOR WEB
// ===============================
app.listen(PORT, () => console.log(`🌐 Painel rodando na porta ${PORT}`));