const { PermissionsBitField, PermissionFlagsBits, EmbedBuilder, SlashCommandBuilder } = require('discord.js');

module.exports = {
    name: 'clear',
    aliases: ['limpar'], // Adiciona um alias para o comando, se quiser
    description: 'Apaga um número específico de mensagens no canal (máx 100).',
    category: 'Moderação',
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Apaga um número de mensagens no canal (máx 100).')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(opt => opt.setName('quantidade').setDescription('Quantas mensagens apagar (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
    
    ephemeral: true, // via / o "pensando..." não vira mensagem real no canal (evita se autoapagar no bulk delete)

    async execute(message, args, client) {
        // 1. CHECAGEM DE PERMISSÕES DO AUTOR
        if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply({ content: '❌ Você não tem permissão para usar este comando. Permissão necessária: **Gerenciar Mensagens**.', ephemeral: true });
        }
        
        // 2. OBTER A QUANTIDADE
        // O argumento é o args[0]
        const amount = parseInt(args[0]);

        if (isNaN(amount) || amount <= 0 || amount > 100) {
            return message.reply('⚠️ Por favor, forneça um número de mensagens a ser apagado entre 1 e 100.');
        }

        // 3. CHECAGEM DE PERMISSÕES DO BOT
        if (!message.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply('❌ Meu bot não tem permissão para **Gerenciar Mensagens** para executar este comando. Dê a permissão ao meu cargo.');
        }

        // 4. EXECUTAR A EXCLUSÃO
        try {
            // Via ! a própria mensagem do comando conta (+1). Via / não existe
            // mensagem de comando no canal, então não soma — e o limite da
            // API do Discord nunca pode passar de 100 de qualquer forma.
            const isSlash = !!message.interactionOptions;
            const fetchLimit = Math.min(isSlash ? amount : amount + 1, 100);
            const fetched = await message.channel.messages.fetch({ limit: fetchLimit });
            await message.channel.bulkDelete(fetched, true); // O 'true' ignora mensagens com mais de 14 dias

            // 5. MENSAGEM DE CONFIRMAÇÃO (Temporária)
            const replyMessage = await message.channel.send(`✅ ${fetched.size} mensagens apagadas com sucesso.`);

            // Via / a resposta já é privada (ephemeral) — não precisa apagar.
            // Via ! é uma mensagem pública de verdade, então some em 5s.
            if (!isSlash) {
                setTimeout(() => replyMessage.delete().catch(err => console.log("Erro ao apagar mensagem de confirmação:", err)), 5000);
            }

            // Registro de Eventos: avisa no canal configurado (se ativado)
            if (client?.logEvent) {
                const embed = new EmbedBuilder().setColor(0xF59E0B)
                    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
                    .setTitle('🧹 Mensagens Limpas em Massa')
                    .addFields(
                        { name: 'Canal', value: `<#${message.channel.id}>` },
                        { name: 'Quantidade', value: `${fetched.size} mensagens` }
                    ).setTimestamp();
                await client.logEvent(message.guild, 'bulk_delete', embed);
            }

        } catch (error) {
            console.error(error);
            message.reply('❌ Ocorreu um erro ao tentar apagar as mensagens. Mensagens com mais de 14 dias não podem ser apagadas em massa.');
        }
    },
};