const { Client, GatewayIntentBits, Collection, Partials, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv'); 
const { QuickDB } = require('quick.db'); 
const db = new QuickDB(); 

// REQUIRES PARA O PAINEL WEB
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;


dotenv.config(); 

// Configuração do Bot Discord
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
let commandFiles = [];
try {
    commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
} catch (error) {
    console.warn(`[AVISO] Pasta 'commands' não encontrada ou erro de leitura: ${error.message}.`);
}


for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    try {
        const command = require(filePath);
        
        if ('name' in command && 'execute' in command) {
            client.commands.set(command.name, command);
        } else {
            console.warn(`[AVISO] O comando em ${filePath} está faltando a propriedade "name" ou "execute" necessária.`);
        }
    } catch (error) {
        console.error(`[ERRO NO COMANDO] Não foi possível carregar ${file}:`, error);
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
// FUNÇÕES AUXILIARES DE NOTIFICAÇÃO
// ===================================

const replacePlaceholders = (text, member) => {
    if (!text) return null;
    return text
        .replace(/{user}/g, member.user.tag)
        .replace(/{mention}/g, `<@${member.id}>`)
        .replace(/{guild}/g, member.guild.name)
        .replace(/{count}/g, member.guild.memberCount);
};

const buildEmbed = (embedData, member) => {
    if (!embedData || !embedData.enabled) return null;

    const embed = new EmbedBuilder();
    
    if (embedData.color) {
        embed.setColor(parseInt(embedData.color.replace('#', '0x'), 16)); 
    }
    
    if (embedData.authorName) embed.setAuthor({ 
        name: replacePlaceholders(embedData.authorName, member), 
        iconURL: embedData.authorIconUrl || member.user.displayAvatarURL()
    });
    if (embedData.title) embed.setTitle(replacePlaceholders(embedData.title, member));
    if (embedData.description) embed.setDescription(replacePlaceholders(embedData.description, member));
    if (embedData.imageUrl) embed.setImage(embedData.imageUrl);
    if (embedData.thumbnailUrl) embed.setThumbnail(embedData.thumbnailUrl);
    if (embedData.footerText) embed.setFooter({ 
        text: replacePlaceholders(embedData.footerText, member), 
        iconURL: embedData.footerIconUrl || member.guild.iconURL()
    });
    
    embed.setTimestamp();
    
    return embed;
};

// Envia a mensagem (Texto, Embed, ou Ambos)
const sendMessage = async (target, text, embed) => {
    const payload = {};

    if (text) {
        payload.content = text;
    }
    if (embed) {
        payload.embeds = [embed];
    }

    if (!payload.content && !payload.embeds) return;
    
    await target.send(payload);
};


// ===================================
// 3. EVENTO: MEMBRO ENTRA (AUTO-ROLE, NOTIFICAÇÃO E DM)
// ===================================
client.on('guildMemberAdd', async member => {
    
    // --- LÓGICA AUTO-ROLE ---
    const roleId = await db.get(`autorole_${member.guild.id}`);
    
    if (roleId && roleId !== 'none') {
        try {
            const role = member.guild.roles.cache.get(roleId);
            if (role && role.position < member.guild.members.me.roles.highest.position) {
                await member.roles.add(role, 'Auto-Role configurado via Painel Web.');
            }
        } catch (error) {
            console.error(`[ERRO AUTO-ROLE] Não foi possível dar o cargo ao membro ${member.user.tag}:`, error);
        }
    }

    // --- LÓGICA NOTIFICAÇÃO DE ENTRADA (CANAL) ---
    const joinData = await db.get(`join_notif_${member.guild.id}`);
    if (joinData && joinData.channelId && joinData.channelId !== 'none') {
        const channel = member.guild.channels.cache.get(joinData.channelId);
        
        if (channel) {
            const finalEmbed = buildEmbed(joinData.embed, member);
            const finalText = replacePlaceholders(joinData.text, member);

            try {
                await sendMessage(channel, finalText, finalEmbed);
            } catch (error) {
                console.error(`Erro ao enviar mensagem de entrada em ${member.guild.name}:`, error);
            }
        }
    }
    
    // --- LÓGICA MENSAGEM DE DM ---
    const dmData = await db.get(`dm_notif_${member.guild.id}`);

    if (dmData) {
        const finalEmbed = buildEmbed(dmData.embed, member);
        const finalText = replacePlaceholders(dmData.text, member);

        try {
            await sendMessage(member, finalText, finalEmbed);
        } catch (error) {
             // Ignora o erro se o usuário tiver DMs desativadas
        }
    }
});


// ===================================
// 4. EVENTO: MEMBRO SAI (NOTIFICAÇÃO)
// ===================================
client.on('guildMemberRemove', async member => {
    
    // --- LÓGICA NOTIFICAÇÃO DE SAÍDA (CANAL) ---
    const leaveData = await db.get(`leave_notif_${member.guild.id}`);

    if (leaveData && leaveData.channelId && leaveData.channelId !== 'none') {
        const channel = member.guild.channels.cache.get(leaveData.channelId);
        
        if (channel) {
            const finalEmbed = buildEmbed(leaveData.embed, member);
            const finalText = replacePlaceholders(leaveData.text, member);

            try {
                await sendMessage(channel, finalText, finalEmbed);
            } catch (error) {
                console.error(`Erro ao enviar mensagem de saída em ${member.guild.name}:`, error);
            }
        }
    }
});


// ===================================
// 5. EVENTO: MENSAGEM RECEBIDA (COMANDOS E AFK)
// ===================================
client.on('messageCreate', async message => {
    
    if (message.author.bot) return;

    // --- VERIFICAÇÃO DE AFK (Retorno) ---
    const guildId = message.guild.id;
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
        console.error(`[ERRO DE EXECUÇÃO] Comando ${commandName}:`, error);
        message.reply('❌ Ocorreu um erro ao tentar executar este comando!');
    }
});


// ===================================
// 6. LOGIN DO BOT (Discord)
// ===================================

client.login(process.env.TOKEN_BOT); 


// ===================================
// 7. SERVIDOR WEB PARA RENDER (Painel e Ping 24/7)
// ===================================
const app = express();
const PORT = process.env.PORT || 3000;

// Configuração do EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.engine('ejs', require('ejs').__express); // <--- CORREÇÃO CRÍTICA DO EJS

// Serve arquivos estáticos da pasta 'public' (CSS, imagens)
app.use(express.static('public')); // <--- PARA O SEU CSS FUNCIONAR


// Middleware para processar dados JSON no POST
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// Configuração da Sessão
app.use(session({
    secret: process.env.SESSION_SECRET || 'uma-chave-secreta-forte-e-aleatoria-criada-por-voce', 
    resave: false,
    saveUninitialized: false,
}));

// Inicializa Passport
app.use(passport.initialize());
app.use(passport.session());

// --- Configuração do Discord OAuth2 ---
const CLIENT_ID = process.env.CLIENT_ID_BOT; 
const CLIENT_SECRET = process.env.CLIENT_SECRET_BOT; 
const CALLBACK_URL = process.env.CALLBACK_URL; 

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new DiscordStrategy({
    clientID: CLIENT_ID,
    clientSecret: CLIENT_SECRET, 
    callbackURL: CALLBACK_URL,
    scope: ['identify', 'guilds']
},
(accessToken, refreshToken, profile, done) => {
    process.nextTick(() => done(null, profile));
}));

// --- Rotas do Site ---

// Middleware de Autenticação
const isAuthenticated = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    if (req.method === 'POST') {
        return res.status(401).json({ success: false, message: 'Sua sessão expirou. Faça login novamente.' });
    }
    res.redirect('/login');
};

// Rota de Login 
app.get('/login', passport.authenticate('discord', { scope: ['identify', 'guilds'] }));

// Rota de Callback 
app.get('/callback', passport.authenticate('discord', {
    failureRedirect: '/'
}), (req, res) => {
    res.redirect('/dashboard');
});

// Rota de Logout
app.get('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) { return next(err); }
        res.redirect('/');
    });
});

// Rota Principal (Ping de Estabilidade 24/7)
app.get('/', (req, res) => {
    if (client.isReady()) {
        res.status(200).send(`✅ Bot Discord está online. Ping: ${client.ws.ping}ms.`);
    } else {
        res.status(503).send('Bot está iniciando...');
    }
});

// Rota do Painel (Requer login)
app.get('/dashboard', isAuthenticated, (req, res) => {
    res.render('dashboard', { 
        user: req.user,
        client: client,
        db: db,
        guilds: req.user.guilds 
    });
});

// ===============================================
// Rota de Configurações (Comandos)
// ===============================================
app.get('/dashboard/:guildId/config', isAuthenticated, async (req, res) => {
    const guildId = req.params.guildId;
    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
        return res.status(404).send('Bot não está neste servidor ou servidor inválido.');
    }
    
    // Mapeia comandos para o EJS
    const commandsList = client.commands.map(cmd => ({
        name: `${prefix}${cmd.name}`,
        description: cmd.description || 'Nenhuma descrição fornecida.',
        usage: cmd.usage || `${prefix}${cmd.name}` 
    }));
    
    if (commandsList.length === 0) {
        commandsList.push({
            name: 'Nenhum comando encontrado',
            description: 'Verifique se a pasta /commands existe e se os arquivos .js estão carregados corretamente.',
            usage: 'N/A'
        });
    }

    res.render('guild_config', { 
        user: req.user,
        guild: guild,
        commands: commandsList,
        activePage: 'config' // ATIVAR MENU
    });
});

// ===============================================
// Rota de Event Logs (Simples)
// ===============================================
app.get('/dashboard/:guildId/events', isAuthenticated, async (req, res) => {
    const guildId = req.params.guildId;
    const guild = client.guilds.cache.get(guildId);

    if (!guild) {
        return res.status(404).send('Bot não está neste servidor ou servidor inválido.');
    }
    
    // Placeholder para logs.
    const recentLogs = [
        { type: 'INFO', message: 'Nenhuma lógica de logs implementada no DB.', timestamp: new Date() },
        { type: 'WARNING', message: 'Você precisa armazenar logs de eventos no QuickDB para exibi-los aqui.', timestamp: new Date() },
    ];

    res.render('guild_events', { 
        user: req.user,
        guild: guild,
        logs: recentLogs,
        activePage: 'events' // ATIVAR MENU
    });
});
// ===============================================


// Rota de Configuração por Servidor (guild_settings)
app.get('/dashboard/:guildId', isAuthenticated, async (req, res) => {
    const guildId = req.params.guildId;
    
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
        return res.status(404).send('Bot não está neste servidor ou servidor inválido.');
    }
    
    const userGuild = req.user.guilds.find(g => g.id === guildId);
    if (!userGuild || !((userGuild.permissions & 0x8) === 0x8 || (userGuild.permissions & 0x20) === 0x20)) {
        return res.status(403).send('Você não tem permissão de Administrador/Gerenciar Servidor neste local.');
    }

    // Obter dados do servidor
    const roles = guild.roles.cache
        .filter(r => r.id !== guild.id)
        .sort((a, b) => b.position - a.position);
        
    const textChannels = guild.channels.cache
        .filter(c => c.type === 0) 
        .sort((a, b) => a.position - b.position);

    // Obter configurações atuais
    const currentAutoroleId = await db.get(`autorole_${guildId}`);
    
    const defaultEmbed = { enabled: false, color: '#7289da', authorName: null, authorIconUrl: null, title: null, description: null, imageUrl: null, thumbnailUrl: null, footerText: null, footerIconUrl: null };
    
    const joinData = await db.get(`join_notif_${guildId}`) || {};
    const leaveData = await db.get(`leave_notif_${guildId}`) || {};
    const dmData = await db.get(`dm_notif_${guildId}`) || {};


    const joinNotif = { 
        channelId: joinData.channelId || 'none', 
        text: joinData.text || 'Boas-vindas, {mention}! Temos agora {count} membros!', 
        embed: joinData.embed || defaultEmbed 
    };
    
    const leaveNotif = { 
        channelId: leaveData.channelId || 'none', 
        text: leaveData.text || 'Adeus, {user}! Sentiremos sua falta.', 
        embed: leaveData.embed || { ...defaultEmbed, color: '#e74c3c' } 
    };
    
    const dmNotif = { 
        text: dmData.text || 'Obrigado por entrar em {guild}!', 
        embed: dmData.embed || { ...defaultEmbed, color: '#2ecc71' } 
    };

    res.render('guild_settings', { 
        user: req.user,
        guild: guild,
        roles: roles,
        textChannels: textChannels,
        currentAutoroleId: currentAutoroleId,
        joinNotif: joinNotif,
        leaveNotif: leaveNotif,
        dmNotif: dmNotif,
        client: client,
        activePage: 'settings' // ATIVAR MENU
    });
});

// ===================================
// ROTAS POST: SALVAR E TESTAR (Omitidas por espaço, use o código anterior para elas)
// ===================================

// Ouve na porta
app.listen(PORT, () => {
    console.log(`✅ Servidor Web do Render iniciado na porta ${PORT} para o Painel.`);
});