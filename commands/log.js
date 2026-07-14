const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'log',
    description: 'Mostra a última mensagem editada/apagada e a última entrada/saída de canal de voz no servidor.',
    category: 'Moderação',
    data: new SlashCommandBuilder()
        .setName('log')
        .setDescription('Mostra a última mensagem editada/apagada e a última entrada/saída de canal de voz no servidor.'),

    // ATENÇÃO: Recebe o objeto 'db' (SupabaseDB) do index.js
    async execute(message, args, client, db) {
        const guildId = message.guild.id;
        const [deleted, edited, voiceJoin, voiceLeave] = await Promise.all([
            db.get(`guild_${guildId}.last_events.message_deleted`),
            db.get(`guild_${guildId}.last_events.message_edited`),
            db.get(`guild_${guildId}.last_events.voice_join`),
            db.get(`guild_${guildId}.last_events.voice_leave`),
        ]);

        const when = (ts) => ts ? `<t:${Math.floor(ts / 1000)}:R>` : null;

        const embed = new EmbedBuilder()
            .setColor(0x818CF8)
            .setTitle('📋 Log de Atividade Recente')
            .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() || undefined })
            .setTimestamp();

        embed.addFields(
            {
                name: '🗑️ Última mensagem apagada',
                value: deleted
                    ? `**Autor:** ${deleted.author_tag}\n**Canal:** <#${deleted.channel_id}>\n**Conteúdo:** ${deleted.content}\n**Quando:** ${when(deleted.timestamp)}`
                    : '*Nenhum registro ainda.*',
            },
            {
                name: '✏️ Última mensagem editada',
                value: edited
                    ? `**Autor:** ${edited.author_tag}\n**Canal:** <#${edited.channel_id}>\n**Antes:** ${edited.old_content}\n**Depois:** ${edited.new_content}\n**Quando:** ${when(edited.timestamp)}`
                    : '*Nenhum registro ainda.*',
            },
            {
                name: '🔊 Última entrada em canal de voz',
                value: voiceJoin
                    ? `**Usuário:** ${voiceJoin.user_tag}\n**Canal:** <#${voiceJoin.channel_id}>\n**Quando:** ${when(voiceJoin.timestamp)}`
                    : '*Nenhum registro ainda.*',
                inline: true,
            },
            {
                name: '🔇 Última saída de canal de voz',
                value: voiceLeave
                    ? `**Usuário:** ${voiceLeave.user_tag}\n**Canal:** <#${voiceLeave.channel_id}>\n**Quando:** ${when(voiceLeave.timestamp)}`
                    : '*Nenhum registro ainda.*',
                inline: true,
            },
        );

        await message.reply({ embeds: [embed] });
    },
};
