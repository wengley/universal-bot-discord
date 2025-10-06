const { PermissionsBitField, EmbedBuilder } = require('discord.js');
// CORREÇÃO: Usar a nova forma de importação
const { QuickDB } = require('quick.db'); 
const db = new QuickDB();

module.exports = {
    name: 'warn',
    description: 'Adiciona um aviso (warn) a um usuário e notifica ele.',
    aliases: ['aviso'],

    async execute(message, args) {
        // 1. CHECAGEM DE PERMISSÃO DO USUÁRIO
        if (!message.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
            return message.reply("❌ Você precisa da permissão **Moderar Membros** para avisar alguém.");
        }

        // 2. PEGAR ARGUMENTOS
        const target = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
        const amount = parseInt(args[1]); // 1, 2 ou 3
        const reason = args.slice(2).join(" ") || 'Sem motivo especificado.';

        if (!target) {
            return message.reply('❌ Você precisa mencionar o usuário ou fornecer o ID dele.');
        }
        if (isNaN(amount) || amount < 1 || amount > 3) {
            return message.reply('❌ A quantidade de avisos deve ser 1, 2 ou 3.');
        }
        if (target.id === message.author.id) {
            return message.reply('❌ Você não pode dar um aviso em si mesmo.');
        }

        const guildId = message.guild.id;
        const targetId = target.id;
        
        // 3. SALVAR E SOMAR O AVISO
        // Uso de await com db.get() e db.set()
        const currentWarnings = await db.get(`warnings_${guildId}_${targetId}`) || 0; 
        const newWarnings = currentWarnings + amount;
        
        await db.set(`warnings_${guildId}_${targetId}`, newWarnings);

        // 4. NOTIFICAÇÃO AO USUÁRIO (DM)
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor(0xFFD700) // Amarelo Dourado
                .setTitle('⚠️ Você Recebeu um Aviso!')
                .setDescription(`Você recebeu **${amount}** aviso(s) no servidor **${message.guild.name}**.\n\n**Motivo:** ${reason}\n**Total de Avisos:** ${newWarnings}`)
                .setTimestamp();

            await target.send({ embeds: [dmEmbed] });
        } catch (error) {
            console.log(`Não foi possível enviar DM para ${target.user.tag}.`);
        }

        // 5. NOTIFICAÇÃO NO CHAT
        const chatEmbed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setDescription(`✅ **${target.user.tag}** recebeu **${amount}** aviso(s) de ${message.author.tag}.\n\nTotal de Avisos: **${newWarnings}**\nMotivo: \`${reason}\``)
            .setTimestamp();

        message.channel.send({ embeds: [chatEmbed] });
    },
};