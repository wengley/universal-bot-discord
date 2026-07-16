// utils/interactionAdapter.js
//
// Permite que UMA ÚNICA função execute(message, args, client, db) atenda
// tanto comandos de prefixo (!) quanto Slash Commands (/), sem duplicar
// nenhuma lógica de negócio. A interaction vira um objeto "parecido com
// message" (mesmos métodos que os comandos já usam), e as opções da
// interaction viram um array "args" na mesma ordem que o parser de prefixo
// já produzia.

const { MessageFlags } = require('discord.js');

function adaptInteraction(interaction) {
    let firstResponseSent = false;

    // Resolve a primeira resposta via reply/editReply (conforme o estado da
    // interaction) e qualquer resposta seguinte como uma mensagem normal no
    // canal — assim comandos que usam .reply() OU .channel.send() como
    // resposta principal funcionam do mesmo jeito.
    async function sendResponse(payload) {
        const data = typeof payload === 'string' ? { content: payload } : { ...payload };
        if (!firstResponseSent) {
            firstResponseSent = true;
            // discord.js depreciou a opção booleana `ephemeral` (usa
            // `flags: MessageFlags.Ephemeral` agora). Os comandos continuam
            // escrevendo `ephemeral: true` normalmente — só aqui, no único
            // lugar por onde toda resposta de slash passa, é que traduzimos
            // pro formato atual antes de enviar de verdade.
            if (data.ephemeral) {
                data.flags = (data.flags || 0) | MessageFlags.Ephemeral;
                delete data.ephemeral;
            }
            if (interaction.deferred) await interaction.editReply(data);
            else if (interaction.replied) await interaction.followUp(data);
            else await interaction.reply(data);
            // reply()/editReply() retornam um InteractionResponse, não uma Message completa
            // (sem .edit()/.awaitMessageComponent()). fetchReply() busca a Message de verdade,
            // necessário pra comandos como beijar.js e ppt.js que usam botões.
            return interaction.fetchReply();
        }
        return interaction.channel.send(data);
    }

    // channel.send também deve poder resolver a resposta pendente da
    // interaction (muitos comandos respondem por channel.send, não reply)
    const channelProxy = new Proxy(interaction.channel, {
        get(target, prop) {
            if (prop === 'send') return sendResponse;
            const value = target[prop];
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });

    const primaryMember = interaction.options.getMember?.('usuario') || null;
    const primaryUser = interaction.options.getUser?.('usuario') || null;
    const secondaryMember = interaction.options.getMember?.('usuario2') || null;
    const mentionedChannel = interaction.options.getChannel?.('canal') || null;
    const mentionedRole = interaction.options.getRole?.('cargo') || null;

    const fakeMessage = {
        author: interaction.user,
        member: interaction.member,
        guild: interaction.guild,
        channel: channelProxy,
        client: interaction.client,
        createdTimestamp: interaction.createdTimestamp,
        content: '',
        interactionOptions: interaction.options, // escape hatch p/ comandos com input estruturado (ex: embedcreate)
        mentions: {
            members: {
                first: () => primaryMember,
                filter: (fn) => {
                    const map = new Map();
                    [primaryMember, secondaryMember].filter(Boolean).forEach(m => { if (fn(m)) map.set(m.id, m); });
                    return map;
                },
            },
            users: { first: () => primaryUser },
            channels: { first: () => mentionedChannel },
            roles: { first: () => mentionedRole },
        },
        reply: sendResponse,
        delete: async () => {}, // Slash não tem "mensagem do comando" pra apagar
    };

    return fakeMessage;
}

// Constrói o array "args" na mesma ordem posicional que os comandos de
// prefixo já esperam, a partir das opções que a interaction recebeu.
function buildArgs(interaction) {
    const args = [];
    for (const opt of interaction.options.data) {
        if (opt.type === 6) args.push(opt.user?.id ?? ''); // USER
        else if (opt.type === 8) args.push(opt.role?.id ?? ''); // ROLE
        else if (opt.type === 7) args.push(opt.channel?.id ?? ''); // CHANNEL
        else args.push(String(opt.value ?? ''));
    }
    return args;
}

module.exports = { adaptInteraction, buildArgs };
