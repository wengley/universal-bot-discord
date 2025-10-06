const { PermissionsBitField } = require('discord.js');

module.exports = {
    name: 'embedcreate',
    description: 'Cria um Embed personalizado com título e descrição.',
    
    async execute(message, args) {
        // 1. CHECAGEM DE PERMISSÕES DO AUTOR
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply({ content: '❌ Você não tem permissão para criar embeds. Permissão necessária: **Gerenciar Canais**.', ephemeral: true });
        }
        
        // 2. SINTAXE E ARGUMENTOS (A chave aqui é a sintaxe de aspas)
        // O método mais seguro é juntar os argumentos e depois dividi-los pelas aspas (")
        const fullContent = message.content.slice(`!${this.name}`.length).trim(); 
        const parts = fullContent.split('"').filter(p => p.trim() !== '');

        if (parts.length < 2) {
            return message.reply(`⚠️ **Uso Correto:** \`!embedcreate "Título Aqui" "Descrição longa aqui" "Rodapé pequeno (Opcional)"\``);
        }

        const title = parts[0].trim();
        const description = parts[1].trim();
        const footerText = parts[2] ? parts[2].trim() : `Criado por ${message.author.tag}`;

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