const { EmbedBuilder, PermissionsBitField, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'permban',
    description: 'Bane um usuário permanentemente (requer permissão de Banir Membros).',
    usage: '@usuario [motivo]',
    category: 'Moderação',
    data: new SlashCommandBuilder()
        .setName('permban')
        .setDescription('Bane um usuário permanentemente.')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(opt => opt.setName('usuario').setDescription('Membro a banir').setRequired(true))
        .addStringOption(opt => opt.setName('motivo').setDescription('Motivo do banimento').setRequired(false)),
    
    async execute(message, args, client, db) {
        
        // 1. Verificação de Permissão do Usuário
        if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
            return message.reply({ 
                content: '❌ Você não tem permissão para usar este comando. Permissão necessária: `Banir Membros`.', 
                ephemeral: true 
            });
        }

        const member = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        if (!member) {
            return message.reply('Por favor, mencione um usuário ou forneça o ID para banir.');
        }

        // 2. Verificação de Hierarquia (Importante para evitar crashes e abusos)
        if (member.id === message.author.id) {
            return message.reply('Você não pode se banir!');
        }
        if (member.id === client.user.id) {
            return message.reply('Eu não posso me banir!');
        }
        if (member.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
            return message.reply('Você não pode banir um usuário com cargo igual ou superior ao seu.');
        }
        if (member.roles.highest.position >= message.guild.members.me.roles.highest.position) {
            return message.reply('Eu não posso banir este usuário, pois o cargo dele é igual ou superior ao meu.');
        }

        // 3. Execução do Banimento
        const reason = args.slice(1).join(' ') || 'Banimento permanente sem motivo especificado.';
        
        try {
            await message.guild.members.ban(member.id, { reason });

            const embed = new EmbedBuilder()
                .setColor(0xFF0000)
                .setTitle('🔨 Banimento Permanente')
                .setDescription(`O usuário **${member.user.tag}** (ID: ${member.id}) foi banido permanentemente do servidor.`)
                .addFields(
                    { name: 'Moderador', value: message.author.tag, inline: true },
                    { name: 'Motivo', value: reason, inline: true }
                )
                .setTimestamp();

            message.channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Erro ao banir o usuário:', error);
            message.reply('❌ Ocorreu um erro ao tentar banir o usuário. Verifique minhas permissões.');
        }
    },
};