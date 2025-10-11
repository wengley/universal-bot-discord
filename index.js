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
// FUNÇÃO DE PROCESSAMENTO DE PLACEHOLDERS (PONTO 3 - Variáveis em Embed)
// ===============================
function processPlaceholders(text, member, guild, isLeave = false) {
    if (!text) return text;
    
    // Simula um usuário genérico (o bot) ou usa o usuário atual do painel para testes
    const user = isLeave ? { 
        displayName: member.user.username, // Em caso de saída, usamos o nome simples
        id: member.id, 
        tag: member.user.tag 
    } : member;

    let processedText = text;

    // Variáveis do Usuário
    processedText = processedText.replace(/<\[@user\]>/g, `<@${user.id}>`);
    processedText = processedText.replace(/<\[@user\.name\]>/g, user.displayName || user.username);
    processedText = processedText.replace(/<\[user\]>/g, user.username || user.tag);
    processedText = processedText.replace(/<\[user\.id\]>/g, user.id);
    
    // Variáveis do Servidor
    processedText = processedText.replace(/<\[guild\.icon\]>/g, guild.iconURL({ size: 1024 }) || '');
    processedText = processedText.replace(/<\[guild\.name\]>/g, guild.name);

    return processedText;
}

// ===============================
// FUNÇÃO DE CRIAÇÃO DE EMBED
// ===============================
function createEmbedFromSettings(settings, member, guild, isLeave = false) {
    if (!settings.enabled) return null;

    const embed = new EmbedBuilder()
        .setColor(settings.color || '#5865F2')
        .setDescription(processPlaceholders(settings.description, member, guild, isLeave));

    // Processa variáveis nos outros campos
    if (settings.title) {
        embed.setTitle(processPlaceholders(settings.title, member, guild, isLeave));
    }
    if (settings.author_name) {
        embed.setAuthor({
            name: processPlaceholders(settings.author_name, member, guild, isLeave),
            iconURL: processPlaceholders(settings.author_icon_url, member, guild, isLeave),
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
            iconURL: processPlaceholders(settings.footer_icon_url, member, guild, isLeave),
        });
    }

    return embed;
}

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
// SERVIDOR WEB (EXPRESS)
// ===============================
const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// ... (Configurações de Autenticação - Passport) ...
const CLIENT_ID = process.env.CLIENT_ID_BOT;
const CLIENT_SECRET = process.env.CLIENT_SECRET_BOT;
const CALLBACK_URL = process.env.CALLBACK_URL;

app.use(session({
    secret: process.env.SESSION_SECRET || 'UMA_CHAVE_MUITO_SECRETA_E_GRANDE',
    resave: false,
    saveUninitialized: false,
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

// ===============================
// FUNÇÃO DE VERIFICAÇÃO (CRÍTICA)
// ===============================
async function getGuildContext(req) {
    if (!client.isReady()) return { status: 503, message: 'Bot não está pronto. Tente novamente em instantes.' };

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
    
    return { guild, member, status: 200 };
}


// ===============================
// ROTAS WEB
// ===============================

// 1. LANDING PAGE MELHORADA (PONTO 1)
app.get('/', (req, res) => {
    const ping = client.ws.ping || 'Calculando...';
    if (req.isAuthenticated()) return res.redirect('/dashboard');
    // Renderiza a nova landing_page.ejs
    res.render('landing_page', { 
        title: 'Universal Bot', 
        ping: ping, 
        isAuthenticated: req.isAuthenticated() 
    }); 
});
app.get('/login', (req, res) => {
    passport.authenticate('discord', { scope: ['identify', 'email', 'guilds'] })(req, res);
});
app.get('/callback', passport.authenticate('discord', { failureRedirect: '/' }), (req, res) => {
    res.redirect('/dashboard'); 
});

// ... (Restante das rotas: /logout, /dashboard, /updates, /invite/denied) ...
app.get('/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.send("Erro ao fazer logout.");
        res.redirect('/');
    });
});
app.get('/dashboard', isAuthenticated, (req, res) => {
    
    const userGuilds = req.user.guilds.filter(g => {
        const perms = parseInt(g.permissions, 10);
        const isAdmin = (perms & 0x8) === 0x8;
        const isOwner = g.owner; 
        return isAdmin || isOwner; 
    });

    const botGuildIds = client.guilds.cache.map(g => g.id);
    
    const dashboardGuilds = userGuilds.map(g => {
        const botInGuild = botGuildIds.includes(g.id);
        const userPerms = parseInt(g.permissions, 10);
        
        const canConfigure = botInGuild;

        return {
            id: g.id,
            name: g.name,
            icon: g.icon,
            isInBot: botInGuild, 
            canConfigure: canConfigure,
            userRole: g.owner ? 'Dono' : ((userPerms & 0x8) === 0x8 ? 'Administrador' : 'Membro'),
        };
    });

    res.render('dashboard', { 
        user: req.user, 
        guilds: dashboardGuilds,
        guild: null, 
        activePage: 'servers',
        showInviteAlert: req.query.invite === 'denied' 
    }); 
});
app.get('/updates', isAuthenticated, (req, res) => {
    res.render('bot_updates', { user: req.user, guild: null, activePage: 'updates' });
});
app.get('/invite/denied', isAuthenticated, (req, res) => {
    res.redirect('/dashboard?invite=denied');
});


// ===============================
// ROTAS DE CONFIGURAÇÃO FUNCIONAL
// ===============================

// ... (Rotas GET/POST para guild_settings e welcome) ...

// 3. Rota POST para TESTAR MENSAGEM (PONTO 3 - Testar Mensagem)
app.post('/dashboard/:guildId/welcome/test', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).json({ success: false, message: context.message });

    const { type, channel_id, message, embed_data } = req.body;
    
    const channel = context.guild.channels.cache.get(channel_id);
    if (!channel || channel.type !== 0) { // 0 é GUILD_TEXT
        return res.status(400).json({ success: false, message: 'Canal inválido ou inalcançável.' });
    }
    
    // Simula o membro atual (o dono/admin que está testando)
    const mockMember = context.member; 
    const isLeave = type === 'leave';
    
    let content = processPlaceholders(message, mockMember, context.guild, isLeave);
    let embed = embed_data.enabled ? createEmbedFromSettings(embed_data, mockMember, context.guild, isLeave) : null;
    
    // Adiciona o aviso de teste ao conteúdo ou embed (Rodapé)
    if (embed) {
        const currentFooter = embed_data.footer_text || '';
        embed.setFooter({
            text: `${processPlaceholders(currentFooter, mockMember, context.guild, isLeave)} | MENSAGEM DE TESTE`,
            iconURL: processPlaceholders(embed_data.footer_icon_url, mockMember, context.guild, isLeave),
        });
    } else {
        content = `**[TESTE]** ${content}`;
    }

    try {
        await channel.send({ content: content, embeds: embed ? [embed] : [] });
        return res.json({ success: true, message: `Mensagem de Teste enviada com sucesso para #${channel.name}!` });
    } catch (error) {
        console.error('Erro ao enviar mensagem de teste:', error);
        return res.status(500).json({ success: false, message: `Erro ao enviar: ${error.message}` });
    }
});


// 4. Rota POST do AUTOROLE (Garantindo Funcionalidade)
app.post('/dashboard/:guildId/autorole', isAuthenticated, async (req, res) => {
    const context = await getGuildContext(req);
    if (context.status !== 200) return res.status(context.status).send(context.message);

    const { enabled, roles = '' } = req.body;
    
    // Converte a string de IDs separada por vírgula em um array (vindo do JS do frontend)
    const rolesArray = roles.split(',').filter(id => id.length > 0);
    
    await db.set(`guild_${context.guild.id}.autorole.enabled`, !!enabled);
    await db.set(`guild_${context.guild.id}.autorole.roles`, rolesArray);

    // TESTE FUNCIONALIDADE: Implemente o evento client.on('guildMemberAdd') para dar os cargos!
    
    res.redirect(`/dashboard/${context.guild.id}/autorole?message=success`);
});


// ===============================
// INICIA O BOT E O SERVIDOR WEB
// ===============================
// ... (Código para login do bot e listen do app) ...

client.login(process.env.TOKEN_BOT);
client.once('ready', () => {
    console.log(`✅ Bot online como ${client.user.tag}`);
    app.listen(PORT, () => {
        console.log(`🌐 Painel rodando na porta ${PORT}`);
    });
});

// ===============================
// EVENTOS DISCORD (AUTOROLE FUNCIONAL)
// ===============================
client.on('guildMemberAdd', async member => {
    if (member.user.bot) return; // Ignora bots
    
    const settings = await db.get(`guild_${member.guild.id}.autorole`);
    
    if (settings && settings.enabled && settings.roles && settings.roles.length > 0) {
        try {
            // Adiciona todos os cargos configurados
            const rolesToAdd = settings.roles.filter(roleId => member.guild.roles.cache.has(roleId));
            
            if (rolesToAdd.length > 0) {
                await member.roles.add(rolesToAdd, 'AutoRole ativado via painel.');
                console.log(`[AutoRole] Cargos ${rolesToAdd.join(', ')} dados a ${member.user.tag}`);
            }
        } catch (error) {
            console.error(`[AutoRole] Erro ao adicionar cargos para ${member.user.tag}:`, error.message);
        }
    }
    
    // Lógica de Boas-Vindas de Membro
    const welcomeSettings = await db.get(`guild_${member.guild.id}.welcome`);
    if (welcomeSettings) {
        const guild = member.guild;
        // Mensagem na DM
        if (welcomeSettings.dm_enabled && (welcomeSettings.dm_message || welcomeSettings.dm_embed.enabled)) {
             try {
                const content = processPlaceholders(welcomeSettings.dm_message, member, guild);
                const embed = createEmbedFromSettings(welcomeSettings.dm_embed, member, guild);
                await member.send({ content: content, embeds: embed ? [embed] : [] });
            } catch (e) {
                // Usuário bloqueou DM
                console.log(`Não foi possível enviar DM para ${member.user.tag}`);
            }
        }

        // Mensagem no Canal
        if (welcomeSettings.join_enabled && welcomeSettings.join_channel_id) {
            const channel = guild.channels.cache.get(welcomeSettings.join_channel_id);
            if (channel instanceof TextChannel) {
                const content = processPlaceholders(welcomeSettings.join_message, member, guild);
                const embed = createEmbedFromSettings(welcomeSettings.join_embed, member, guild);
                try {
                    await channel.send({ content: content, embeds: embed ? [embed] : [] });
                } catch (e) {
                    console.error(`Erro ao enviar mensagem de boas-vindas no canal ${channel.name}:`, e.message);
                }
            }
        }
    }
});

// Evento de Saída de Membro (para o Leave Message)
client.on('guildMemberRemove', async member => {
    const welcomeSettings = await db.get(`guild_${member.guild.id}.welcome`);
    if (welcomeSettings && welcomeSettings.leave_enabled && welcomeSettings.leave_channel_id) {
        const guild = member.guild;
        const channel = guild.channels.cache.get(welcomeSettings.leave_channel_id);
        
        if (channel instanceof TextChannel) {
            // O terceiro parâmetro 'true' indica que é mensagem de saída
            const content = processPlaceholders(welcomeSettings.leave_message, member, guild, true);
            const embed = createEmbedFromSettings(welcomeSettings.leave_embed, member, guild, true);
            try {
                await channel.send({ content: content, embeds: embed ? [embed] : [] });
            } catch (e) {
                console.error(`Erro ao enviar mensagem de saída no canal ${channel.name}:`, e.message);
            }
        }
    }
});