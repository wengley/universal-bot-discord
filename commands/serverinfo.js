const { EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
    name: 'serverinfo',
    description: 'Mostra informações detalhadas sobre o servidor atual.',
    aliases: ['si', 'server'],
    
    async execute(message, args) {
        // Pega o objeto Guild (Servidor)
        const guild = message.guild;

        // Se o comando for executado fora de um servidor, para o
        if (!guild) {
            return message.reply('Este comando só pode ser usado em um servidor.');
        }

        // Obtendo o Dono do Servidor (Melhor forma em DJS v14/v15)
        const owner = await guild.fetchOwner();
        
        // Contagem de canais
        const channels = guild.channels.cache;
        const textChannels = channels.filter(c => c.type === ChannelType.GuildText).size;
        const voiceChannels = channels.filter(c => c.type === ChannelType.GuildVoice).size;
        const categoryChannels = channels.filter(c => c.type === ChannelType.GuildCategory).size;

        // Contagem de membros e bots
        const members = guild.members.cache.filter(member => !member.user.bot).size;
        const bots = guild.members.cache.filter(member => member.user.bot).size;

        // 1. MONTAR O EMBED
        const infoEmbed = new EmbedBuilder()
            .setColor(0x36aae6) // Azul claro
            .setTitle(`🌐 Informações do Servidor: ${guild.name}`)
            .setThumbnail(guild.iconURL({ dynamic: true }))
            .addFields(
                { name: '👑 Dono', value: `${owner.user.tag}`, inline: true },
                { name: '🆔 ID do Servidor', value: `\`${guild.id}\``, inline: true },
                { name: '📅 Criado em', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
                
                { name: '\u200B', value: '\u200B', inline: false }, // Espaçador
                
                { name: '👥 Membros', value: `**Total:** ${guild.memberCount}\n**Usuários:** ${members}\n**Bots:** ${bots}`, inline: true },
                { name: '📝 Canais', value: `**Total:** ${channels.size}\n**Texto:** ${textChannels}\n**Voz:** ${voiceChannels}\n**Categorias:** ${categoryChannels}`, inline: true },
                { name: '🏷️ Cargos', value: `**${guild.roles.cache.size}** cargos`, inline: true },
            )
            .setFooter({ text: `Solicitado por: ${message.author.tag}` })
            .setTimestamp();

        // 2. ENVIAR O EMBED
        message.channel.send({ embeds: [infoEmbed] });
    },
};