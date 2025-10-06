const { EmbedBuilder } = require('discord.js');
// CORREÇÃO: Usar a nova forma de importação
const { QuickDB } = require('quick.db'); 
const db = new QuickDB();

module.exports = {
    name: 'warnlist',
    description: 'Mostra o total de avisos de um usuário.',
    aliases: ['listawarn', 'avisos'],

    async execute(message, args) {
        // 1. PEGAR MEMBRO
        const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;

        // 2. PEGAR DADOS
        const guildId = message.guild.id;
        const targetId = target.id;
        // Uso de await
        const warnings = await db.get(`warnings_${guildId}_${targetId}`) || 0; 

        // 3. RESPOSTA
        const warnlistEmbed = new EmbedBuilder()
            .setColor(0x40E0D0) // Turquesa
            .setTitle(`📜 Lista de Avisos de ${target.user.tag}`)
            .setDescription(`O usuário **${target.user.tag}** possui **${warnings}** aviso(s).`)
            .setThumbnail(target.user.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        message.channel.send({ embeds: [warnlistEmbed] });
    },
};