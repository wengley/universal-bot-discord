const { PermissionsBitField, EmbedBuilder } = require('discord.js');

// ⚠️ Mude o nome se o seu cargo de Castigo for diferente de 'Castigo' ou 'Mutado'
const MUTE_ROLE_NAMES = ['Castigo', 'Mutado']; 

module.exports = {
    name: 'unmute',
    description: 'Tira um usuário do Castigo (Unmute).',
    aliases: ['tirarcastigo'],

    async execute(message, args) {
        // 1. CHECAGEM DE PERMISSÃO DO USUÁRIO
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply("❌ Você precisa da permissão **Moderar Membros** para tirar alguém do Castigo.");
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

        // 4. CHECAGEM DE SEGURANÇA
        if (!target.roles.cache.has(muteRole.id)) {
            return message.reply('❌ Este usuário não está em Castigo.');
        }

        // 5. AÇÃO: DES-SILENCIAR
        try {
            await target.roles.remove(muteRole);
            
            const unmuteEmbed = new EmbedBuilder()
                .setColor(0x32CD32) // Verde Limão
                .setTitle('🔊 Usuário Desilenciado')
                .setDescription(`✅ **${target.user.tag}** foi tirado do Castigo por ${message.author.tag}.`)
                .setTimestamp();

            message.channel.send({ embeds: [unmuteEmbed] });

        } catch (error) {
            console.error('Erro ao des-silenciar usuário:', error);
            message.reply('❌ Ocorreu um erro ao tentar tirar o usuário do Castigo.');
        }
    },
};