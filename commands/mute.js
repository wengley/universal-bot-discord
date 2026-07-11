const { PermissionsBitField, PermissionFlagsBits, EmbedBuilder, SlashCommandBuilder } = require('discord.js');

// ⚠️ Mude o nome se o seu cargo de Castigo for diferente de 'Castigo' ou 'Mutado'
const MUTE_ROLE_NAMES = ['Castigo', 'Mutado']; 

module.exports = {
    name: 'mute',
    description: 'Coloca um usuário em Castigo (Mute).',
    aliases: ['castigo'],
    category: 'Moderação',
    data: new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Coloca um usuário em Castigo (Mute).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName('usuario').setDescription('Membro a silenciar').setRequired(true)),

    async execute(message, args) {
        // 1. CHECAGEM DE PERMISSÃO DO USUÁRIO
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply("❌ Você precisa da permissão **Moderar Membros** para silenciar alguém.");
        }

        // 2. PEGAR MEMBRO
        const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        if (!target) {
            return message.reply('❌ Você precisa mencionar o usuário ou fornecer o ID dele.');
        }

        // 3. PEGAR CARGO DE MUTE
        let muteRole = message.guild.roles.cache.find(role => MUTE_ROLE_NAMES.includes(role.name));
        
        if (!muteRole) {
            return message.reply(`❌ O cargo de Castigo não foi encontrado. Crie um cargo chamado **${MUTE_ROLE_NAMES[0]}** ou **${MUTE_ROLE_NAMES[1]}**.`);
        }

        // 4. CHECAGENS DE SEGURANÇA
        if (target.id === message.author.id) {
            return message.reply('❌ Você não pode se silenciar.');
        }
        if (target.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply('❌ Não é possível silenciar administradores.');
        }
        if (target.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
            return message.reply('❌ Você não pode silenciar um usuário com cargo igual ou superior ao seu.');
        }
        if (target.roles.cache.has(muteRole.id)) {
            return message.reply('❌ Este usuário já está silenciado.');
        }

        // 5. AÇÃO: SILENCIAR
        try {
            await target.roles.add(muteRole);
            
            const muteEmbed = new EmbedBuilder()
                .setColor(0xFF4500) // Laranja avermelhado
                .setTitle('🔇 Usuário Silenciado')
                .setDescription(`✅ **${target.user.tag}** foi colocado em Castigo por ${message.author.tag}.`)
                .setTimestamp();

            message.channel.send({ embeds: [muteEmbed] });

        } catch (error) {
            console.error('Erro ao silenciar usuário:', error);
            message.reply('❌ Ocorreu um erro ao tentar silenciar o usuário. Verifique se o meu cargo está acima do cargo de Castigo.');
        }
    },
};