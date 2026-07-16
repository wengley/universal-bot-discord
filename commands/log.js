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
        const cb = (text) => '```\n' + (text || '(vazio)').slice(0, 1000) + '\n```';

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

        const embed = new EmbedBuilder()
            .setColor(0x818CF8)
            .setAuthor({ name: target.user.tag, iconURL: target.displayAvatarURL() })
            .setTitle('📋 Log de Mensagens do Usuário')
            .setTimestamp()
            .addFields(fields);

        await message.reply({ embeds: [embed] });
    },
};
