const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'log',
    description: 'Mostra a última mensagem editada/apagada e entrada/saída de call de um usuário (útil pra moderação).',
    category: 'Moderação',
    data: new SlashCommandBuilder()
        .setName('log')
        .setDescription('Mostra o último registro de um usuário (mensagens e chamadas de voz).')
        .addUserOption(opt => opt.setName('usuario').setDescription('Usuário a consultar').setRequired(true)),

    async execute(message, args, client, db) {
        const target = message.mentions.members?.first() || message.guild.members.cache.get(args[0]);
        if (!target) {
            return message.reply('⚠️ Usuário não encontrado. Mencione alguém ou use o ID.');
        }

        const guildId = message.guild.id;
        const [deleted, edited, voiceJoin, voiceLeave] = await Promise.all([
            db.get(`guild_${guildId}.user_last_events.${target.id}.message_deleted`),
            db.get(`guild_${guildId}.user_last_events.${target.id}.message_edited`),
            db.get(`guild_${guildId}.user_last_events.${target.id}.voice_join`),
            db.get(`guild_${guildId}.user_last_events.${target.id}.voice_leave`),
        ]);

        const when = (ts) => ts ? `<t:${Math.floor(ts / 1000)}:R>` : null;
        const cb = (text) => client.codeBlock(text, 1000);

        const fields = [
            {
                name: '🗑️ Última mensagem apagada',
                value: deleted
                    ? `**Canal:** <#${deleted.channel_id}>  •  **Quando:** ${when(deleted.timestamp)}\n${cb(deleted.content)}`
                    : '*Nenhum registro ainda.*',
            },
        ];
        if (edited) {
            fields.push(
                { name: '✏️ Última mensagem editada (antes)', value: `**Canal:** <#${edited.channel_id}>  •  **Quando:** ${when(edited.timestamp)}\n${cb(edited.old_content)}` },
                { name: '✏️ Última mensagem editada (depois)', value: cb(edited.new_content) },
            );
        } else {
            fields.push({ name: '✏️ Última mensagem editada', value: '*Nenhum registro ainda.*' });
        }

        fields.push(
            { name: '🔊 Última entrada em call', value: voiceJoin ? `**Canal:** <#${voiceJoin.channel_id}>  •  **Quando:** ${when(voiceJoin.timestamp)}` : '*Nenhum registro ainda.*' },
            { name: '🔇 Última saída de call', value: voiceLeave ? `**Canal:** <#${voiceLeave.channel_id}>  •  **Quando:** ${when(voiceLeave.timestamp)}` : '*Nenhum registro ainda.*' },
        );

        const embed = new EmbedBuilder()
            .setColor(0x818CF8)
            .setAuthor({ name: target.user.tag, iconURL: target.displayAvatarURL() })
            .setTitle('📋 Log do Usuário')
            .setTimestamp()
            .addFields(fields);

        await message.reply({ embeds: [embed] });
    },
};
