const { PermissionsBitField, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'embedcreate',
    description: 'Cria um Embed personalizado com título e descrição.',
    category: 'Utilidade',
    data: new SlashCommandBuilder()
        .setName('embedcreate')
        .setDescription('Cria um Embed personalizado.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addStringOption(opt => opt.setName('titulo').setDescription('Título do embed').setRequired(true))
        .addStringOption(opt => opt.setName('descricao').setDescription('Descrição do embed').setRequired(true))
        .addStringOption(opt => opt.setName('rodape').setDescription('Texto do rodapé (opcional)').setRequired(false)),

    async execute(message, args) {
        // 1. CHECAGEM DE PERMISSÕES DO AUTOR
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply({ content: '❌ Você não tem permissão para criar embeds. Permissão necessária: **Gerenciar Canais**.', ephemeral: true });
        }

        let title, description, footerText;

        if (message.interactionOptions) {
            // Veio de um Slash Command — cada campo já chega separado, sem precisar de aspas
            title = message.interactionOptions.getString('titulo');
            description = message.interactionOptions.getString('descricao');
            footerText = message.interactionOptions.getString('rodape') || `Criado por ${message.author.tag}`;
        } else {
            // Veio do prefixo (!) — sintaxe por aspas
            const fullContent = args.join(' ');
            const parts = fullContent.split('"').filter(p => p.trim() !== '');

            if (parts.length < 2) {
                return message.reply(`⚠️ **Uso Correto:** \`!embedcreate "Título Aqui" "Descrição longa aqui" "Rodapé pequeno (Opcional)"\``);
            }

            title = parts[0].trim();
            description = parts[1].trim();
            footerText = parts[2] ? parts[2].trim() : `Criado por ${message.author.tag}`;
        }

        // 3. CRIAR O EMBED
        const customEmbed = {
            color: 0x800080, // Roxo
            title: title,
            description: description,
            timestamp: new Date().toISOString(),
            footer: {
                text: footerText,
            },
        };

        // 4. APAGAR A MENSAGEM DE COMANDO E ENVIAR O EMBED
        try {
            await message.delete(); 
        } catch (error) {
            // Ignoramos se o bot não puder apagar, mas o Embed é enviado
        }

        message.channel.send({ embeds: [customEmbed] });
    },
};