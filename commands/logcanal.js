const { EmbedBuilder, SlashCommandBuilder, ChannelType } = require('discord.js');

module.exports = {
    name: 'logcanal',
    description: 'Mostra a última mensagem editada/apagada de um canal de texto, ou entrada/saída de call de um canal de voz (útil pra moderação).',
    category: 'Moderação',
    data: new SlashCommandBuilder()
        .setName('logcanal')
        .setDescription('Mostra o último registro de um canal de texto ou de voz (padrão: este canal).')
        .addChannelOption(opt => opt.setName('canal').setDescription('Canal a consultar (padrão: este canal)').addChannelTypes(ChannelType.GuildText, ChannelType.GuildVoice).setRequired(false)),

    async execute(message, args, client, db) {
        const target = message.mentions.channels?.first()
            || (args[0] && message.guild.channels.cache.get(args[0]))
            || message.channel;

        const guildId = message.guild.id;
        const isVoice = target.type === ChannelType.GuildVoice;

        const [deleted, edited, voiceJoin, voiceLeave] = await Promise.all([
            db.get(`guild_${guildId}.channel_last_events.${target.id}.message_deleted`),
            db.get(`guild_${guildId}.channel_last_events.${target.id}.message_edited`),
            isVoice ? db.get(`guild_${guildId}.channel_last_events.${target.id}.voice_join`) : null,
            isVoice ? db.get(`guild_${guildId}.channel_last_events.${target.id}.voice_leave`) : null,
        ]);

        const when = (ts) => ts ? `<t:${Math.floor(ts / 1000)}:R>` : null;
        const cb = (text) => client.codeBlock(text, 1000);

        const fields = [
            {
                name: '🗑️ Última mensagem apagada',
                value: deleted
                    ? `**Autor:** ${deleted.author_tag}  •  **Quando:** ${when(deleted.timestamp)}\n${cb(deleted.content)}`
                    : '*Nenhum registro ainda.*',
            },
        ];
        if (edited) {
            fields.push(
                { name: '✏️ Última mensagem editada (antes)', value: `**Autor:** ${edited.author_tag}  •  **Quando:** ${when(edited.timestamp)}\n${cb(edited.old_content)}` },
                { name: '✏️ Última mensagem editada (depois)', value: cb(edited.new_content) },
            );
        } else {
            fields.push({ name: '✏️ Última mensagem editada', value: '*Nenhum registro ainda.*' });
        }

        if (isVoice) {
            fields.push(
                { name: '🔊 Última entrada na call', value: voiceJoin ? `**Usuário:** ${voiceJoin.user_tag}  •  **Quando:** ${when(voiceJoin.timestamp)}` : '*Nenhum registro ainda.*' },
                { name: '🔇 Última saída da call', value: voiceLeave ? `**Usuário:** ${voiceLeave.user_tag}  •  **Quando:** ${when(voiceLeave.timestamp)}` : '*Nenhum registro ainda.*' },
            );
        }

        const embed = new EmbedBuilder()
            .setColor(0x818CF8)
            .setTitle(`📋 Log ${isVoice ? 'de Voz' : 'de Mensagens'} — #${target.name}`)
            .setTimestamp()
            .addFields(fields);

        await message.reply({ embeds: [embed] });
    },
};
