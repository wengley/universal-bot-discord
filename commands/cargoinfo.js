// commands/cargoinfo.js
const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'cargoinfo',
    description: 'Mostra informações detalhadas sobre um cargo mencionado ou pelo ID.',
    aliases: ['roleinfo', 'rinfo'],
    usage: '<@cargo | ID>',
    category: 'Informação',
    data: new SlashCommandBuilder()
        .setName('cargoinfo')
        .setDescription('Mostra informações detalhadas sobre um cargo.')
        .addRoleOption(opt => opt.setName('cargo').setDescription('Cargo a consultar').setRequired(true)),
    
    async execute(message, args, client, db) {
        
        const roleQuery = args.join(' ');
        
        if (!roleQuery) {
            return message.reply('Por favor, mencione um cargo (@cargo) ou forneça o ID do cargo.');
        }

        // Tenta encontrar o cargo por menção, ID, ou nome
        const role = message.mentions.roles.first() || 
                     message.guild.roles.cache.get(roleQuery) ||
                     message.guild.roles.cache.find(r => r.name.toLowerCase() === roleQuery.toLowerCase());

        if (!role) {
            return message.reply(`❌ Cargo não encontrado com o nome, menção ou ID: \`${roleQuery}\`.`);
        }

        // Formata as permissões em uma lista (Limitado para não exceder o limite do Embed)
        const permissions = role.permissions.toArray().map(p => `\`${p}\``).join(', ') || 'Nenhuma permissão específica.';

        const embed = new EmbedBuilder()
            .setColor(role.hexColor === '#000000' ? 0xCCCCCC : role.hexColor)
            .setTitle(`👑 Informações do Cargo: ${role.name}`)
            .addFields(
                { name: 'ID', value: `\`${role.id}\``, inline: true },
                { name: 'Cor (Hex)', value: role.hexColor, inline: true },
                { name: 'Posição', value: `${role.position}`, inline: true },
                { name: 'Mencionável', value: role.mentionable ? 'Sim' : 'Não', inline: true },
                { name: 'Separado', value: role.hoist ? 'Sim' : 'Não', inline: true },
                { name: 'Membros', value: `${role.members.size}`, inline: true },
                { name: 'Criado em', value: `<t:${Math.floor(role.createdAt.getTime() / 1000)}:f> (<t:${Math.floor(role.createdAt.getTime() / 1000)}:R>)`, inline: false },
                { name: 'Permissões Principais', value: permissions.substring(0, 1000) + (permissions.length > 1000 ? '...' : ''), inline: false } // Limita o tamanho
            )
            .setTimestamp();

        message.channel.send({ embeds: [embed] });
    },
};