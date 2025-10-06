const { EmbedBuilder } = require('discord.js');
// CORREÇÃO: Usar a nova forma de importação
const { QuickDB } = require('quick.db'); 
const db = new QuickDB();

module.exports = {
    name: 'afk',
    description: 'Define seu status como AFK (Away From Keyboard) com um motivo.',
    aliases: ['ausente'],

    async execute(message, args) {
        // O motivo é o resto da mensagem após o !afk
        const reason = args.join(" ") || 'Sem motivo especificado.';
        const userId = message.author.id;
        const guildId = message.guild.id;

        // 1. Salva o status AFK no banco de dados
        // Uso de await
        await db.set(`afk_${guildId}_${userId}`, reason); 

        // 2. Tenta mudar o apelido (nick) do usuário para indicar que está AFK
        try {
            // Verifica se o bot pode mudar o apelido do usuário
            if (message.member.manageable && !message.member.nickname?.includes("[AFK]")) {
                let nickname = `[AFK] ${message.member.nickname || message.author.username}`;
                // Limita a 32 caracteres (limite do Discord)
                if (nickname.length > 32) {
                    nickname = nickname.slice(0, 28) + '...';
                }
                await message.member.setNickname(nickname);
            }
        } catch (error) {
            console.log(`Não foi possível mudar o nick de ${message.author.tag} (permissão ou cargo maior).`);
        }

        // 3. Resposta de confirmação
        const afkEmbed = new EmbedBuilder()
            .setColor(0x00BFFF) // Azul Ciano
            .setDescription(`✅ Você está AFK. Motivo: **${reason}**`)
            .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() });

        message.reply({ embeds: [afkEmbed] });
    },
};