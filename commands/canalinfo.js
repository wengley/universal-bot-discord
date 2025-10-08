// commands/canalinfo.js
const { EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
    name: 'canalinfo',
    description: 'Mostra informações detalhadas sobre o canal atual ou um canal mencionado.',
    aliases: ['channelinfo', 'cinfo'],
    usage: '[#canal]',
    
    async execute(message, args, client, db) {
        
        const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]) || message.channel;

        let type;
        switch (channel.type) {
            case ChannelType.GuildText:
                type = 'Texto';
                break;
            case ChannelType.GuildVoice:
                type = 'Voz';
                break;
            case ChannelType.GuildCategory:
                type = 'Categoria';
                break;
            case ChannelType.GuildNews:
                type = 'Anúncios';
                break;
            case ChannelType.PrivateThread:
            case ChannelType.PublicThread:
                type = 'Thread (Tópico)';
                break;
            default:
                type = 'Outro';
        }

        const embed = new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle(`📜 Informações do Canal: #${channel.name}`)
            .addFields(
                { name: 'ID', value: `\`${channel.id}\``, inline: true },
                { name: 'Tipo', value: type, inline: true },
                { name: 'Criado em', value: `<t:${Math.floor(channel.createdAt.getTime() / 1000)}:f> (<t:${Math.floor(channel.createdAt.getTime() / 1000)}:R>)`, inline: false }
            );

        if (channel.topic) {
            embed.addFields({ name: 'Tópico/Descrição', value: channel.topic, inline: false });
        }
        if (channel.parentId) {
            embed.addFields({ name: 'Categoria', value: message.guild.channels.cache.get(channel.parentId).name, inline: true });
        }
        if (channel.type === ChannelType.GuildVoice) {
            embed.addFields(
                { name: 'Limite de Usuários', value: channel.userLimit ? `${channel.userLimit}` : 'Sem limite', inline: true },
                { name: 'Bitrate', value: `${channel.bitrate / 1000} kbps`, inline: true }
            );
        }

        message.channel.send({ embeds: [embed] });
    },
};