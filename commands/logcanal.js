const { EmbedBuilder, SlashCommandBuilder, ChannelType } = require('discord.js');

module.exports = {
    name: 'logcanal',
    description: 'Mostra a última mensagem editada/apagada em um canal específico (útil pra moderação).',
    category: 'Moderação',
    data: new SlashCommandBuilder()
        .setName('logcanal')
        .setDescription('Mostra a última mensagem editada/apagada de um canal (padrão: este canal).')
        .addChannelOption(opt => opt.setName('canal').setDescription('Canal a consultar (padrão: este canal)').addChannelTypes(ChannelType.GuildText).setRequired(false)),

    async execute(message, args, client, db) {
        const target = message.mentions.channels?.first()
            || (args[0] && message.guild.channels.cache.get(args[0]))
            || message.channel;

        const guildId = message.guild.id;
        const [deleted, edited] = await Promise.all([
            db.get(`guild_${guildId}.channel_last_events.${target.id}.message_deleted`),
            db.get(`guild_${guildId}.channel_last_events.${target.id}.message_edited`),
        ]);

        const when = (ts) => ts ? `<t:${Math.floor(ts / 1000)}:R>` : null;
        const cb = client.codeBlock;

        const embed = new EmbedBuilder()
            .setColor(0x818CF8)
            .setTitle(`📋 Log de Mensagens — #${target.name}`)
            .setTimestamp();

        embed.addFields(
            {
                name: '🗑️ Última mensagem apagada',
                value: deleted
                    ? `**Autor:** ${deleted.author_tag}  •  **Quando:** ${when(deleted.timestamp)}\n${cb(deleted.content)}`
                    : '*Nenhum registro ainda.*',
            },
            {
                name: '✏️ Última mensagem editada',
                value: edited
                    ? `**Autor:** ${edited.author_tag}  •  **Quando:** ${when(edited.timestamp)}\n**Antes:**${cb(edited.old_content)}**Depois:**${cb(edited.new_content)}`
                    : '*Nenhum registro ainda.*',
            },
        );

        await message.reply({ embeds: [embed] });
    },
};
