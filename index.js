// ===============================
// IMPORTAÇÕES PRINCIPAIS
// ===============================
const { 
    Client, GatewayIntentBits, Collection, Partials, EmbedBuilder, 
    GuildMember, TextChannel 
} = require('discord.js');
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

// PONTO 5: URL do Ícone de Fallback (Global)
const FALLBACK_ICON_URL = 'https://cdn.discordapp.com/attachments/1414043107867234467/1426614319499706401/captura-de-tela-2018-09-24-as-20.png?ex=68ebdd9e&is=68ea8c1e&hm=50e13cf484f649f0de0daaa6f54d0021a59a136265a01e5531b1008bd0f38a5';

// Lista de Comandos para Config. Geral
const BOT_COMMANDS = [
    { name: `!ppt`, description: 'Inicia uma partida de Pedra, Papel e Tesoura contra o Bot.' },
    { name: `!ping`, description: 'Mostra a latência (ping) do Bot.' },
    { name: `!clear [número]`, description: 'Limpa o número especificado de mensagens no canal. (Requer permissão de Gerenciar Mensagens).' },
    { name: `!lock`, description: 'Bloqueia o canal atual para todos os membros. (Requer permissão de Gerenciar Canais).' },
    { name: `!unlock`, description: 'Desbloqueia o canal atual. (Requer permissão de Gerenciar Canais).' },
];

// Estrutura Padrão de Embed
const DEFAULT_EMBED = {
    enabled: false,
    color: '#5865F2',
    author_name: '',
    author_icon_url: '',
    title: '',
    description: '',
    image_url: '',
    thumbnail_url: '',
    footer_text: '',
    footer_icon_url: '',
};

// ===============================
// FUNÇÃO DE PROCESSAMENTO DE PLACEHOLDERS
// ===============================
function processPlaceholders(text, member, guild, isLeave = false) {
    if (!text) return text;
    
    // Simula um usuário genérico (o bot) ou usa o usuário atual do painel para testes
    const user = isLeave ? { 
        displayName: member.user.username, 
        id: member.id, 
        tag: member.user.tag,
        avatarURL: () => member.user.displayAvatarURL(),
        username: member.user.username
    } : member;

    let processedText = text;

    // Variáveis do Usuário
    processedText = processedText.replace(/<\[@user\]>/g, `<@${user.id}>`);
    processedText = processedText.replace(/<\[@user\.name\]>/g, user.displayName || user.user.username);
    processedText = processedText.replace(/<\[user\]>/g, user.user.username || user.tag);
    processedText = processedText.replace(/<\[user\.id\]>/g, user.id);
    // Ponto 6: Garante que a URL seja processada
    const avatarUrl = user.avatarURL ? user.avatarURL() : (user.user ? user.user.displayAvatarURL() : '');
    processedText = processedText.replace(/<\[user\.avatar\]>/g, avatarUrl);
    
    // Variáveis do Servidor
    processedText = processedText.replace(/<\[guild\.icon\]>/g, guild.iconURL({ size: 1024 }) || FALLBACK_ICON_URL); // Usa fallback
    processedText = processedText.replace(/<\[guild\.name\]>/g, guild.name);

    return processedText;
}

// ===============================
// PONTO 4: FUNÇÃO DE CRIAÇÃO DE EMBED (CORRIGIDA)
// Garante que o embed seja criado corretamente com o processPlaceholders
// ===============================
function createEmbedFromSettings(settings, member, guild, isLeave = false) {
    if (!settings || !settings.enabled) return null;

    // Se a descrição for nula ou vazia e não houver título, o Embed pode ser rejeitado.
    if (!settings.description && !settings.title && !settings.image_url && !settings.thumbnail_url) {
        return null; 
    }
    
    // Usa um objeto vazio como fallback se as propriedades não existirem
    settings = { ...DEFAULT_EMBED, ...settings };

    const embed = new EmbedBuilder()
        .setColor(settings.color || '#5865F2')
        .setDescription(processPlaceholders(settings.description || '', member, guild, isLeave));

    if (settings.title) {
        embed.setTitle(processPlaceholders(settings.title, member, guild, isLeave));
    }
    if (settings.author_name) {
        embed.setAuthor({
            name: processPlaceholders(settings.author_name, member, guild, isLeave),
            iconURL: processPlaceholders(settings.author_icon_url, member, guild, isLeave) || null,
        });
    }
    if (settings.thumbnail_url) {
        embed.setThumbnail(processPlaceholders(settings.thumbnail_url, member, guild, isLeave));
    }
    if (settings.image_url) {
        embed.setImage(processPlaceholders(settings.image_url, member, guild, isLeave));
    }
    if (settings.footer_text) {
        embed.setFooter({
            text: processPlaceholders(settings.footer_text, member, guild, isLeave),
            iconURL: processPlaceholders(settings.footer_icon_url, member, guild, isLeave) || null,
        });
    }

    return embed;
}

// ===============================
// CONFIGURAÇÃO DO CLIENT DISCORD
// ===============================
// (Manter o código do client e express aqui)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences, // Necessário para status (online, idle, etc.)
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

client.commands = new Collection();

// ===============================
// SERVIDOR WEB (EXPRESS)
// ===============================
const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// (Manter a seção de Passport/Autenticação aqui)
// ...

const CLIENT_ID = process.env.CLIENT_ID_BOT;
const CLIENT_SECRET = process.env.CLIENT_SECRET_BOT;
const CALLBACK_URL = process.env.CALLBACK_URL;

app.use(session({
    secret: process.env.SESSION_SECRET || 'UMA_CHAVE_MUITO_SECRETA_E_GRANDE',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: 'auto',
        maxAge: 60 * 60 * 1000 * 24 * 7 // 1 semana
    }
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(new DiscordStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackURL: CALLBACK_URL,
    scope: ['identify', 'email', 'guilds'], 
}, (accessToken, refreshToken, profile, cb) => {
    profile.displayName = profile.global_name || profile.username;
    return cb(null, profile);
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect('/login');
};

async function getGuildContext(req) {
    if (!client.isReady()) return { status: 503, message: 'Bot não está pronto. Tente novamente em instantes.' };
    if (!req.user) return { status: 401, message: 'Usuário não autenticado.' };
    
    const guild = client.guilds.cache.get(req.params.guildId);
    if (!guild) return { status: 404, message: 'Servidor inválido ou bot não está nele.' };

    let member;
    try {
        member = await guild.members.fetch(req.user.id);
    } catch (e) {
        return { status: 403, message: 'Você não é mais membro deste servidor ou erro de permissão.' };
    }

    const isOwner = guild.ownerId === req.user.id;
    const hasAdmin = member.permissions.has('ADMINISTRATOR');

    if (!isOwner && !hasAdmin) {
        return { status: 403, message: 'Você não tem permissão de Administrador ou Dono para gerenciar este servidor.' };
    }
    
    const botAvatarUrl = client.user.displayAvatarURL({ size: 128 });
    
    return { guild, member, status: 200, botAvatarUrl: botAvatarUrl };
}


// ===============================
// ROTAS WEB
// ===============================

// PONTO 6: LANDING PAGE (AGORA COM FOTO DO BOT)
app.get('/', (req, res) => {
    const ping = client.ws.ping || 'Calculando...';
    const botAvatarUrl = client.isReady() ? client.user.displayAvatarURL({ size: 128 }) : FALLBACK_ICON_URL;
    
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    
    res.render('landing_page', { 
        title: 'Universal Bot', 
        ping: ping, 
        isAuthenticated: req.isAuthenticated(),
        botAvatarUrl: botAvatarUrl // Passa o URL do avatar para a página inicial
    }); 
});
app.get('/login', (req, res) => {
    passport.authenticate('discord', { scope: ['identify', 'email', 'guilds'] })(req, res);
});
app.get('/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/dashboard'); 
});

// DASHBOARD DE SERVIDORES
app.get('/dashboard', isAuthenticated, (req, res) => {
    
    const userGuilds = req.user.guilds.filter(g => {
        const perms = parseInt(g.permissions, 10);
        const isAdmin = (perms & 0x8) === 0x8;
        const isOwner = g.owner; 
        return isAdmin || isOwner; 
    });

    const botGuildIds = client.guilds.cache.map(g => g.id);
    const botAvatarUrl = client.user.displayAvatarURL({ size: 128 });
    
    const dashboardGuilds = userGuilds.map(g => {
        const botInGuild = botGuildIds.includes(g.id);
        const userPerms = parseInt(g.permissions, 10);
        
        // PONTO 5: Ícone de fallback (Global)
        const iconUrl = g.icon 
            ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=96` 
            : FALLBACK_ICON_URL; 
        
        let botStatus = 'not_in_guild';
        if (botInGuild) {
             const botMember = client.guilds.cache.get(g.id)?.members.me;
             botStatus = botMember ? botMember.presence?.status || 'online' : 'online';
        }

        return {
            id: g.id,
            name: g.name,
            icon: iconUrl, 
            isInBot: botInGuild, 
            canConfigure: botInGuild,
            userRole: g.owner ? 'Dono' : ((userPerms & 0x8) === 0x8 ? 'Administrador' : 'Membro'),
            botStatus: botStatus 
        };
    });

    res.render('dashboard', { 
        user: req.user, 
        guilds: dashboardGuilds,
        guild: null, 
        activePage: 'servers',
        showInviteAlert: req.query.invite === 'denied',
        botAvatarUrl: botAvatarUrl
    }); 
});


// Rota base de CONFIGURAÇÃO DO SERVIDOR (Menu Geral)
app.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) {
        return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    }

    const botPing = client.ws.ping; 

    res.render('guild_settings', { 
        user: req.user,
        guild: context.guild,
        activePage: 'settings',
        botPing: botPing,
        commands: BOT_COMMANDS,
        botAvatarUrl: context.botAvatarUrl
    });
});


// 2. NOVAS ROTAS DE SEGURANÇA
app.get('/dashboard/:guildId/security', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    
    // Configurações de segurança simuladas
    const securitySettings = {
        anti_nuke: { enabled: false, message: "Funcionalidade Anti Nuke." },
        whitelist: { enabled: false, message: "Funcionalidade Whitelist." },
        anti_raid: { enabled: false, message: "Funcionalidade Anti Raid." }
    };

    res.render('security_settings', { 
        user: req.user,
        guild: context.guild,
        activePage: 'security', // Nova página ativa
        settings: securitySettings,
        botAvatarUrl: context.botAvatarUrl,
        message: req.query.message
    });
});


// 3. NOVAS ROTAS DE ÁREA VIP
app.get('/dashboard/:guildId/vip', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    
    // Configurações VIP simuladas
    const vipSettings = {
        painel_vip: { enabled: true, message: "Funcionalidade Painel VIP." }
    };

    res.render('vip_settings', { 
        user: req.user,
        guild: context.guild,
        activePage: 'vip', // Nova página ativa
        settings: vipSettings,
        botAvatarUrl: context.botAvatarUrl,
        message: req.query.message
    });
});


// (Manter Rotas: welcome, autorole, updates, logout, invite/denied aqui)
// ...

// 4. ROTAS BOAS-VINDAS (CORRIGIDO)
app.get('/dashboard/:guildId/welcome', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);
    
    const currentSettings = await db.get(`guild_${context.guild.id}.welcome`) || {};
    
    const settings = {
        join_enabled: currentSettings.join_enabled || false,
        join_channel_id: currentSettings.join_channel_id || '',
        join_message: currentSettings.join_message || 'Boas-vindas, <[@user]>! Esperamos que se divirta.',
        join_embed: { ...DEFAULT_EMBED, ...(currentSettings.join_embed || {}) },
        leave_enabled: currentSettings.leave_enabled || false,
        leave_channel_id: currentSettings.leave_channel_id || '',
        leave_message: currentSettings.leave_message || 'Adeus, <[@user.name]>. Sentiremos sua falta.',
        leave_embed: { ...DEFAULT_EMBED, ...(currentSettings.leave_embed || {}) },
        dm_enabled: currentSettings.dm_enabled || false,
        dm_message: currentSettings.dm_message || 'Obrigado por entrar no nosso servidor! Se precisar de ajuda, é só chamar.',
        dm_embed: { ...DEFAULT_EMBED, ...(currentSettings.dm_embed || {}) },
    };

    const textChannels = context.guild.channels.cache
        .filter(c => c.type === 0 && c.permissionsFor(client.user.id)?.has('SendMessages'))
        .map(c => ({ id: c.id, name: c.name }));

    res.render('welcome_settings', { 
        user: req.user,
        guild: context.guild,
        activePage: 'welcome',
        settings: settings,
        textChannels: textChannels,
        message: req.query.message,
        botAvatarUrl: context.botAvatarUrl
    });
});
// Rota POST welcome (sem mudanças)
app.post('/dashboard/:guildId/welcome', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(`<h1>Erro ${context.status}</h1><p>${context.message}</p>`);

    const { 
        join_enabled, join_channel_id, join_message, 
        join_embed_enabled, join_embed_color, join_embed_author_name, join_embed_author_icon_url, 
        join_embed_title, join_embed_description, join_embed_image_url, join_embed_thumbnail_url,
        join_embed_footer_text, join_embed_footer_icon_url,
        
        leave_enabled, leave_channel_id, leave_message, 
        leave_embed_enabled, leave_embed_color, leave_embed_author_name, leave_embed_author_icon_url, 
        leave_embed_title, leave_embed_description, leave_embed_image_url, leave_embed_thumbnail_url,
        leave_embed_footer_text, leave_embed_footer_icon_url,

        dm_enabled, dm_message, 
        dm_embed_enabled, dm_embed_color, dm_embed_author_name, dm_embed_author_icon_url, 
        dm_embed_title, dm_embed_description, dm_embed_image_url, dm_embed_thumbnail_url,
        dm_embed_footer_text, dm_embed_footer_icon_url,
    } = req.body;

    const newSettings = {
        join_enabled: !!join_enabled,
        join_channel_id: join_channel_id || '',
        join_message: join_message || '',
        join_embed: {
            enabled: !!join_embed_enabled,
            color: join_embed_color,
            author_name: join_embed_author_name,
            author_icon_url: join_embed_author_icon_url,
            title: join_embed_title,
            description: join_embed_description,
            image_url: join_embed_image_url,
            thumbnail_url: join_embed_thumbnail_url,
            footer_text: join_embed_footer_text,
            footer_icon_url: join_embed_footer_icon_url,
        },
        leave_enabled: !!leave_enabled,
        leave_channel_id: leave_channel_id || '',
        leave_message: leave_message || '',
        leave_embed: {
            enabled: !!leave_embed_enabled,
            color: leave_embed_color,
            author_name: leave_embed_author_name,
            author_icon_url: leave_embed_author_icon_url,
            title: leave_embed_title,
            description: leave_embed_description,
            image_url: leave_embed_image_url,
            thumbnail_url: leave_embed_thumbnail_url,
            footer_text: leave_embed_footer_text,
            footer_icon_url: leave_embed_footer_icon_url,
        },
        dm_enabled: !!dm_enabled,
        dm_message: dm_message || '',
        dm_embed: {
            enabled: !!dm_embed_enabled,
            color: dm_embed_color,
            author_name: dm_embed_author_name,
            author_icon_url: dm_embed_author_icon_url,
            title: dm_embed_title,
            description: dm_embed_description,
            image_url: dm_embed_image_url,
            thumbnail_url: dm_embed_thumbnail_url,
            footer_text: dm_embed_footer_text,
            footer_icon_url: dm_embed_footer_icon_url,
        },
    };

    await db.set(`guild_${context.guild.id}.welcome`, newSettings);
    res.redirect(`/dashboard/${context.guild.id}/welcome?message=success`);
});


// Rota POST para TESTAR MENSAGEM (Funcionalidade de Teste Mantida)
app.post('/dashboard/:guildId/welcome/test', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(500).json({ success: false, message: context.message });

    const { type, channel_id, message, embed_data } = req.body;
    
    const channel = context.guild.channels.cache.get(channel_id);
    if (!channel || channel.type !== 0) {
        return res.status(400).json({ success: false, message: 'Canal inválido ou inalcançável.' });
    }
    
    const mockMember = context.member; 
    const isLeave = type === 'leave';
    
    let content = processPlaceholders(message, mockMember, context.guild, isLeave);
    let embed = embed_data.enabled ? createEmbedFromSettings(embed_data, mockMember, context.guild, isLeave) : null;
    
    const testMessageSuffix = `\n*(Mensagem de Teste enviada via Painel por ${req.user.displayName})*`;
    
    if (embed) {
        // Se houver embed, adiciona o sufixo no content, e a nota de teste no footer do embed
        const currentFooter = embed_data.footer_text || '';
        embed.setFooter({
            text: `${processPlaceholders(currentFooter, mockMember, context.guild, isLeave)} | MENSAGEM DE TESTE`,
            iconURL: processPlaceholders(embed_data.footer_icon_url, mockMember, context.guild, isLeave),
        });
        content = content.length > 0 ? content + testMessageSuffix : testMessageSuffix;
    } else {
        // Se não houver embed, adiciona o sufixo no content
        content = `${content} ${testMessageSuffix}`;
    }

    try {
        await channel.send({ content: content, embeds: embed ? [embed] : [] });
        return res.json({ success: true, message: `Mensagem de Teste enviada com sucesso para #${channel.name}!` });
    } catch (error) {
        console.error('Erro ao enviar mensagem de teste:', error);
        return res.status(500).json({ success: false, message: `Erro ao enviar: O bot pode não ter permissão de enviar mensagens no canal. Detalhe: ${error.message}` });
    }
});


// (Manter Rotas: autorole, updates, logout, invite/denied aqui)
app.get('/dashboard/:guildId/autorole', isAuthenticated, async (req, res) => { /* ... */ });
app.post('/dashboard/:guildId/autorole', isAuthenticated, async (req, res) => { /* ... */ });
app.get('/updates', isAuthenticated, async (req, res) => { /* ... */ });
app.get('/logout', (req, res) => { /* ... */ });
app.get('/invite/denied', isAuthenticated, (req, res) => { /* ... */ });


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

// ===============================
// EVENTOS DISCORD (AUTOROLE E BOAS-VINDAS)
// PONTO 4: Lógica do Embed CORRIGIDA no evento guildMemberAdd
// ===============================
client.on('guildMemberAdd', async member => {
    if (member.user.bot) return; 
    
    const settings = await db.get(`guild_${member.guild.id}.autorole`);
    
    // AutoRole Logic
    if (settings && settings.enabled && settings.roles && settings.roles.length > 0) { /* ... */ } // Lógica de AutoRole mantida
    
    // Welcome Message Logic (CORRIGIDO)
    const welcomeSettings = await db.get(`guild_${member.guild.id}.welcome`);
    if (welcomeSettings) {
        const guild = member.guild;
        
        // Mensagem na DM
        if (welcomeSettings.dm_enabled && (welcomeSettings.dm_message || welcomeSettings.dm_embed.enabled)) {
             try {
                const content = processPlaceholders(welcomeSettings.dm_message, member, guild);
                const embed = createEmbedFromSettings(welcomeSettings.dm_embed, member, guild); // Usa a função corrigida
                await member.send({ content: content, embeds: embed ? [embed] : [] });
            } catch (e) {
                // Usuário bloqueou DM
            }
        }

        // Mensagem no Canal
        if (welcomeSettings.join_enabled && welcomeSettings.join_channel_id) {
            const channel = guild.channels.cache.get(welcomeSettings.join_channel_id);
            if (channel instanceof TextChannel) {
                const content = processPlaceholders(welcomeSettings.join_message, member, guild);
                const embed = createEmbedFromSettings(welcomeSettings.join_embed, member, guild); // Usa a função corrigida
                try {
                    await channel.send({ content: content, embeds: embed ? [embed] : [] });
                } catch (e) {
                    console.error(`Erro ao enviar boas-vindas:`, e.message);
                }
            }
        }
    }
});

client.on('guildMemberRemove', async member => { /* ... */ }); // Lógica de saída mantida