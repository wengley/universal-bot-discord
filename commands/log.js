const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'log',
    description: 'Mostra a última mensagem editada/apagada de um usuário específico (útil pra moderação).',
    category: 'Moderação',
    data: new SlashCommandBuilder()
        .setName('log')
        .setDescription('Mostra a última mensagem editada/apagada de um usuário.')
        .addUserOption(opt => opt.setName('usuario').setDescription('Usuário a consultar').setRequired(true)),

    async execute(message, args, client, db) {
        const target = message.mentions.members?.first() || message.guild.members.cache.get(args[0]);
        if (!target) {
            return message.reply('⚠️ Usuário não encontrado. Mencione alguém ou use o ID.');
        }

        const guildId = message.guild.id;
        const [deleted, edited] = await Promise.all([
            db.get(`guild_${guildId}.user_last_events.${target.id}.message_deleted`),
            db.get(`guild_${guildId}.user_last_events.${target.id}.message_edited`),
        ]);

        const when = (ts) => ts ? `<t:${Math.floor(ts / 1000)}:R>` : null;
        const cb = client.codeBlock;

        const embed = new EmbedBuilder()
            .setColor(0x818CF8)
            .setAuthor({ name: target.user.tag, iconURL: target.displayAvatarURL() })
            .setTitle('📋 Log de Mensagens do Usuário')
            .setTimestamp();

        embed.addFields(
            {
                name: '🗑️ Última mensagem apagada',
                value: deleted
                    ? `**Canal:** <#${deleted.channel_id}>  •  **Quando:** ${when(deleted.timestamp)}\n${cb(deleted.content)}`
                    : '*Nenhum registro ainda.*',
            },
            {
                name: '✏️ Última mensagem editada',
                value: edited
                    ? `**Canal:** <#${edited.channel_id}>  •  **Quando:** ${when(edited.timestamp)}\n**Antes:**${cb(edited.old_content)}**Depois:**${cb(edited.new_content)}`
                    : '*Nenhum registro ainda.*',
            },
        );

        await message.reply({ embeds: [embed] });
    },
};
